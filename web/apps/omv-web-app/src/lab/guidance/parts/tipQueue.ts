// SPDX-License-Identifier: GPL-3.0-or-later
// The one-at-a-time rule for first-time tips (rethink P.3, layer G2), as data. Several tips may want
// to show at once; only the first in reading order does. A tip that has the turn keeps it until it
// no longer wants it (it ended, or is leaving), so a tip on screen never vanishes because another,
// earlier one became due; then the first waiting tip in reading order takes the turn. Reading order
// is the document's order of each tip's anchor element, so a tip needs no number. Development only
// (UI-11) until the owner has seen it.

/** The waiting tips and the one whose turn it is. */
export interface TipQueue {
  wanting: ReadonlyMap<string, Element>;
  turn: string | null;
}

export const EMPTY_QUEUE: TipQueue = { wanting: new Map(), turn: null };

/** The id of the tip whose anchor comes first in the document, or null when none is waiting. */
export function firstInReadingOrder(
  wanting: ReadonlyMap<string, Element>,
): string | null {
  let first: [string, Element] | null = null;
  for (const entry of wanting) {
    if (
      first === null ||
      first[1].compareDocumentPosition(entry[1]) &
        Node.DOCUMENT_POSITION_PRECEDING
    ) {
      first = entry;
    }
  }
  return first?.[0] ?? null;
}

/** The holder keeps its turn while it still wants it; otherwise the first in reading order has it. */
function settle(wanting: ReadonlyMap<string, Element>, turn: string | null) {
  return {
    wanting,
    turn:
      turn !== null && wanting.has(turn) ? turn : firstInReadingOrder(wanting),
  };
}

/** A tip, anchored at `el`, wants to show. */
export function wantTurn(queue: TipQueue, id: string, el: Element): TipQueue {
  if (queue.wanting.get(id) === el) {
    return queue;
  }
  const wanting = new Map(queue.wanting);
  wanting.set(id, el);
  return settle(wanting, queue.turn);
}

/** A tip no longer wants to show: it ended, or tips were turned off. */
export function releaseTurn(queue: TipQueue, id: string): TipQueue {
  if (!queue.wanting.has(id)) {
    return queue;
  }
  const wanting = new Map(queue.wanting);
  wanting.delete(id);
  return settle(wanting, queue.turn);
}
