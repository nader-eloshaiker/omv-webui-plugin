// SPDX-License-Identifier: GPL-3.0-or-later
// A first-time flourish or tip (rethink P.3 layer G2, 7.1 rule 4), bound to this browser's first-time
// flags (useSeenStore, whose names are a fixed list, UI-13): the library's `useFirstTime` with the
// flag read from and written to the store.
import { useFirstTime as useLibraryFirstTime } from "@omv-webui/react-ui-components";
import { useCallback } from "react";
import type { SeenKey } from "../stores/useSeenStore.ts";
import { hasSeen, useSeenStore } from "../stores/useSeenStore.ts";
import { useWelcomeStore } from "../stores/useWelcomeStore.ts";

/** Whether this browser has seen `key` yet (`first`), and `done()` to remember that it has. */
export function useFirstTime(key: SeenKey): {
  first: boolean;
  done: () => void;
} {
  const seen = useSeenStore(hasSeen(key));
  const markSeen = useCallback(() => {
    useSeenStore.getState().markSeen(key);
  }, [key]);
  return useLibraryFirstTime(seen, markSeen);
}

/** Forget one flag, so its first time comes again (the reel's "First visit to the page"). */
export function forgetFirstTime(key: SeenKey): void {
  useSeenStore.getState().forget(key);
}

/**
 * The dashboard's first visit (rethink 6.8, owner decision 10): the map assembling and the welcome,
 * on its own flag (useWelcomeStore, `omv-webui.seen.dashboard-welcome`). The map takes `!first` as
 * `seen` and `done` as `onSeen`.
 */
export function useDashboardFirstVisit(): { first: boolean; done: () => void } {
  const seen = useWelcomeStore((s) => s.seen);
  const markSeen = useCallback(() => {
    useWelcomeStore.getState().setSeen(true);
  }, []);
  return useLibraryFirstTime(seen, markSeen);
}
