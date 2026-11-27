// SPDX-License-Identifier: GPL-3.0-or-later
// The design lab's motion helper: development only (UI-11). A number that eases to a new value, for
// the forms prototype's lineage strip. Under prefers-reduced-motion it jumps. Nothing here writes a
// style attribute into markup.
import { useEffect, useRef, useState } from "react";

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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
