// SPDX-License-Identifier: GPL-3.0-or-later
// The query client's wiring: pending changes refetched after a dirtying mutation, server data
// dropped when the session ends, retries only for network failures, never for mutations.
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { useConfigIsDirty } from "./generated/omv/config/config.ts";
import { useSessionLogin } from "./generated/omv/session/session.ts";
import { useSshSet } from "./generated/omv/ssh/ssh.ts";
import { useSystemGetInformation } from "./generated/omv/system/system.ts";
import { createRpcHandlers, type Answers } from "./mocks/handlers.ts";
import { connectQueryClient, createQueryClient } from "./query.ts";
import { createTaskRegistry } from "./tasks/registry.ts";

const server = setupServer();
const calls: string[] = [];
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  server.events.on("request:start", async ({ request }) => {
    const body = (await request.clone().json()) as {
      service: string;
      method: string;
    };
    calls.push(`${body.service}.${body.method}`);
  });
});
afterEach(() => {
  server.resetHandlers();
  calls.length = 0;
});
afterAll(() => server.close());

function setup(answers: Answers = {}) {
  server.use(...createRpcHandlers(answers));
  const queryClient = createQueryClient();
  const disconnect = connectQueryClient(queryClient, createTaskRegistry());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, disconnect, wrapper };
}

const SSH = {
  enable: true,
  port: 22,
  passwordauthentication: true,
  pubkeyauthentication: true,
  permitrootlogin: false,
  tcpforwarding: false,
  compression: false,
  extraoptions: "",
};

describe("connectQueryClient", () => {
  it("refetches the pending-changes query after a mutation marked x-omv-dirty", async () => {
    const { wrapper, disconnect } = setup();
    const { result } = renderHook(
      () => ({ dirty: useConfigIsDirty(), save: useSshSet() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.dirty.isSuccess).toBe(true));
    const before = calls.filter((c) => c === "Config.isDirty").length;
    await act(() => result.current.save.mutateAsync({ data: SSH }));
    await waitFor(() =>
      expect(calls.filter((c) => c === "Config.isDirty").length).toBe(
        before + 1,
      ),
    );
    disconnect();
  });

  it("drops all server data when the session ends", async () => {
    const { wrapper, queryClient, disconnect } = setup();
    const { result } = renderHook(() => useSystemGetInformation(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
    server.use(
      ...createRpcHandlers({
        systemGetInformation: { status: 401, message: "Session expired." },
      }),
    );
    await act(() => result.current.refetch());
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    disconnect();
  });
});

describe("createQueryClient", () => {
  it("retries a query only after a network failure, at most twice", async () => {
    const { wrapper, disconnect } = setup();
    let attempts = 0;
    server.use(
      http.post("*/rpc.php", () => {
        attempts++;
        return HttpResponse.error();
      }),
    );
    const { result } = renderHook(
      () => useSystemGetInformation({ query: { retryDelay: 0 } }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(attempts).toBe(3);
    disconnect();
  });

  it("does not retry a query the backend refused", async () => {
    const { wrapper, disconnect } = setup({
      systemGetInformation: { status: 403, message: "Invalid context role." },
    });
    const { result } = renderHook(
      () => useSystemGetInformation({ query: { retryDelay: 0 } }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls.filter((c) => c === "System.getInformation")).toHaveLength(1);
    disconnect();
  });

  it("sends a failing sign-in exactly once (UI-14)", async () => {
    const { wrapper, disconnect } = setup({ sessionLogin: "wrongPassword" });
    const { result } = renderHook(() => useSessionLogin(), { wrapper });
    await act(() =>
      result.current
        .mutateAsync({ data: { username: "example-user", password: "x" } })
        .catch(() => undefined),
    );
    expect(calls).toEqual(["Session.login"]);
    disconnect();
  });
});
