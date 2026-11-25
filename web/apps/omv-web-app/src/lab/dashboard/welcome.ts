// SPDX-License-Identifier: GPL-3.0-or-later
// The first visit (rethink 6.8, owner decision 10): how the map comes in. Whether this browser has
// seen the first visit is a preference in src/stores/useWelcomeStore.ts (UI-13). Development only
// (UI-11).

/**
 * How the map comes in: it assembles row by row on a first visit or "Show me around", as a fade in
 * reduced motion; a later visit fades; a screenshot (`still`) and the loading skeleton do not move.
 */
export type Assemble = "full" | "fade" | "none";

export function assembleFor({
  firstVisit,
  reduced,
  still,
  loading,
}: {
  firstVisit: boolean;
  reduced: boolean;
  still: boolean;
  loading: boolean;
}): Assemble {
  if (still || loading) {
    return "none";
  }
  return firstVisit && !reduced ? "full" : "fade";
}
