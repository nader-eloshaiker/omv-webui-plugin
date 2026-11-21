// SPDX-License-Identifier: GPL-3.0-or-later
const SPACE_RUN = /\s+/g;

/**
 * Whether what was typed matches the name (style guide 5.4, UI-8): exact and case-sensitive, with
 * surrounding spaces ignored. For several names in one confirmation ("/dev/sdb /dev/sdc"), a run of
 * spaces in what was typed counts as one space, so the names must still be typed in their order. A
 * name that itself holds a run of spaces still matches when typed exactly as it is.
 */
export function typedMatches(value: string, confirmText: string) {
  const typed = value.trim();
  return typed === confirmText || typed.replace(SPACE_RUN, " ") === confirmText;
}
