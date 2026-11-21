// SPDX-License-Identifier: GPL-3.0-or-later
// Server text inside one of our sentences keeps its own direction (UI-2 is about markup; this is about
// reading order): a right-to-left model name must not reorder the English around it. In markup the
// value goes in a <bdi> (components/atoms/Slotted.tsx); where only a string can go (a select's item,
// an accessible name, a catalogue value), it is wrapped in Unicode's first-strong isolate.

const FSI = "⁨";
const PDI = "⁩";

/** `text` as an isolate: its direction is its own, and it does not reorder what is around it. */
export const isolate = (text: string): string => `${FSI}${text}${PDI}`;

/** Placeholders for the slots of a sentence, unlikely in any translation. */
export const slotToken = (index: number): string =>
  `\u0001${String(index)}\u0001`;
