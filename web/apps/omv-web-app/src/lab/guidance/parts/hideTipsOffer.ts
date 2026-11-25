// SPDX-License-Identifier: GPL-3.0-or-later
// The "Hide tips too?" offer (rethink P.3, R5): the first time a person shows they are a pro (they
// switch to compact density, or use a jump key), a toast offers to hide tips, with a Hide tips
// button. It never blocks, stays until it is dismissed or for 8 seconds, and is made once in this
// browser (useTipsStore.offered); it is not made when tips are already off. Development only
// (UI-11) until the owner has seen it.
import { useToast } from "@omv-webui/react-ui-components";
import { useCallback, useEffect, useRef } from "react";
import { useTipsStore } from "../../../stores/useTipsStore.ts";
import { useShowTips } from "./tipsContext.ts";

/** What the person did that showed they are a pro. */
export type OfferCause = "compact" | "keys";

export const OFFER_WORDS: Record<OfferCause, string> = {
  compact: "Compact view on. Hide tips too?",
  keys: "You found the shortcuts. Hide tips too?",
};

export const OFFER_ACTION = "Hide tips";

/** How long the offer stays when nobody answers it. */
export const OFFER_MS = 8000;

export function useHideTipsOffer(): {
  /** Makes the offer if it has not been made and tips are on; says whether it was made. */
  offer: (cause: OfferCause) => boolean;
  /**
   * Shows the offer without recording it, for a screenshot of a view the query string selects
   * (UI-4: a query selects what is shown, it never writes a preference). `hold` keeps it up.
   */
  preview: (cause: OfferCause, hold: boolean) => void;
} {
  const toast = useToast();
  const [show, setShow] = useShowTips();
  const timersRef = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const t of timersRef.current) {
        window.clearTimeout(t);
      }
    },
    [],
  );

  const present = useCallback(
    (cause: OfferCause, hold: boolean) => {
      let id = "";
      id = toast.show({
        title: OFFER_WORDS[cause],
        action: {
          label: OFFER_ACTION,
          onClick: () => {
            setShow(false);
            toast.close(id);
          },
        },
      });
      if (!hold) {
        timersRef.current.push(
          window.setTimeout(() => {
            toast.close(id);
          }, OFFER_MS),
        );
      }
    },
    [toast, setShow],
  );

  const offer = useCallback(
    (cause: OfferCause) => {
      const tips = useTipsStore.getState();
      if (!show || tips.offered) {
        return false;
      }
      tips.setOffered(true);
      present(cause, false);
      return true;
    },
    [show, present],
  );

  return { offer, preview: present };
}
