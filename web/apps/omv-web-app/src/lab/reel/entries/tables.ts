// SPDX-License-Identifier: GPL-3.0-or-later
// The motion reel's tables entries: each motion's causes, its timing in words and its stage
// (src/lab/reel/stages/tables.tsx). Development only (UI-11).
import { forgetFirstTime } from "../helpers/useFirstTime.ts";
import type { BarsState, SortKey } from "../stages/tables.tsx";
import {
  ArrivesStage,
  BarsVisit,
  CopyStage,
  ExpandStage,
  LeavesStage,
  MovesStage,
  QuickStage,
  SelectStage,
  SortStage,
} from "../stages/tables.tsx";
import { defineEntry } from "../types.ts";

const moves = defineEntry<{ warn: boolean }>({
  id: "row-moves",
  section: "tables",
  title: "A row moves to its group",
  initial: { warn: false },
  causes: [
    {
      id: "warn",
      label: "Change a disk to Warning",
      apply: () => ({ warn: true }),
    },
  ],
  timing:
    "The row slides to its place at the head of its group over 360ms on the soft spring while the others close up; its status crossfades over 160ms; the whole row takes the warning wash once, fading over 640ms. While the pointer or focus is in the table nothing moves: “1 row changed. Show it” appears, and pressing it runs the move.",
  reducedTiming: "The rows that moved crossfade into their places over 160ms.",
  Stage: MovesStage,
});

const arrives = defineEntry<{ photos: boolean }>({
  id: "row-arrives",
  section: "tables",
  title: "A new row arrives",
  initial: { photos: false },
  causes: [
    {
      id: "back",
      label: "Come back from creating a folder",
      apply: () => ({ photos: true }),
    },
  ],
  timing:
    "The new row rises 12px into its place over 360ms on the enter curve while the rows after it move down; 300ms in, the jump highlight rings it for about a second and fades.",
  reducedTiming:
    "The highlight rings the row for a second without movement or fade.",
  Stage: ArrivesStage,
});

const leaves = defineEntry<{ deleted: boolean }>({
  id: "row-leaves",
  section: "tables",
  title: "A row leaves",
  initial: { deleted: false },
  causes: [
    {
      id: "delete",
      label: "Delete a folder",
      apply: () => ({ deleted: true }),
    },
  ],
  timing:
    "The row fades and gives up its height over 240ms on the exit curve, and the group's count rolls to its new figure over 240ms.",
  reducedTiming: "The row goes and the count changes at once.",
  Stage: LeavesStage,
});

const sort = defineEntry<{ by: SortKey }>({
  id: "sort",
  section: "tables",
  title: "Sort",
  initial: { by: "device" },
  causes: [
    { id: "size", label: "Sort by size", apply: () => ({ by: "size" }) },
  ],
  timing:
    "With 50 rows or fewer the rows move to their new places over 240ms on the standard curve; more than that is a cut. The header's arrow turns on the settle spring over 240ms.",
  reducedTiming: "The rows are in their new order at once.",
  Stage: SortStage,
});

const expand = defineEntry<{ open: boolean }>({
  id: "expand-row",
  section: "tables",
  title: "Expand a row",
  initial: { open: false },
  causes: [
    { id: "open", label: "Open the Photos row", apply: () => ({ open: true }) },
  ],
  timing:
    "The row opens in height over 360ms on the soft spring and the chevron turns; the facts fade in over 160ms from 160ms, as the spring lands.",
  reducedTiming: "It opens at once.",
  Stage: ExpandStage,
});

const selection = defineEntry<{ picked: readonly string[] }>({
  id: "selection-bar",
  section: "tables",
  title: "Selection bar",
  initial: { picked: [] },
  causes: [
    { id: "one", label: "Select a row", apply: () => ({ picked: ["Photos"] }) },
    {
      id: "two",
      label: "Select another row",
      apply: (s) => ({
        picked: s.picked.includes("Music") ? s.picked : [...s.picked, "Music"],
      }),
    },
  ],
  timing:
    "The toolbar crossfades into the selection bar over 160ms while the bar drops 8px into place over 240ms on the standard curve; the count rolls to its new figure over 240ms.",
  reducedTiming: "The toolbar and the bar crossfade over 160ms, with no drop.",
  Stage: SelectStage,
});

const quick = defineEntry<{ pointed: string | null }>({
  id: "quick-actions",
  section: "tables",
  title: "Quick actions",
  initial: { pointed: null },
  causes: [
    {
      id: "point",
      label: "Point at a row",
      apply: () => ({ pointed: "Music" }),
    },
  ],
  timing:
    "Point at or focus a row: after an 80ms intent delay, so a pointer passing over the rows does not flicker, its quick buttons fade in over 160ms beside the More button that is always there.",
  reducedTiming: "They appear at once.",
  Stage: QuickStage,
});

const copy = defineEntry<{ copies: number }>({
  id: "copy",
  section: "tables",
  title: "Copy",
  initial: { copies: 0 },
  causes: [
    {
      id: "copy",
      label: "Copy the path",
      apply: (s) => ({ copies: s.copies + 1 }),
    },
  ],
  timing:
    "The copy glyph crossfades to a check over 160ms, stays 1.5s and crossfades back.",
  reducedTiming: "The glyph swaps at once.",
  note: "The reel does not write to your clipboard.",
  Stage: CopyStage,
});

const bars = defineEntry<BarsState>({
  id: "bars",
  section: "tables",
  title: "Bars",
  initial: { visit: 0, more: false },
  causes: [
    {
      id: "first",
      label: "First visit to the page",
      apply: (s) => ({ visit: s.visit + 1, more: false }),
    },
    {
      id: "change",
      label: "Change usage",
      apply: (s) => ({ ...s, more: true }),
    },
  ],
  // The first visit forgets its flag before the page is drawn again.
  wrap: (commit) => {
    forgetFirstTime("motion.table-bars");
    void commit();
  },
  timing:
    "On the page's first visit in this browser the bars fill from zero over 640ms on the standard curve; every later visit draws them at their value. A change of usage glides over 640ms.",
  reducedTiming: "The bars stand at their value.",
  Stage: BarsVisit,
});

export const TABLE_ENTRIES = [
  moves,
  arrives,
  leaves,
  sort,
  expand,
  selection,
  quick,
  copy,
  bars,
];
