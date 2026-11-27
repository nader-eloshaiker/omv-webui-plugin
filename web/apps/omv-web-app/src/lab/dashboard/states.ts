// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard prototype's screen and the states the lab can show (rethink spec 6, 8 row 1).
// Development only (UI-11). `?state=` picks one; it only seeds what is shown, never acts (UI-4).

export const DASH_SCREENS = ["nas-map"] as const;
export type DashScreen = (typeof DASH_SCREENS)[number];

export const DASH_STATES = [
  { id: "needs-you", name: "Needs you: 4 things" },
  { id: "all-ok", name: "Everything is working" },
  { id: "disk-critical", name: "A disk is failing" },
  { id: "new-nas", name: "First visit: a new NAS" },
  { id: "new-interface", name: "First visit: new interface" },
  { id: "many", name: "24 disks, 8 storage, 30 folders" },
  { id: "no-folders", name: "No shared folders" },
  { id: "loading", name: "Loading" },
  { id: "lane-failed", name: "Disks could not be read" },
] as const;
export type DashState = (typeof DASH_STATES)[number]["id"];

/** The page width the lab frames the dashboard in, to show 900 and 390 without resizing the window. */
export const DASH_WIDTHS = ["full", "900", "390"] as const;
export type DashWidth = (typeof DASH_WIDTHS)[number];
