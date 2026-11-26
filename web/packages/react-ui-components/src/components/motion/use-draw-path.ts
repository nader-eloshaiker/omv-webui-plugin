// SPDX-License-Identifier: GPL-3.0-or-later
// A path that draws when its cause turns it on and retracts when it turns off (rethink 7.1 rule 1:
// once per cause), never on the first render, because only a change is news: a path that is on when
// the page opens is simply there. The drawing is `drawPath`, so its reduced form is the same short
// crossfade.
import { useEffect, useRef } from "react";
import type { DrawPathOptions } from "./draw-path";
import { drawPath } from "./draw-path";
import { useReducedMotion } from "./reduced-motion";

type UseDrawPathOptions = Pick<DrawPathOptions, "duration" | "curve" | "delay">;

/**
 * Returns the ref for the `<path>` (or any SVG shape). `on` true draws it, false retracts it; the
 * first render sets it at its end state without moving.
 */
export function useDrawPath<T extends SVGGeometryElement = SVGPathElement>(
  on: boolean,
  options: UseDrawPathOptions = {},
) {
  const pathRef = useRef<T>(null);
  const firstRef = useRef(true);
  // Read when the cause comes: `reduced` changing is not a cause, only `on` and the timing are.
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  });
  const { duration, curve, delay } = options;
  useEffect(() => {
    const path = pathRef.current;
    if (!path) {
      return;
    }
    if (firstRef.current) {
      firstRef.current = false;
      path.setAttribute("pathLength", "1");
      path.style.setProperty("stroke-dasharray", "1");
      path.style.setProperty("stroke-dashoffset", on ? "0" : "1");
      return;
    }
    void drawPath(path, {
      direction: on ? "draw" : "retract",
      duration,
      curve,
      delay,
      // The preference and a reduced scope reach React first; otherwise the element's scope decides.
      reduced: reducedRef.current ? true : undefined,
    });
  }, [on, duration, curve, delay]);
  return pathRef;
}

export type { UseDrawPathOptions };
