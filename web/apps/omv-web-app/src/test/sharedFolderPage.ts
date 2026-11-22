// SPDX-License-Identifier: GPL-3.0-or-later
// Opening a shared folder's page in the page tests, on a shares story of the mock (phase 5 shares
// design 13), and the folder UUIDs those stories hand out.
import { screen } from "@testing-library/react";
import type { ScenarioName } from "../mocks/scenarios.ts";
import { renderApp } from "./renderApp.tsx";
import { seenCalls } from "./server.ts";

export const LONG = { timeout: 15000 };
/** The n-th folder of a shares story (sharesScenarios.ts numbers them from 0x201). */
export const folderUuid = (n: number) =>
  `00000000-0000-4000-8000-${(0x200 + n).toString(16).padStart(12, "0")}`;
export const PHOTOS = folderUuid(1);
export const PUBLIC = folderUuid(2);
export const BACKUPS = folderUuid(3);

export const calls = (call: string) => seenCalls.filter((c) => c.call === call);
export const paramsOf = (call: string) =>
  calls(call).map((c) => c.params as Record<string, unknown>);

export async function folderPage(
  scenario: ScenarioName,
  uuid = PHOTOS,
  answers: Parameters<typeof renderApp>[0] = {},
) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: `/storage/shared-folders/${uuid}`,
    ...answers,
  });
  await screen.findByRole(
    "heading",
    { level: 2, name: "Who can use it" },
    LONG,
  );
  return app;
}
