// SPDX-License-Identifier: GPL-3.0-or-later
// The design lab's motion helpers: development only (UI-11). Native only: the View Transitions API
// for page changes, the Web Animations API for movement that depends on geometry, and CSS for the
// rest. Every helper checks prefers-reduced-motion and degrades to a cut or a fade without movement.
// Nothing here writes a style attribute into markup; geometry is set through the CSSOM, which the
// policy allows (style-src 'self' forbids style elements and attributes in markup, not element.style).
import { useEffect, useRef, useState } from "react";

export function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Direction = "forward" | "back" | "none";

/**
 * Change the view inside a view transition. The direction is put on <html> so the stylesheet can
 * slide the main region the way navigation went; the shell is named separately and stays still.
 */
let committed: (() => void) | null = null;

/** LabRoot calls this from a layout effect once the new view is in the DOM. */
export function viewCommitted(): void {
  committed?.();
  committed = null;
}

export function viewChange(update: () => void, direction: Direction): void {
  const root = document.documentElement;
  if (!("startViewTransition" in document) || reducedMotion()) {
    update();
    return;
  }
  root.dataset.labNav = direction;
  const transition = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        committed = resolve;
        update();
        // A view that renders nothing new still finishes the transition.
        window.setTimeout(resolve, 400);
      }),
  );
  void transition.finished.finally(() => {
    delete root.dataset.labNav;
  });
}

const easeOut = "cubic-bezier(0.2, 0, 0, 1)";

/** A number that eases to its new value: live readings glide instead of jumping. */
export function useTween(target: number, ms = 600): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const shown = useRef(target);
  useEffect(() => {
    if (reducedMotion()) {
      shown.current = target;
      setValue(target);
      return;
    }
    from.current = shown.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      shown.current = from.current + (target - from.current) * e;
      setValue(shown.current);
      if (k < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [target, ms]);
  return value;
}

/**
 * The pending mark travels from where the change was saved to the pending indicator, so the reader
 * sees where their change went. A fixed element made through the DOM, positioned through the CSSOM,
 * animated with the Web Animations API, removed when it lands. Under reduced motion it does not run.
 */
export function flyPending(from: Element, to: Element): Promise<void> {
  if (reducedMotion()) {
    return Promise.resolve();
  }
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const dot = document.createElement("div");
  dot.className = "lx-flyer";
  document.body.append(dot);
  const x0 = a.left + a.width / 2 - 6;
  const y0 = a.top + a.height / 2 - 6;
  const x1 = b.left + b.width / 2 - 6;
  const y1 = b.top + b.height / 2 - 6;
  const lift = Math.min(160, Math.abs(y1 - y0) * 0.35 + 40);
  const mx = (x0 + x1) / 2;
  const my = Math.min(y0, y1) - lift;
  const animation = dot.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(0.4)`, opacity: 0 },
      {
        transform: `translate(${x0}px, ${y0}px) scale(1.15)`,
        opacity: 1,
        offset: 0.12,
      },
      {
        transform: `translate(${mx}px, ${my}px) scale(1)`,
        opacity: 1,
        offset: 0.55,
      },
      { transform: `translate(${x1}px, ${y1}px) scale(0.7)`, opacity: 0.9 },
    ],
    { duration: 620, easing: easeOut },
  );
  return animation.finished.then(
    () => {
      dot.remove();
    },
    () => {
      dot.remove();
    },
  );
}

/** One short, decaying pulse on an element: the reader's eye goes to what just changed. */
export function pulse(element: Element | null): void {
  if (!element || reducedMotion()) {
    return;
  }
  element.animate([{ transform: "scale(0.82)" }, { transform: "scale(1)" }], {
    duration: 520,
    easing:
      "linear(0, 0.101, 0.319, 0.561, 0.771, 0.926, 1.023, 1.071, 1.084, 1.075, 1.057, 1.037, 1.019, 1.006, 0.998, 0.994, 0.993, 0.994, 0.995, 0.997, 0.998, 0.999, 1)",
  });
}
