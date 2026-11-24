// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";

interface ShrinkOnScrollOptions {
  /** Shrink once the page has scrolled further than this (px). */
  shrinkAfter?: number;
  /** Come back once the page is nearer the top than this (px): near the top again. */
  returnBefore?: number;
  /** While focus is inside this element it never shrinks, so focus is never lost to `inert`. */
  keepWhileFocused?: React.RefObject<HTMLElement | null>;
}

/**
 * Whether the window has scrolled far enough that a band under the top bar should shrink out of the
 * way, with hysteresis: it shrinks past `shrinkAfter` and only comes back under `returnBefore`, so
 * the layout change shrinking causes can never make it flicker. Read once per frame while scrolling
 * (a passive listener), and never while `enabled` is false.
 */
export function useShrinkOnScroll(
  enabled: boolean,
  {
    shrinkAfter = 160,
    returnBefore = 24,
    keepWhileFocused,
  }: ShrinkOnScrollOptions = {},
): boolean {
  const [shrunk, setShrunk] = React.useState(false);
  React.useEffect(() => {
    if (!enabled) {
      return;
    }
    let frame = 0;
    const check = () => {
      frame = 0;
      const y = window.scrollY;
      const holder = keepWhileFocused?.current;
      const focused =
        holder !== null &&
        holder !== undefined &&
        holder.contains(document.activeElement) &&
        document.activeElement !== holder;
      setShrunk((was) =>
        focused ? false : was ? y > returnBefore : y > shrinkAfter,
      );
    };
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(check);
      }
    };
    frame = requestAnimationFrame(check);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, [enabled, shrinkAfter, returnBefore, keepWhileFocused]);
  return enabled && shrunk;
}
