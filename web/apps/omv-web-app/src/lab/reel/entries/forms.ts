// SPDX-License-Identifier: GPL-3.0-or-later
// The motion reel's forms entries: each motion's causes, its timing in words and its stage
// (src/lab/reel/stages/forms.tsx). Development only (UI-11).
import type { Kind, PathState, SummaryState } from "../stages/forms.tsx";
import {
  ChoiceStage,
  ErrorsStage,
  FanStage,
  ImpactStage,
  LiveStage,
  MoreStage,
  PathStage,
  RunStage,
  SaveStage,
  StrengthStage,
  SuggestStage,
  SummaryStage,
} from "../stages/forms.tsx";
import { defineEntry } from "../types.ts";

type ScopedTransition = (cb: () => Promise<void>) => {
  finished: Promise<void>;
};

/**
 * The shared-element morph (7.4): the Mirror card's small glyph becomes the large drawing in a View
 * Transition scoped to the Full pane's cards and drawing, so the rest of the page, the Reduced pane
 * included, keeps rendering while it runs. Where the browser has no scoped transition, or the Full
 * pane is reduced, the change commits at once and the stage's crossfade with a small scale runs.
 */
function morph(commit: () => Promise<void>, root: HTMLElement) {
  const scope = root.querySelector<HTMLElement>(
    '[data-pane="full"] .rl-choice',
  );
  const glyph = scope?.querySelector<HTMLElement>('[data-glyph="mirror"]');
  const start = (
    scope as (HTMLElement & { startViewTransition?: ScopedTransition }) | null
  )?.startViewTransition;
  if (!scope || !glyph || !start || scope.closest('[data-motion="reduced"]')) {
    void commit();
    return;
  }
  // Only the named drawing takes part; the scope itself changes in place.
  scope.style.setProperty("view-transition-name", "none");
  glyph.style.setProperty("view-transition-name", "rl-arrangement");
  let big: HTMLElement | null = null;
  const transition = start.call(scope, async () => {
    await commit();
    glyph.style.removeProperty("view-transition-name");
    big = scope.querySelector<HTMLElement>(".rl-arr-big svg");
    big?.style.setProperty("view-transition-name", "rl-arrangement");
  });
  void transition.finished.finally(() => {
    big?.style.removeProperty("view-transition-name");
    scope.style.removeProperty("view-transition-name");
  });
}

const pathDraws = defineEntry<PathState>({
  id: "path-draws",
  section: "forms",
  title: "The path draws as you fill",
  initial: { name: "", drive: false, smb: false },
  causes: [
    {
      id: "name",
      label: "Type a name",
      apply: (s) => ({ ...s, name: "Photos" }),
    },
    {
      id: "drive",
      label: "Choose a drive",
      apply: (s) => ({ ...s, drive: true }),
    },
    {
      id: "smb-on",
      label: "Turn on Windows and Mac",
      apply: (s) => ({ ...s, smb: true }),
    },
    {
      id: "smb-off",
      label: "Turn it off",
      apply: (s) => ({ ...s, smb: false }),
    },
  ],
  timing:
    "A named folder's node turns from dashed to solid over 240ms; each line draws along its length over 360ms on the standard curve; a line turned off retracts over 240ms on the exit curve.",
  reducedTiming: "Lines and nodes crossfade over 160ms.",
  Stage: PathStage,
});

const fansOut = defineEntry<{ family: boolean }>({
  id: "access-fans",
  section: "forms",
  title: "A group's access fans out",
  initial: { family: false },
  causes: [
    { id: "tick", label: "Tick Family", apply: () => ({ family: true }) },
  ],
  timing:
    "Lines draw from the group to each folder it opens over 360ms, each 45ms after the one before, and each folder's access level fades in beside it over 160ms.",
  reducedTiming: "Lines and levels crossfade over 160ms.",
  Stage: FanStage,
});

const summary = defineEntry<SummaryState>({
  id: "summary-sentence",
  section: "forms",
  title: "A summary sentence changes",
  initial: { family: false, guests: false },
  causes: [
    {
      id: "who",
      label: "Change who can open it",
      apply: (s) => ({ ...s, family: !s.family }),
    },
    {
      id: "guests-in",
      label: "Let guests in",
      apply: (s) => ({ ...s, guests: true }),
    },
    {
      id: "guests-out",
      label: "Keep guests out",
      apply: (s) => ({ ...s, guests: false }),
    },
  ],
  timing:
    "A changed sentence crossfades its words over 160ms; a new one rises 12px over 360ms on the enter curve, fading in as it goes; a removed one folds away over 240ms on the exit curve. The guest sentence's warning triangle draws its edge over 240ms.",
  reducedTiming: "Sentences change, arrive and go at once.",
  Stage: SummaryStage,
});

const choice = defineEntry<{ picked: Kind | null }>({
  id: "choice-card",
  section: "forms",
  title: "A choice card is picked",
  initial: { picked: null },
  causes: [
    { id: "mirror", label: "Pick Mirror", apply: () => ({ picked: "mirror" }) },
  ],
  wrap: morph,
  timing:
    "The radio dot lands on the settle spring over 160ms; the selection outline draws round the card over 240ms; the card's small arrangement grows into the larger drawing beside the cards over 360ms, as a View Transition where the browser has one and otherwise a crossfade with a small scale.",
  reducedTiming: "The outline appears and the drawing crossfades over 160ms.",
  Stage: ChoiceStage,
});

