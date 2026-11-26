// SPDX-License-Identifier: GPL-3.0-or-later
// The network on the dashboard's map (rethink 6.8 item 4): the ways in that are on, fanning into each
// interface and the network, with the loopback never shown. Pressing an interface opens its page in
// this interface (phase 5 network design 13.2); the map's footer leads to the Interfaces page.
import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSeenStore } from "../../stores/useSeenStore.ts";
import { useWelcomeStore } from "../../stores/useWelcomeStore.ts";
import { renderApp } from "../../test/renderApp.tsx";

beforeEach(() => {
  useWelcomeStore.setState({ seen: true });
  useSeenStore.setState({ seen: ["tip.new-interface", "tip.trace"] });
});

describe("the map's network band", () => {
  it("shows the interface without the loopback, opens its page, and leads to Interfaces", async () => {
    const { app, user } = await renderApp({
      signedIn: true,
      scenario: "dashboardAllOk",
    });
    const map = await screen.findByRole(
      "region",
      { name: "Your NAS" },
      { timeout: 8000 },
    );
    const iface = await within(map).findByRole("button", { name: /^enp2s0/ });
    expect(map).not.toHaveTextContent(/\blo\b/);
    expect(
      within(map).getByRole("link", { name: "Interfaces" }),
    ).toHaveAttribute("href", "/ui/network/interfaces");
    await user.click(iface);
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe(
        "/network/interfaces/enp2s0",
      ),
    );
    await act(() => app.router.navigate({ to: "/" }));
  });
});
