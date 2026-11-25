// SPDX-License-Identifier: GPL-3.0-or-later
// A first-time flourish or tip (rethink P.3 layer G2, 7.1 rule 4): whether this browser has seen
// `key` yet, and `done()` to remember that it has. Over useSeenStore, whose names are a fixed list
// (UI-13). `first` follows the store, so a caller that must keep showing what it started (a tip that
// stays until dismissed) keeps its own copy from the moment it began. Written for the library (spec 8
// row 7).
import { useCallback } from "react";
import type { SeenKey } from "../../../stores/useSeenStore.ts";
import { hasSeen, useSeenStore } from "../../../stores/useSeenStore.ts";

export function useFirstTime(key: SeenKey): {
  first: boolean;
  done: () => void;
} {
  const seen = useSeenStore(hasSeen(key));
  const done = useCallback(() => {
    useSeenStore.getState().markSeen(key);
  }, [key]);
  return { first: !seen, done };
}

/** Forget one flag, so its first time comes again (the reel's "First visit to the page"). */
export function forgetFirstTime(key: SeenKey): void {
  useSeenStore.setState((state) => ({
    seen: state.seen.filter((k) => k !== key),
  }));
}