const moreOptions = defineEntry<{ open: boolean; changed: number }>({
  id: "more-options",
  section: "forms",
  title: "More options opens",
  initial: { open: false, changed: 1 },
  causes: [
    {
      id: "open",
      label: "Open More options",
      apply: (s) => ({ ...s, open: true }),
    },
    {
      id: "change",
      label: "Change an option",
      apply: (s) => ({ ...s, changed: Math.min(2, s.changed + 1) }),
    },
  ],
  timing:
    "The panel opens in height over 360ms on the soft spring, and the changed count rolls to its new figure over 240ms.",
  reducedTiming: "It opens at once and the count changes in place.",
  Stage: MoreStage,
});

const strength = defineEntry<{ strong: boolean }>({
  id: "password-strength",
  section: "forms",
  title: "Password strength",
  initial: { strong: false },
  causes: [
    {
      id: "stronger",
      label: "Type a stronger password",
      apply: () => ({ strong: true }),
    },
  ],
  timing:
    "The strength line glides to its new length over 640ms on the standard curve, and its words crossfade over 160ms.",
  reducedTiming: "The line and the words change at once.",
  Stage: StrengthStage,
});

const suggest = defineEntry<{ suggested: boolean; copies: number }>({
  id: "suggest-password",
  section: "forms",
  title: "Suggested password",
  initial: { suggested: false, copies: 0 },
  causes: [
    {
      id: "suggest",
      label: "Suggest a strong password",
      apply: (s) => ({ ...s, suggested: true }),
    },
    {
      id: "copy",
      label: "Copy",
      apply: (s) => ({ ...s, copies: s.copies + 1 }),
    },
  ],
  timing:
    "The field's text crossfades to the suggestion over 160ms; the copy glyph crossfades to a check, stays 1.5s and crossfades back.",
  reducedTiming: "The text and the glyph change at once.",
  Stage: SuggestStage,
});

const errors = defineEntry<{ submits: number }>({
  id: "errors-on-submit",
  section: "forms",
  title: "Errors on submit",
  initial: { submits: 0 },
  causes: [
    {
      id: "submit",
      label: "Press Create with no name",
      apply: (s) => ({ submits: s.submits + 1 }),
    },
  ],
  timing:
    "Focus moves to the error summary, which rises 12px over 360ms on the enter curve; each field with a problem turns its whole border critical over 240ms, once. Nothing shakes.",
  reducedTiming: "The summary and the borders appear.",
  note: "Focus moves to the summary in the Full pane only, since focus can be in one place.",
  Stage: ErrorsStage,
});

const run = defineEntry<{ runs: number }>({
  id: "the-run",
  section: "forms",
  title: "The run",
  initial: { runs: 0 },
  causes: [
    {
      id: "create",
      label: "Press Create",
      apply: (s) => ({ runs: s.runs + 1 }),
    },
  ],
  timing:
    "The step that is running carries a progress ring in the accent, drawn over the step's own time (700ms here); a finished step's ring closes and its check draws over 240ms.",
  reducedTiming:
    "The ring stands still at part of its length and the check appears.",
  Stage: RunStage,
});

const live = defineEntry<{ live: number }>({
  id: "it-is-live",
  section: "forms",
  title: "It is live",
  initial: { live: 0 },
  causes: [
    {
      id: "finish",
      label: "Finish the run",
      apply: (s) => ({ live: s.live + 1 }),
    },
  ],
  timing:
    "One short stroke travels the lineage strip once, from the drive to the people, over 640ms on the standard curve: a stroke in the trace colour, no glow. The done panel rises 12px over 360ms on the enter curve.",
  reducedTiming: "Nothing travels; the done panel fades in over 160ms.",
  Stage: LiveStage,
});

const save = defineEntry<{ saves: number }>({
  id: "save-flight",
  section: "forms",
  title: "Save settle and the pending flight",
  initial: { saves: 0 },
  causes: [
    { id: "save", label: "Save", apply: (s) => ({ saves: s.saves + 1 }) },
  ],
  timing:
    "The button's words crossfade to a drawn check and “Saved” in the button's own colours, for 1.5s; the pending mark flies to the top bar's count over 640ms, and the count rolls to its new figure and settles as it lands. The first time ever, the tip rises 12px in beside the button over 360ms.",
  reducedTiming:
    "No flight: the count changes, “Saved” appears and the tip appears.",
  note: "“Forget first times” brings the tip back.",
  Stage: SaveStage,
});

const impact = defineEntry<{ changed: boolean }>({
  id: "impact-sharpens",
  section: "forms",
  title: "Impact sharpens",
  initial: { changed: false },
  causes: [
    {
      id: "address",
      label: "Change the address",
      apply: () => ({ changed: true }),
    },
  ],
  timing:
    "The impact line's icon changes from the screen with a check to the warning triangle with a crossfade over 160ms and a scale from 0.9 to 1 over 240ms; the line between this browser and the NAS opens a gap over 240ms.",
  reducedTiming:
    "The line and its icon swap with a 160ms crossfade, and the gap is there at once.",
  Stage: ImpactStage,
});

export const FORM_ENTRIES = [
  pathDraws,
  fansOut,
  summary,
  choice,
  moreOptions,
  strength,
  suggest,
  errors,
  run,
  live,
  save,
  impact,
];
