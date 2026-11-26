// SPDX-License-Identifier: GPL-3.0-or-later
// "Show tips" and the first-time flags (useTipsStore, useSeenStore, UI-13) bound to the library's
// tips, which read no store themselves. A screen spreads `useTipsPreference()` on the library's
// `TipsProvider`; `useStoredHideTipsOffer` makes the "Hide tips too?" offer once in this browser.
// The words stay with the caller.
import type {
  HideTipsOffer,
  TipsProviderProps,
} from "@omv-webui/react-ui-components";
import { useHideTipsOffer } from "@omv-webui/react-ui-components";
import { useCallback } from "react";
import type { SeenKey } from "../stores/useSeenStore.ts";
import { isSeenKey, useSeenStore } from "../stores/useSeenStore.ts";
import { useTipsStore } from "../stores/useTipsStore.ts";

/** A tip's first success: it ends in this browser, whether or not it was on screen. */
export function endTip(id: SeenKey): void {
  useSeenStore.getState().markSeen(id);
}

/** Only a known flag is ever stored: an id outside the fixed list is ignored (UI-13). */
const onSeen = (id: string): void => {
  if (isSeenKey(id)) {
    endTip(id);
  }
};

/**
 * The `TipsProvider` props from the stores. `show` seeds what the view shows without writing the
 * store (a query string selects what is shown, UI-4); `onShowChange` replaces the store write.
 */
export function useTipsPreference(
  overrides: {
    show?: boolean;
    onShowChange?: (show: boolean) => void;
  } = {},
): Omit<TipsProviderProps, "children"> {
  const stored = useTipsStore((s) => s.show);
  const setStored = useTipsStore((s) => s.setShow);
  const seen = useSeenStore((s) => s.seen);
  return {
    show: overrides.show ?? stored,
    onShowChange: overrides.onShowChange ?? setStored,
    seen,
    onSeen,
  };
}

/** The library's offer with its once-only flag in this browser (useTipsStore.offered). */
export function useStoredHideTipsOffer(actionLabel: string): HideTipsOffer {
  const offered = useTipsStore((s) => s.offered);
  const onOffered = useCallback(() => {
    useTipsStore.getState().setOffered(true);
  }, []);
  return useHideTipsOffer({ offered, onOffered, actionLabel });
}
