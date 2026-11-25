// SPDX-License-Identifier: GPL-3.0-or-later
// The motion reel's empty entries: each motion's causes, its timing in words and its stage
// (src/lab/reel/stages/empty.tsx). Development only (UI-11).
import { FilterStage, HandOverStage } from "../stages/empty.tsx";
import { defineEntry } from "../types.ts";

const handOver = defineEntry<{ created: boolean }>({
  id: "ghost-hands-over",
  section: "empty",
  title: "The ghost hands over",
  initial: { created: false },
  causes: [
    {
      id: "create",
      label: "Create the first folder",
      apply: () => ({ created: true }),
    },
  ],
  timing:
    "The new row rises 12px into the ghost's place over 360ms on the enter curve, and the ghost fades out over 240ms as it lands.",
  reducedTiming: "The ghost and the row crossfade over 160ms.",
  Stage: HandOverStage,
});

const filterCleared = defineEntry<{ query: string }>({
  id: "filter-cleared",
  section: "empty",
  title: "Filter cleared",
  initial: { query: "holiday" },
  causes: [
    { id: "clear", label: "Clear search", apply: () => ({ query: "" }) },
  ],
  timing:
    "The rows return in reading order: each rises into place over 240ms on the enter curve, 45ms after the one before, the first ten in turn and the rest with the tenth. Each fades in over 160ms, 20ms after the one before, so every row is fully there by 340ms while the later ones are still rising.",
  reducedTiming: "The rows are there at once.",
  Stage: FilterStage,
});

export const EMPTY_ENTRIES = [handOver, filterCleared];
