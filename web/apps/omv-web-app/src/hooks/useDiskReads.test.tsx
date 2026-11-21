// SPDX-License-Identifier: GPL-3.0-or-later
// The owner's rule, proven at the query client: a read that wakes a disk (ON_REQUEST) runs only on
// the reader's press. Nothing the query client does by itself starts it: not mounting, window focus,
// reconnecting, a pending-changes signal, a finished task (query.ts invalidates every query then),
// or coming back to the page. The pages' own tests prove the same through the interface.
import { useSmartGetInformation } from "@omv-webui/react-api-omv/generated";
import {
  connectQueryClient,
  createQueryClient,
} from "@omv-webui/react-api-omv/query";
import { createTaskRegistry } from "@omv-webui/react-api-omv/tasks";
import {
  focusManager,
  onlineManager,
  QueryClientProvider,
  type QueryClient,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { newMockSession, scenarioAnswers } from "../mocks/scenarios.ts";
import { answer, seenCalls } from "../test/server.ts";
import { ON_REQUEST } from "./useDiskReads.ts";

const DEVICE =
  "/dev/disk/by-id/nvme-VMware_Virtual_NVMe_Disk_EXAMPLE-SERIAL-0001";
const wakingCalls = () =>
  seenCalls.filter((c) => c.call === "Smart.getInformation").length;

let disconnect: (() => void) | undefined;
afterEach(() => {
  disconnect?.();
  disconnect = undefined;
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

function setUp() {
  answer(scenarioAnswers("admin", newMockSession(true)));
  const queryClient = createQueryClient();
  // A registry whose tasks end at once: a settled task is what makes query.ts invalidate everything.
  const registry = createTaskRegistry(() => Promise.resolve());
  disconnect = connectQueryClient(queryClient, registry);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, registry, wrapper };
}

const useDetails = () =>
  useSmartGetInformation({ devicefile: DEVICE }, { query: ON_REQUEST });

/** Let every timer, promise and refetch the query client might start run. */
const settle = async (queryClient: QueryClient) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
};

describe("a read that wakes a disk", () => {
  it("is not made on mount, focus, reconnect, invalidation or a finished task, only on the press", async () => {
    const { queryClient, registry, wrapper } = setUp();
    const { result, unmount } = renderHook(useDetails, { wrapper });
    await settle(queryClient);
    expect(wakingCalls()).toBe(0);
    expect(result.current.fetchStatus).toBe("idle");

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await act(() => queryClient.invalidateQueries());
    await settle(queryClient);
    expect(wakingCalls()).toBe(0);

    // The reader's press.
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(wakingCalls()).toBe(1);

    // Read once: nothing reads it again by itself, with or without the page on screen.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await act(() => queryClient.invalidateQueries());
    await settle(queryClient);
    // A task that ends (its start is refused, which settles it at once): query.ts then invalidates
    // every query.
    let settled = false;
    const off = registry.onSettled(() => {
      settled = true;
    });
    act(() => {
      registry.start("A task", () => Promise.reject(new Error("refused")));
    });
    await waitFor(() => expect(settled).toBe(true));
    off();
    await settle(queryClient);
    expect(wakingCalls()).toBe(1);
    unmount();
    await act(() => queryClient.invalidateQueries());
    await settle(queryClient);
    expect(wakingCalls()).toBe(1);

    // Coming back shows the kept result without a read.
    const again = renderHook(useDetails, { wrapper });
    await settle(queryClient);
    expect(again.result.current.data).toBeDefined();
    expect(wakingCalls()).toBe(1);
  });
});

describe("the app's code", () => {
  // refetchQueries() and resetQueries() would start every read that has run, including a waking read
  // whose page is closed (an enabled: false query with no observer is not "disabled" to them). The
  // interface never calls them; this keeps it that way.
  it("never refetches or resets every query", () => {
    const sources = {
      ...import.meta.glob<string>(
        ["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"],
        {
          query: "?raw",
          import: "default",
          eager: true,
        },
      ),
      ...import.meta.glob<string>(
        [
          "../../../../packages/react-api-omv/src/**/*.ts",
          "!../../../../packages/react-api-omv/src/**/*.test.ts",
          "!../../../../packages/react-api-omv/src/generated/**",
        ],
        { query: "?raw", import: "default", eager: true },
      ),
    };
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    const offenders = Object.entries(sources)
      .filter(([, text]) => /\b(refetchQueries|resetQueries)\(/.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
