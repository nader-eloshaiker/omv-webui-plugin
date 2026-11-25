// SPDX-License-Identifier: GPL-3.0-or-later
// The motion reel's diagrams entries: each motion's causes, its timing in words and its stage
// (src/lab/reel/stages/diagrams.tsx). Development only (UI-11).
import type { Reach } from "../stages/diagrams.tsx";
import {
  CopyDirStage,
  DeleteStage,
  EraseStage,
  FailingStage,
  ReachStage,
  TraceStage,
} from "../stages/diagrams.tsx";
import { defineEntry } from "../types.ts";

const trace = defineEntry<{ traced: boolean }>({
  id: "trace",
  section: "diagrams",
  title: "Trace",
  initial: { traced: false },
  causes: [
    { id: "point", label: "Point at Photos", apply: () => ({ traced: true }) },
  ],
  timing:
    "Point at or focus a folder chip: its row and the ways in that reach it light with an outline in the selected colour, and the rest drop in emphasis over 240ms, never below 3:1 for text.",
  reducedTiming: "The same, with no transition.",
  note: "What the trace dims is drawn at reduced emphasis on purpose, so the check skips those items.",
  Stage: TraceStage,
});

const failing = defineEntry<{ failing: boolean }>({
  id: "arrangement-failing",
  section: "diagrams",
  title: "A disk failing in an arrangement",
  initial: { failing: false },
  causes: [
    {
      id: "fail",
      label: "Show a disk failing",
      apply: () => ({ failing: true }),
    },
  ],
  timing:
    "The disk greys over 360ms and is crossed through as its line draws; the blocks that are lost turn dashed over 240ms.",
  reducedTiming: "The same, with no transition.",
  note: "The failed disk is greyed on purpose, so the check skips it.",
  Stage: FailingStage,
});

const erase = defineEntry<{ typed: string }>({
  id: "erase-picture",
  section: "diagrams",
  title: "Erase picture",
  initial: { typed: "" },
  causes: [{ id: "type", label: "Type sdd", apply: () => ({ typed: "sdd" }) }],
  timing:
    "As the typed name matches, letter by letter, a strike-through line draws across each partition, file system and folder on the disk, left to right, in step with the confirm button's red fill, each step over 240ms.",
  reducedTiming: "Everything is struck through at once when the name matches.",
  note: "Type into either field to see it follow you a letter at a time.",
  Stage: EraseStage,
});

const deletePicture = defineEntry<{ opened: number }>({
  id: "delete-picture",
  section: "diagrams",
  title: "Delete picture",
  initial: { opened: 0 },
  causes: [
    {
      id: "open",
      label: "Open the delete dialog",
      apply: (s) => ({ opened: s.opened + 1 }),
    },
  ],
  timing:
    "The lines to what depends on Photos draw over 240ms, 45ms apart; then a cut mark draws across each line over 160ms.",
  reducedTiming: "The lines and cut marks are drawn.",
  Stage: DeleteStage,
});

const reach = defineEntry<{ reach: Reach }>({
  id: "nfs-reach",
  section: "diagrams",
  title: "Who a Linux share reaches",
  initial: { reach: "one" },
  causes: [
    { id: "one", label: "One computer", apply: () => ({ reach: "one" }) },
    { id: "network", label: "A network", apply: () => ({ reach: "network" }) },
    { id: "any", label: "Any computer", apply: () => ({ reach: "any" }) },
  ],
  timing:
    "One screen multiplies into a row inside the bracket: each new screen slides out from the middle over 360ms, 45ms after its neighbour, fading in over 160ms. For any computer the outer screens slide past the bracket's edges.",
  reducedTiming: "The screens are in their new places at once.",
  Stage: ReachStage,
});

const copyDirection = defineEntry<{ runs: number }>({
  id: "copy-direction",
  section: "diagrams",
  title: "Copy direction",
  initial: { runs: 0 },
  causes: [
    { id: "copy", label: "Copy now", apply: (s) => ({ runs: s.runs + 1 }) },
  ],
  timing:
    "A dash travels once from the source to the destination over 640ms on the standard curve, then the plain arrow rests. Once per cause.",
  reducedTiming: "The arrow stays still.",
  Stage: CopyDirStage,
});

export const DIAGRAM_ENTRIES = [
  trace,
  failing,
  erase,
  deletePicture,
  reach,
  copyDirection,
];
