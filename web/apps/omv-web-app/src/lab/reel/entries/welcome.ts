// SPDX-License-Identifier: GPL-3.0-or-later
// The motion reel's welcome entries: each motion's causes, its timing in words and its stage
// (src/lab/reel/stages/welcome.tsx). Development only (UI-11).
import {
  AssembleStage,
  GhostStage,
  SetUpStage,
  StepStage,
  WelcomeStage,
} from "../stages/welcome.tsx";
import { defineEntry } from "../types.ts";

const assembles = defineEntry<{ visit: number }>({
  id: "assembles",
  section: "welcome",
  title: "The NAS assembles",
  initial: { visit: 0 },
  causes: [
    {
      id: "play",
      label: "Play the first visit",
      apply: (s) => ({ visit: s.visit + 1 }),
    },
  ],
  timing:
    "Row by row, top to bottom: each row's disks slide 10px into their slots, its connectors draw, the bar fills and the folder chips rise, then the band's tiles settle and their connectors draw, about 900ms in all on the settle and standard curves. Every part fades in over 160ms within the first 320ms, so nothing waits to be seen; the movement, drawing and bar fill carry on at full opacity.",
  reducedTiming: "The map fades in whole over 160ms.",
  Stage: AssembleStage,
});

const welcomeLeaves = defineEntry<{ gone: boolean }>({
  id: "welcome-leaves",
  section: "welcome",
  title: "The welcome line leaves",
  initial: { gone: false },
  causes: [{ id: "got-it", label: "Got it", apply: () => ({ gone: true }) }],
  timing:
    "The line folds up over 240ms on the exit curve, fading as it gives up its height, and what is below closes the gap.",
  reducedTiming: "Gone at once.",
  Stage: WelcomeStage,
});

const ghostSolid = defineEntry<{ created: boolean }>({
  id: "ghost-solid",
  section: "welcome",
  title: "A ghost becomes the first storage",
  initial: { created: false },
  causes: [
    {
      id: "create",
      label: "Create the first storage",
      apply: () => ({ created: true }),
    },
  ],
  timing:
    "Over 360ms the ghost's dashes join into a solid outline, its connector draws along its length on the standard curve, and the name crossfades in over 160ms.",
  reducedTiming: "The ghost crossfades to the node over 160ms.",
  Stage: GhostStage,
});

const firstStep = defineEntry<{ done: number }>({
  id: "first-step",
  section: "welcome",
  title: "A first step lands",
  initial: { done: 1 },
  causes: [
    {
      id: "finish",
      label: "Finish this step",
      apply: (s) => ({ done: Math.min(3, s.done + 1) }),
    },
  ],
  timing:
    "The step's empty circle becomes a check that draws its stroke over 240ms; the next step's button takes the accent fill over 240ms; the progress bar glides over 640ms on the standard curve.",
  reducedTiming:
    "The check and the fill appear, and the bar stands at its value.",
  Stage: StepStage,
});

const setUp = defineEntry<{ setUp: boolean }>({
  id: "set-up",
  section: "welcome",
  title: "Set up",
  initial: { setUp: false },
  causes: [
    {
      id: "finish-last",
      label: "Finish the last step",
      apply: () => ({ setUp: true }),
    },
  ],
  timing:
    "The four checks slide together into one, which reads “Set up”, while the checklist folds into Shortcuts, 360ms on the settle spring; the old words fade out over 160ms and the new ones fade in over 160ms as they settle.",
  reducedTiming:
    "The checklist swaps for “Set up” and Shortcuts with a 160ms fade.",
  Stage: SetUpStage,
});

export const WELCOME_ENTRIES = [
  assembles,
  welcomeLeaves,
  ghostSolid,
  firstStep,
  setUp,
];
