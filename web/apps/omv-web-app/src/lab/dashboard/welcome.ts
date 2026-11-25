// SPDX-License-Identifier: GPL-3.0-or-later
// The first visit (rethink 6.8, owner decision 10): how the map comes in. Whether this browser has
// seen the first visit is a preference in src/stores/useWelcomeStore.ts (UI-13). Development only
// (UI-11).

/**
 * How the map comes in: it assembles row by row on a first visit or "Show me around", the one
 * entrance the owner approved (owner Q2). Every other visit, reduced motion, a screenshot (`still`)
 * and the loading skeleton show the page as it is, with no entrance.
 */
export type Assemble = "full" | "none";

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
  return firstVisit && !reduced && !still && !loading ? "full" : "none";
}
