// SPDX-License-Identifier: GPL-3.0-or-later
// The "Hide tips too?" offer (rethink P.3, R5): the first time a person shows they are a pro (they
// switch to compact density, or use a jump key), a toast offers to hide tips, with a button that
// does. It never blocks, stays until it is dismissed or for 8 seconds, and is made once in this
// browser; it is not made when tips are already off. The library keeps no flag and no words: the app
// says whether the offer was made, how to remember that it was, and what the toast says.
import { useCallback, useEffect, useRef } from "react";
import { useToast } from "../toast/use-toast";
import { useShowTips } from "./tips-context";

/** How long the offer stays when nobody answers it. */
export const HIDE_TIPS_OFFER_MS = 8000;

interface HideTipsOfferOptions {
  /** The offer has been made in this browser before: the app's stored flag. */
  offered: boolean;
  /** The offer was just made: the app stores the flag. */
  onOffered: () => void;
  /** The toast's button, which turns tips off: "Hide tips". */
  actionLabel: string;
}

interface HideTipsOffer {
  /**
   * Makes the offer, with `title` as the toast's words ("Compact view on. Hide tips too?"), if it
   * has not been made and tips are on; says whether it was made.
   */
  offer: (title: string) => boolean;
  /**
   * Shows the offer without recording it, for a screenshot of a view the query string selects (a
   * query selects what is shown, it never writes a preference). `hold` keeps it up.
   */
  preview: (title: string, hold: boolean) => void;
}

/** Needs the `TipsProvider` whose "Show tips" it turns off, and a `Toaster`. */
export function useHideTipsOffer({
  offered,
  onOffered,
  actionLabel,
}: HideTipsOfferOptions): HideTipsOffer {
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
    (title: string, hold: boolean) => {
      let id = "";
      id = toast.show({
        title,
        action: {
          label: actionLabel,
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
          }, HIDE_TIPS_OFFER_MS),
        );
      }
    },
    [toast, setShow, actionLabel],
  );

  // Made here already, before the app's flag has come back round (two causes in one moment).
  const madeRef = useRef(false);
  useEffect(() => {
    // The app forgot the flag ("Show me around"): the offer may be made again.
    if (!offered) {
      madeRef.current = false;
    }
  }, [offered]);
  const offer = useCallback(
    (title: string) => {
      if (!show || offered || madeRef.current) {
        return false;
      }
      madeRef.current = true;
      onOffered();
      present(title, false);
      return true;
    },
    [show, offered, onOffered, present],
  );

  return { offer, preview: present };
}

export type { HideTipsOffer, HideTipsOfferOptions };
