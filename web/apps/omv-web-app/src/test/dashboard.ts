// SPDX-License-Identifier: GPL-3.0-or-later
// Waiting for the dashboard in a test. Its h1 is the answer, whose words change with the NAS, so a
// test that only needs "the dashboard is on screen" waits for what every visit has: the NAS map for
// an administrator, the greeting for a normal user.
import { screen } from "@testing-library/react";

/** The dashboard is on screen; resolves to its h1 (the answer, or the greeting). */
export async function findDashboard(): Promise<HTMLElement> {
  await screen.findByRole(
    "heading",
    { name: /^(Your NAS|Hello\b.*)$/ },
    { timeout: 8000 },
  );
  return screen.getByRole("heading", { level: 1 });
}
