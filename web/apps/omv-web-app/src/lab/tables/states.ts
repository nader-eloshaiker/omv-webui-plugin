// SPDX-License-Identifier: GPL-3.0-or-later
// The table prototypes' screens and the states the lab's switcher can show (rethink spec 8 rows 4
// and 5). Development only (UI-11). `?state=` picks one; it only seeds what is shown (UI-4).

export const TABLE_SCREENS = ["folders-table", "disks-table"] as const;
export type TableScreen = (typeof TABLE_SCREENS)[number];

export const FOLDER_TABLE_STATES = [
  { id: "populated", name: "4 folders, 1 not reachable" },
  { id: "selected", name: "2 selected" },
  { id: "expanded", name: "Photos expanded" },
  { id: "menu", name: "More menu open" },
  { id: "filtered", name: "Chip: Not reachable" },
  { id: "no-match", name: "Search finds nothing" },
  { id: "empty", name: "No folders yet" },
  { id: "loading", name: "Loading" },
  { id: "error", name: "Could not read" },
  { id: "stale", name: "Reading again failed" },
] as const;
export type FolderTableState = (typeof FOLDER_TABLE_STATES)[number]["id"];

export const DISK_TABLE_STATES = [
  { id: "populated", name: "7 disks, not checked" },
  { id: "checked", name: "Checked, 1 warning" },
  { id: "selected", name: "2 selected" },
  { id: "expanded", name: "sdb expanded" },
  { id: "technical", name: "Technical columns" },
  { id: "loading", name: "Loading" },
  { id: "error", name: "Could not read" },
] as const;
export type DiskTableState = (typeof DISK_TABLE_STATES)[number]["id"];

/** The page width the lab frames the table in, to show the list form without resizing the window. */
export const WIDTHS = ["full", "900", "390"] as const;
export type LabWidth = (typeof WIDTHS)[number];
