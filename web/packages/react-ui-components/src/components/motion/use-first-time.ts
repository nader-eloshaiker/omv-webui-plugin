// SPDX-License-Identifier: GPL-3.0-or-later
// A first-time flourish (rethink P.3 layer G2, 7.1 rule 4): the assembling motion runs in full the
// first time in this browser and is a 160ms fade afterwards. The library keeps no flags: the app
// says whether this one has been seen and how to remember it (its first-time store, UI-13).
import { useCallback, useEffect, useRef } from "react";

interface FirstTime {
  /** Nobody has seen it in this browser yet: play it in full. */
  first: boolean;
  /** Remember that it has been seen. Stable across renders. */
  done: () => void;
}

/**
 * `first` follows `seen`, so a caller that must keep showing what it started (a flourish that is
 * running, a tip that stays until dismissed) keeps its own copy from the moment it began.
 */
export function useFirstTime(seen: boolean, markSeen: () => void): FirstTime {
  const markRef = useRef(markSeen);
  useEffect(() => {
    markRef.current = markSeen;
  });
  const done = useCallback(() => {
    markRef.current();
  }, []);
  return { first: !seen, done };
}

export type { FirstTime };
