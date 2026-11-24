// SPDX-License-Identifier: GPL-3.0-or-later
// The pending flight (foundation 7.2 and 10): when a save leaves configuration pending, a small pending
// mark flies from the control that saved into the top bar's pending pill. The transport says when a
// change was left pending (onPendingChanges, after every successful x-omv-dirty call); this module
// remembers which control the reader last used to save (the form's submitter, or the button, switch or
// menu item they pressed), so the mark starts there. It never builds a call or reads a reply. Under
// reduced motion, or when the control is gone or off screen, nothing flies; the pill and the band
// still say what happened.
import { onPendingChanges } from "@omv-webui/react-api-omv/transport";
import { flyPendingMark } from "@omv-webui/react-ui-components";
import { useEffect, type RefObject } from "react";

/** A press this long before the change was reported is still the one that saved. */
const PRESS_WINDOW_MS = 15_000;
/** Several dirty calls from one save are one flight. */
const COALESCE_MS = 1_200;

const PRESSABLE =
  "button, [role='button'], [role='switch'], [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], input[type='checkbox'], input[type='radio']";

interface Press {
  element: Element;
  at: number;
}

/** Where a flight should start: the control last pressed, if it is still on the page. */
export function originOf(
  press: Press | null,
  now: number = performance.now(),
): Element | null {
  if (press === null || now - press.at > PRESS_WINDOW_MS) {
    return null;
  }
  return press.element.isConnected ? press.element : null;
}

/**
 * Fly a pending mark into `target` whenever the transport reports configuration left pending. Mount
 * once, in the shell, for administrators (they are the ones who see the pill).
 */
export function usePendingFlight(target: RefObject<Element | null>): void {
  useEffect(() => {
    let press: Press | null = null;
    let lastFlight = Number.NEGATIVE_INFINITY;
    const remember = (element: Element | null) => {
      if (element) {
        press = { element, at: performance.now() };
      }
    };
    const onSubmit = (event: SubmitEvent) => {
      remember(event.submitter ?? null);
    };
    const onClick = (event: MouseEvent) => {
      remember(
        event.target instanceof Element
          ? event.target.closest(PRESSABLE)
          : null,
      );
    };
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    const off = onPendingChanges(() => {
      const now = performance.now();
      const to = target.current;
      const from = originOf(press, now);
      if (to === null || from === null || now - lastFlight < COALESCE_MS) {
        return;
      }
      lastFlight = now;
      void flyPendingMark(from, to);
    });
    return () => {
      off();
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [target]);
}
