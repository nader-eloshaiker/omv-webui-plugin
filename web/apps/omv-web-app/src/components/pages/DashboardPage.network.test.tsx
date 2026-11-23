// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's Network card with the network pages built (phase 5 network design 13.2): each name
// a router link to the interface's page, "This page uses it" on the row this page reaches the NAS
// through (0.4), the footer a router link to the Interfaces page, and still no status colour. The
// NAS's name is read only when the page was opened by a name.
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames } from "../../test/server.ts";

async function networkCard(scenario: ScenarioName) {
  await renderApp({ signedIn: true, scenario, path: "/" });
  await screen.findByRole("heading", { level: 1, name: "Dashboard" });
  const card = screen.getByRole("region", { name: "Network" });
  await within(card).findByRole("link", { name: "enp2s0" });
  return card;
}

describe("13.2: the dashboard's network card", () => {
  it("links each interface to its page and the footer to the Interfaces page, and marks this page's", async () => {
    const card = await networkCard("networkOne");
    expect(within(card).getByRole("link", { name: "enp2s0" })).toHaveAttribute(
      "href",
      "/ui/network/interfaces/enp2s0",
    );
    expect(card).toHaveTextContent("This page uses it");
    expect(
      within(card).getByRole("link", { name: "Network interfaces" }),
    ).toHaveAttribute("href", "/ui/network/interfaces");
    expect(card.querySelector("[data-slot=status-pill]")).toBeNull();
    // Opened at an address: the name is not needed.
    expect(callNames()).not.toContain("Network.getGeneralSettings");
  });

  it("marks the interface this page most likely uses when opened by name", async () => {
    const card = await networkCard("networkByName");
    expect(await within(card).findByText("This page uses it")).toBeVisible();
    expect(callNames()).toContain("Network.getGeneralSettings");
  });

  it("marks none when this page cannot tell (a tunnel)", async () => {
    await renderApp({ signedIn: true, path: "/" });
    await screen.findByRole("heading", { level: 1, name: "Dashboard" });
    const card = screen.getByRole("region", { name: "Network" });
    await within(card).findByRole("link", { name: "enp2s0" });
    expect(card).not.toHaveTextContent("This page uses it");
    expect(callNames()).not.toContain("Network.getGeneralSettings");
  });
});
