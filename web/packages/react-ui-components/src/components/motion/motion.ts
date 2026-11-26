// SPDX-License-Identifier: GPL-3.0-or-later
// Motion that depends on data and so cannot be a CSS keyframe: a number gliding to its new value, a
// live line moving one step. Both read the motion tokens and check reduced motion, and both land on
// their end state at once when motion is reduced (foundation 7.3). Nothing here writes a style
// attribute; the Web Animations API and React state only. The tokens, the reduced-motion sources and
// the other motion helpers sit beside this file (motion-tokens.ts, reduced-motion.ts).
import * as React from "react";
import type { DurationToken } from "./motion-tokens";
import { DURATION_FALLBACK, timeMs } from "./motion-tokens";
import { systemReducedMotion, useReducedMotion } from "./reduced-motion";

/** Whether the reader's system asks for reduced motion. False where there is no matchMedia (a test, SSR). */
export function prefersReducedMotion(): boolean {
  return systemReducedMotion();
}

/**
 * A duration token in milliseconds, as the page resolves it now on <html>, so reduced motion (which
 * sets the tokens to 0ms in design/tokens.css) is honoured without a second rule; 0 when the system
 * asks for reduced motion. `fallback` (by default the token file's value) when unreadable.
 */
export function durationToken(
  name: DurationToken,
  fallback: number = DURATION_FALLBACK[name],
): number {
  if (prefersReducedMotion()) {
    return 0;
  }
  if (typeof document === "undefined") {
    return fallback;
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  return timeMs(raw) ?? fallback;
}

/**
 * The value shown while it glides to `target` (foundation 7.2, "value glide"): an ease-out over the
 * glide token, so a live figure says that it changed and by how much without jittering. `null` is
 * shown at once (a missing reading is never animated into), and so is everything under reduced
 * motion: the system's, the "Animations" preference (`MotionProvider`) or a `MotionScope reduced`.
 */
export function useGlide(target: number | null): number | null {
  const reduced = useReducedMotion();
  const [shown, setShown] = React.useState(target);
  const currentRef = React.useRef(target);
  React.useEffect(() => {
    const from = currentRef.current;
    const ms = reduced ? 0 : durationToken("--duration-glide");
    if (target === null || from === null || ms === 0 || from === target) {
      currentRef.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - k) ** 3;
      currentRef.current = from + (target - from) * eased;
      setShown(currentRef.current);
      if (k < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    // A new target starts from wherever this one had got to.
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [target, reduced]);
  // Under reduced motion the target is shown in the same render, not one effect later.
  return reduced ? target : shown;
}
