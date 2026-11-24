// SPDX-License-Identifier: GPL-3.0-or-later
// When this session's "Not applied yet" marks may be forgotten. A page remembers, for the session,
// what it saved since the last apply and shows the mark beside it while the module that save marked
// is pending. The mark is forgotten once none of its modules is pending any more (an apply or an undo
// ran, here or elsewhere), but only on a reading of the pending modules that was asked for after the
// save. A reading already on its way when the save landed, or answered just before it and rendered
// just after, shows the server from before the write: it says nothing about the change, and must not
// forget it.
//
// The order is kept by counting the replies of the one pending-modules read (System.getInformation's
// cache entry, fed in by connectSavedMarks as the query cache reports each change), never by clocks
// or by when a page's effect runs. TanStack Query runs at most one fetch of an entry at a time, so
// of the replies that land after a save, only those on their way at that moment can have been asked
// for before it: a save waits for the reply after them. Waiting one read too long only keeps a mark
// that is not shown (its module is no longer pending) until the next reading.
//
// No page forgets anything: each session store tracks its marks here once, and records each save.

/** One store's marks that are forgotten together. */
export interface TrackedMarks {
  /** A save that marks one of the modules pending: from now on, only a later reading may forget. */
  saved(): void;
}

export interface SavedMarks {
  /**
   * Track a store's marks: `forget` runs once a reading asked for after the latest save shows none
   * of `modules` pending.
   */
  track(modules: readonly string[], forget: () => void): TrackedMarks;
  /** How many fetches of the pending-modules read are on their way now. */
  readsInFlight(count: number): void;
  /** A reply of the pending-modules read, with the modules it reports pending. */
  answered(pending: readonly string[]): void;
  /** The session ended (its stores are emptied): no save is outstanding. */
  reset(): void;
}

interface Group {
  modules: readonly string[];
  forget: () => void;
}

export function createSavedMarks(): SavedMarks {
  let answers = 0;
  let inFlight = 0;
  /** Each group with a save outstanding, and the number of the first reply that may forget it. */
  const waiting = new Map<Group, number>();
  return {
    track(modules, forget) {
      const group: Group = { modules, forget };
      return {
        saved() {
          // A later save moves the wait on: a reading between the two says nothing about this one.
          waiting.set(group, answers + inFlight + 1);
        },
      };
    },
    readsInFlight(count) {
      inFlight = count;
    },
    answered(pending) {
      answers += 1;
      for (const [group, from] of [...waiting]) {
        if (
          answers >= from &&
          !group.modules.some((m) => pending.includes(m))
        ) {
          waiting.delete(group);
          group.forget();
        }
      }
    },
    reset() {
      waiting.clear();
    },
  };
}

/** The application's one instance, fed by connectSavedMarks (app.ts). */
export const savedMarks = createSavedMarks();
