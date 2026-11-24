// SPDX-License-Identifier: GPL-3.0-or-later
// "Blink its light" on an interface's page (phase 5 network design 4.4; P16, D19) through the whole
// app on MSW and fake time: how long (10 by default), Cancel focused, the warning only on this page's
// port, Network.identify through the task helper, "Blinking for…" with the elapsed time, done, a port
// that cannot blink (the server's message as text), and on this page's port the wait for the NAS when
// it stops answering, ending in the recovery card's first step when it does not come back in time.
import { act, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { seenCalls, server } from "../../test/server.ts";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

async function openBlink(scenario: ScenarioName, iface: string, answers = {}) {
  const view = await renderApp({
    signedIn: true,
    scenario,
    path: `/network/interfaces/${iface}`,
    answers,
    advanceTimers: (ms) => vi.advanceTimersByTime(ms),
  });
  await view.user.click(
    await screen.findByRole("button", { name: "Blink its light…" }),
  );
  const dialog = await screen.findByRole("dialog");
  return { ...view, dialog };
}

describe("4.4: blink its light", () => {
  it("offers 5 to 30 seconds, 10 by default, Cancel focused, and no warning for another port", async () => {
    const { dialog } = await openBlink("networkTwo", "enp3s0");
    expect(within(dialog).getByRole("heading")).toHaveTextContent(
      "Blink the light of enp3s0",
    );
    expect(
      within(dialog).getByRole("radio", { name: "10 seconds" }),
    ).toBeChecked();
    for (const name of ["5 seconds", "15 seconds", "30 seconds"]) {
      expect(within(dialog).getByRole("radio", { name })).not.toBeChecked();
    }
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Cancel" }),
      ).toHaveFocus(),
    );
    expect(dialog).not.toHaveTextContent(/may not respond/u);
  });

  it("blinks for the time chosen through the task helper, with the elapsed time, then says it is done", async () => {
    const { user, dialog } = await openBlink("networkTwo", "enp3s0");
    await user.click(within(dialog).getByRole("radio", { name: "5 seconds" }));
    await user.click(within(dialog).getByRole("button", { name: "Blink" }));
    expect(await within(dialog).findByText(/^Blinking for/u)).toHaveTextContent(
      "Blinking for 5 seconds…",
    );
    const sent = seenCalls.find((c) => c.call === "Network.identify");
    expect(sent?.params).toEqual({ devicename: "enp3s0", seconds: 5 });
    await advance(2000);
    expect(dialog).toHaveTextContent(/seconds? so far/u);
    await advance(6000);
    expect(
      await within(dialog).findByText("Done. Did you see the light?"),
    ).toBeVisible();
    // Nothing in the page shows the task's handle (UI-5).
    expect(document.body.textContent).not.toContain("/tmp/bgstatus");
    const close = within(dialog).getByRole("button", { name: "Close" });
    await waitFor(() => expect(close).toHaveFocus());
    await user.click(close);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the server's message as text when the port cannot blink", async () => {
    const { user, dialog } = await openBlink("networkTwo", "enp3s0", {
      execGetOutput: () => ({
        status: 500,
        message:
          "ethtool --identify enp3s0 10 with exit code '94': Cannot identify NIC: Operation not supported",
      }),
    });
    await user.click(within(dialog).getByRole("button", { name: "Blink" }));
    const failed = await within(dialog).findByRole("alert");
    expect(failed).toHaveTextContent(
      /^This port could not blink its light: .*Operation not supported$/u,
    );
  });

  it("warns on this page's port and, when the NAS stops answering, waits for it", async () => {
    const { user, dialog } = await openBlink("networkTwo", "enp2s0");
    expect(dialog).toHaveTextContent(
      "While it blinks, some ports stop carrying data, so this page may not respond for 10 seconds.",
    );
    let down = true;
    server.use(
      http.post("*/rpc.php", () => (down ? HttpResponse.error() : undefined)),
    );
    down = false;
    await user.click(within(dialog).getByRole("button", { name: "Blink" }));
    await within(dialog).findByText(/^Blinking for/u);
    down = true;
    await advance(3000);
    expect(
      (await within(dialog).findAllByText(/Waiting for the NAS to answer/u))[0],
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Stop waiting" }),
    ).toBeVisible();
    down = false;
    for (let s = 0; s < 12; s += 2) {
      await advance(2000);
    }
    expect(
      await within(dialog).findByText("Done. Did you see the light?"),
    ).toBeVisible();
  });

  it("shows the recovery card's first step when the NAS does not answer within the time plus 10 seconds", async () => {
    const { user, dialog } = await openBlink("networkTwo", "enp2s0");
    let down = false;
    server.use(
      http.post("*/rpc.php", () => (down ? HttpResponse.error() : undefined)),
    );
    await user.click(within(dialog).getByRole("radio", { name: "5 seconds" }));
    await user.click(within(dialog).getByRole("button", { name: "Blink" }));
    await within(dialog).findByText(/^Blinking for/u);
    down = true;
    await advance(3000);
    await within(dialog).findAllByText(/Waiting for the NAS to answer/u);
    // Two seconds at a time: the watch's poll.
    for (let s = 0; s < 18; s += 2) {
      await advance(2000);
    }
    expect(
      await within(dialog).findByText(
        "This page cannot reach the NAS since the change.",
      ),
    ).toBeVisible();
    expect(dialog).toHaveTextContent("Wait two minutes, then try again.");
    down = false;
    await user.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(
      await within(dialog).findByText("Done. Did you see the light?"),
    ).toBeVisible();
  });
});
