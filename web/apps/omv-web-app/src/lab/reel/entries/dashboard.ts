// SPDX-License-Identifier: GPL-3.0-or-later
// The motion reel's dashboard entries: each motion's causes, its timing in words and its stage
// (src/lab/reel/stages/dashboard.tsx). Development only (UI-11).
import {
  LiveStage,
  PendingStage,
  PowerStage,
  ProblemList,
  ProblemWithMap,
  SpaceStage,
} from "../stages/dashboard.tsx";
import { defineEntry } from "../types.ts";

const problemArrives = defineEntry<{ problem: boolean }>({
  id: "problem-arrives",
  section: "dashboard",
  title: "A problem arrives",
  initial: { problem: false },
  causes: [
    {
      id: "arrive",
      label: "A disk reports a problem",
      apply: () => ({ problem: true }),
    },
  ],
  timing:
    "Its row rises 12px into the list of what needs you, at its place, worst first, over 360ms on the enter curve; the answer's words crossfade over 160ms. In the map the disk takes its status mark and its row's lineage lights once from the disk outward: the first connector draws in the warning tone over 360ms, the second 300ms later, 660ms in all.",
  reducedTiming:
    "The row appears, and the map's row is shown lit without travel.",
  Stage: ProblemWithMap,
});

const problemResolves = defineEntry<{ problem: boolean }>({
  id: "problem-resolves",
  section: "dashboard",
  title: "A problem resolves",
  initial: { problem: true },
  causes: [
    {
      id: "clear",
      label: "The problem clears",
      apply: () => ({ problem: false }),
    },
  ],
  timing:
    "Its row folds away over 240ms on the exit curve, and the answer's words crossfade back over 160ms.",
  reducedTiming: "The row goes and the answer changes at once.",
  Stage: ProblemList,
});

const readouts = defineEntry<{ n: number }>({
  id: "live-readouts",
  section: "dashboard",
  title: "Live readouts",
  initial: { n: 0 },
  causes: [
    { id: "read", label: "Take a reading", apply: (s) => ({ n: s.n + 1 }) },
  ],
  timing:
    "Each figure glides to its new value over 640ms, easing out. No dot, no sparkline, and nothing repeats on its own.",
  reducedTiming: "Each figure changes in place.",
  Stage: LiveStage,
});

const sleeps = defineEntry<{ asleep: boolean }>({
  id: "disk-sleeps",
  section: "dashboard",
  title: "A disk goes to sleep",
  initial: { asleep: false },
  causes: [
    {
      id: "sleep",
      label: "The disk goes to sleep",
      apply: () => ({ asleep: true }),
    },
  ],
  timing:
    "The slot's platter arc turns a quarter over 640ms on the standard curve, slowing to a stop; a small moon fades in beside “Asleep” over 160ms as the temperature fades out. Never on page load, only on a change between readings.",
  reducedTiming: "The moon and the word appear.",
  Stage: PowerStage,
});

const wakes = defineEntry<{ asleep: boolean }>({
  id: "disk-wakes",
  section: "dashboard",
  title: "A disk wakes",
  initial: { asleep: true },
  causes: [
    { id: "wake", label: "The disk wakes", apply: () => ({ asleep: false }) },
  ],
  timing:
    "The moon fades over 160ms and the arc turns back a quarter over 360ms on the enter curve.",
  reducedTiming: "The arc and the words change at once.",
  Stage: PowerStage,
});

const space = defineEntry<{ added: boolean }>({
  id: "space-changes",
  section: "dashboard",
  title: "Space changes",
  initial: { added: false },
  causes: [
    { id: "add", label: "Add 40 GiB of files", apply: () => ({ added: true }) },
  ],
  timing:
    "The bar and its figures glide over 640ms. Crossing the warning mark adds the “Almost full” label, which fades in over 160ms and settles on the spring over 360ms.",
  reducedTiming:
    "The bar, the figures and the label are at their value at once.",
  Stage: SpaceStage,
});

const pendingMap = defineEntry<{ saves: number }>({
  id: "pending-map",
  section: "dashboard",
  title: "Pending in the map",
  initial: { saves: 0 },
  causes: [
    {
      id: "save",
      label: "Save a change to Photos' sharing",
      apply: (s) => ({ saves: s.saves + 1 }),
    },
  ],
  timing:
    "The pending mark flies to the top bar's count over 640ms; as it lands the count rolls to its new figure and the pending mark settles onto the Photos chip over 240ms on the settle spring.",
  reducedTiming: "No flight: the mark appears on Photos and the count changes.",
  Stage: PendingStage,
});

export const DASHBOARD_ENTRIES = [
  problemArrives,
  problemResolves,
  readouts,
  sleeps,
  wakes,
  space,
  pendingMap,
];
