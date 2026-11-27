// SPDX-License-Identifier: GPL-3.0-or-later
// "Show me around" (rethink 6.8, owner decision 10), from the dashboard's This NAS or the account
// menu: how many times it was asked for in this tab, and how many of those a dashboard visit has
// already played, in memory only. A dashboard replays its first visit for every ask it has not
// played, so an ask from the menu on another page plays on arrival; leaving the dashboard marks
// them played. The counts are not stored and nothing is sent; the welcome's first-time flag is
// forgotten, so the welcome shows again for that visit.
import { useSeenStore } from "../stores/useSeenStore.ts";
import { createMemoryStore } from "./memoryStore.ts";

export const showAround = createMemoryStore<{
  asked: number;
  played: number;
}>({ asked: 0, played: 0 });

/** One more "Show me around". */
export function askShowAround(): void {
  useSeenStore.getState().forget("tip.new-interface");
  showAround.set((s) => ({ asked: s.asked + 1 }));
}

/** A dashboard visit ends: every ask so far has been played. */
export function showAroundPlayed(): void {
  showAround.set((s) => ({ played: s.asked }));
}
