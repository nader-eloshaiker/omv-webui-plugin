// SPDX-License-Identifier: GPL-3.0-or-later
// The motion reel's icons entries: each motion's causes, its timing in words and its stage
// (src/lab/reel/stages/icons.tsx). Development only (UI-11).
import type { Act, IconsState } from "../stages/icons.tsx";
import { IconsStage } from "../stages/icons.tsx";
import { defineEntry } from "../types.ts";

const ALL: Act[] = [
  "create",
  "undo",
  "refresh",
  "restart",
  "apply",
  "access",
  "health",
  "share",
  "mount",
  "wipe",
];

const icons = defineEntry<IconsState>({
  id: "icons",
  section: "icons",
  title: "Icons that act out their action",
  initial: { done: {}, badge: "warning" },
  causes: [
    {
      id: "succeed",
      label: "Succeed",
      apply: (s) => ({
        badge: "ok",
        done: Object.fromEntries(ALL.map((a) => [a, (s.done[a] ?? 0) + 1])),
      }),
    },
  ],
  timing:
    "Point at or focus a button: after an 80ms intent delay its icon acts once. Create's plus turns 90° on the settle spring and on success becomes a check; Undo turns back 30° and on success a quarter turn back; Refresh turns once per refresh and past 300ms the spinner takes over; Restart's loop arrow turns a quarter; Apply's check nudges toward the bar; Give access's key slides 2px and on success turns a quarter; Check health's pulse line traces once. A status badge that changes crossfades in from a 0.9 scale over 240ms. Delete and Wipe do nothing on hover; Wipe's sweep strokes draw once on success.",
  reducedTiming: "Every icon stays still; success shows the end state.",
  note: "Waiting for the icon sheet: Stop sharing (the ribbon tucks away and a stroke draws through it), Delete's lid lifting and closing as the row leaves, and the copy job's dash.",
  Stage: IconsStage,
});

export const ICON_ENTRIES = [icons];
