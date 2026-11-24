// SPDX-License-Identifier: GPL-3.0-or-later
// Motion that depends on data and so cannot be a CSS keyframe: a number gliding to its new value, a
// live line moving one step. Both read the motion tokens and check prefers-reduced-motion, and both
// land on their end state at once when motion is reduced (foundation 7.3). Nothing here writes a
// style attribute; the Web Animations API and React state only.
import * as React from "react";

/** Whether the reader asked for reduced motion. False where there is no matchMedia (a test, SSR). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * A duration token in milliseconds, as the page resolves it now, so reduced motion (which sets the
 * tokens to 0ms in design/tokens.css) is honoured without a second rule. `fallback` when unreadable.
 */
export function durationToken(name: string, fallback: number): number {
  if (prefersReducedMotion()) {
    return 0;
  }
  if (typeof document === "undefined") {
    return fallback;
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const match = /^([\d.]+)(ms|s)$/.exec(raw);
  if (!match) {
    return fallback;
  }
  const n = Number(match[1]);
  return match[2] === "s" ? n * 1000 : n;
}

/**
 * The value shown while it glides to `target` (foundation 7.2, "value glide"): an ease-out over the
 * glide token, so a live figure says that it changed and by how much without jittering. `null` is
 * shown at once (a missing reading is never animated into), and so is everything under reduced
 * motion.
 */
export function useGlide(target: number | null): number | null {
  const [shown, setShown] = React.useState(target);
  const currentRef = React.useRef(target);
  React.useEffect(() => {
    const from = currentRef.current;
    const ms = durationToken("--duration-glide", 640);
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
  }, [target]);
  return shown;
}
