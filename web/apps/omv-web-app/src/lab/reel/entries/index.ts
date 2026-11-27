// SPDX-License-Identifier: GPL-3.0-or-later
// Every entry of the motion reel in the catalogue's order, and what was left out and why.
// Development only (UI-11).
import type { AnyEntry } from "../types.ts";
import { DASHBOARD_ENTRIES } from "./dashboard.ts";
import { DIAGRAM_ENTRIES } from "./diagrams.ts";
import { EMPTY_ENTRIES } from "./empty.ts";
import { FORM_ENTRIES } from "./forms.ts";
import { ICON_ENTRIES } from "./icons.ts";
import { TABLE_ENTRIES } from "./tables.ts";
import { WELCOME_ENTRIES } from "./welcome.ts";

export const ENTRIES: readonly AnyEntry[] = [
  ...WELCOME_ENTRIES,
  ...EMPTY_ENTRIES,
  ...FORM_ENTRIES,
  ...TABLE_ENTRIES,
  ...DASHBOARD_ENTRIES,
  ...ICON_ENTRIES,
  ...DIAGRAM_ENTRIES,
];

export const LEFT_OUT: readonly string[] = [
  "The empty state's picture does not assemble when an empty view is first shown: that is an entrance nobody caused, so the picture is still.",
  "Area chips are gone, and with them the pill that crossfaded and the chip that scrolled to its lane.",
  "The blink light's rays do not pulse with the hardware light: nothing pulses and drawings of disks have no light. The word “Blinking” stands beside a still icon.",
  "A row has no coloured leading edge; the whole row takes its status's wash once.",
  "The live line has no moving dot and there are no sparklines: live dots are out, and the sparklines showed figures the backend does not give.",
  "A field's critical edge does not draw in from the left; the whole border turns critical.",
  "The copy direction's dash travels once per cause, not twice.",
];
