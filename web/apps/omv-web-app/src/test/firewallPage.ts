// SPDX-License-Identifier: GPL-3.0-or-later
// The firewall page's tests (phase 5 network design 11): open it on a network story, and find its check
// line and its rows.
import { screen, waitFor, within } from "@testing-library/react";
import type { NetworkScenarioName } from "../mocks/networkScenarios.ts";
import { renderApp } from "./renderApp.tsx";

export const LONG = { timeout: 10_000 };

export async function firewall(scenario: NetworkScenarioName) {
  const view = await renderApp({
    scenario,
    signedIn: true,
    path: "/network/firewall",
  });
  await screen.findByRole("heading", { name: "Firewall rules" }, LONG);
  return view;
}

/** The check line on the page (11.3 item 3), once the reads it needs are in. */
export async function checkLine(): Promise<HTMLElement> {
  return waitFor(() => {
    const line = document.querySelector<HTMLElement>(
      'main [data-slot="firewall-check"]',
    );
    if (line === null) {
      throw new Error("no check line yet");
    }
    return line;
  }, LONG);
}

export const ruleRows = async (): Promise<HTMLElement[]> => {
  const table = await screen.findByRole(
    "table",
    { name: "Firewall rules" },
    LONG,
  );
  return within(table).getAllByRole("row").slice(1);
};
