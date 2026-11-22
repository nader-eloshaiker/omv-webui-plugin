// SPDX-License-Identifier: GPL-3.0-or-later
// Server text inside one of our sentences keeps its own direction (UI-2 is about markup; this is about
// reading order): a right-to-left model name must not reorder the English around it. In markup the
// value goes in a <bdi> (components/atoms/Slotted.tsx); where only a string can go (a select's item,
// an accessible name, a catalogue value), it is wrapped in Unicode's first-strong isolate.
//
// An isolate keeps a name from reordering the sentence around it, but not from reordering itself: a
// name holding a right-to-left override ("U+202E evil.exe") still shows as "exe.live", so it can pass
// for another name. `inertBidi` is for display only: every bidirectional control in the text is shown
// as the replacement character "�" (U+FFFD), so the reader sees that something is there and sees the
// letters in the order they are stored. Replaced, not stripped, so two names differing only by a
// hidden control never look the same. The controls are the embeddings and overrides (U+202A to
// U+202E), the isolates (U+2066 to U+2069) and the marks (U+200E, U+200F, U+061C): a mark cannot
// reverse letters, but it can still move whole words of a name past each other. The cost is that a
// right-to-left name written with a mark in it shows "�" where the mark was. The value sent to the
// backend, matched against rows, or put in an address is always the stored one, never this.

const FSI = "⁨";
const PDI = "⁩";

/** `text` as an isolate: its direction is its own, and it does not reorder what is around it. */
export const isolate = (text: string): string => `${FSI}${text}${PDI}`;

/** Placeholders for the slots of a sentence, unlikely in any translation. */
export const slotToken = (index: number): string =>
  `\u0001${String(index)}\u0001`;

const BIDI_CONTROLS = /[؜‎‏‪-‮⁦-⁩]/gu;

/** What a bidirectional control in server text is shown as. */
export const BIDI_PLACEHOLDER = "�";

/** Server text for display, with each bidirectional control shown as "�" (see above). */
export const inertBidi = (text: string): string =>
  text.replace(BIDI_CONTROLS, BIDI_PLACEHOLDER);

/** Server text for a sentence: its controls shown, then isolated from the words around it. */
export const isolateName = (text: string): string => isolate(inertBidi(text));
