// SPDX-License-Identifier: GPL-3.0-or-later
// The idle warning on fake time: it follows the calls the server counts (foreground ones), not
// background polling (UI-14); "Stay signed in" is one foreground call; when the time is up it asks
// with a background call and shows sign-in if the server has ended the session.
import { configIsDirty } from "@omv-webui/react-api-omv/generated";
import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { seenCalls } from "../../test/server.ts";

const MINUTE = 60_000;
// The contract's example: 6 minutes. The warning opens one minute before the end.
const WARN_AT = 5 * MINUTE;

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const timeoutReads = () =>
  seenCalls.filter((c) => c.call === "WebGui.getAutoLogoutSettings");

async function signedIn(answers?: Parameters<typeof renderApp>[0]) {
  const app = await renderApp({
    signedIn: true,
    advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    ...answers,
  });
  await screen.findByRole("heading", { name: "Dashboard" });
  // StrictMode mounts twice in development, which can cancel and repeat the first read.
  await waitFor(() => expect(timeoutReads().length).toBeGreaterThan(0));
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { ...app, settled: timeoutReads().length };
}

beforeEach(() => {
  // Only the clock and the interval are fake; MSW and the query client keep real timeouts.
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
});

describe("the idle warning", () => {
  it("opens before the server's timeout and counts down; background polling does not hold it off", async () => {
    await signedIn();
    await advance(2 * MINUTE);
    // A page's background poll: the server does not count it, and neither does the clock.
    await configIsDirty(undefined, { background: true });
    await advance(WARN_AT - 2 * MINUTE - 1000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await advance(1000);
    const dialog = await screen.findByRole("dialog", {
      name: "Are you still there?",
    });
    expect(dialog).toHaveTextContent("will sign you out in 1:00");
    await advance(15_000);
    expect(dialog).toHaveTextContent("will sign you out in 0:45");
    expect(
      within(dialog).getByRole("button", { name: "Stay signed in" }),
    ).toHaveFocus();
  });

  it("stays signed in with one deliberate foreground call", async () => {
    const { user, settled } = await signedIn();
    await advance(WARN_AT);
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Stay signed in" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(timeoutReads()).toHaveLength(settled + 1);
    expect(timeoutReads().at(-1)?.background).toBe(false);
    // The clock started again from that call.
    await advance(WARN_AT - 1000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("treats Escape as staying signed in", async () => {
    const { user, settled } = await signedIn();
    await advance(WARN_AT);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(timeoutReads()).toHaveLength(settled + 1);
  });

  it("signs out from the warning", async () => {
    const { user } = await signedIn();
    await advance(WARN_AT);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(seenCalls.map((c) => c.call)).toContain("Session.logout");
  });

  it("when the time is up, asks in the background and shows sign-in if the server ended the session", async () => {
    const { mock, settled } = await signedIn();
    // The server ends the idle session on its own.
    mock.signedIn = false;
    mock.expiring = true;
    await advance(6 * MINUTE);
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your session ended, so you were signed out.",
    );
    const check = timeoutReads()[settled];
    expect(check?.background).toBe(true);
  });

  it("never opens when the server keeps idle sessions (timeout 0)", async () => {
    const { settled } = await signedIn({
      answers: {
        webGuiGetAutoLogoutSettings: { status: 200, value: { timeout: 0 } },
      },
    });
    await advance(60 * MINUTE);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(timeoutReads()).toHaveLength(settled);
  });
});
