// SPDX-License-Identifier: GPL-3.0-or-later
// What the home-folders page keeps in memory for the session (phase 5 users design 12.3, 0.4): whether
// this session turned home folders on or off since the last apply, for the pending mark beside the
// state line while Windows and Mac sharing (`samba`) is pending. In memory only (UI-13); emptied when
// the session ends (app.ts).
import { savedMarks } from "../pending/savedMarks.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";

export interface HomeSessionState {
  /** This session saved the setting, and no apply or undo has run since. */
  saved: boolean;
}

export const homeSession = createMemoryStore<HomeSessionState>({
  saved: false,
});

/** Once `samba` is no longer pending (an apply or an undo ran), the mark is forgotten (savedMarks.ts). */
const marks = savedMarks.track(["samba"], () =>
  homeSession.set((s) => (s.saved ? { saved: false } : {})),
);

/** The setting was saved (turned on or off). */
export const recordHomeSaved = (): void => {
  marks.saved();
  homeSession.set((s) => (s.saved ? {} : { saved: true }));
};

/** The pending mark beside the state line. */
export const homePending = (
  state: HomeSessionState,
  pending: readonly string[],
): boolean => state.saved && pending.includes("samba");
