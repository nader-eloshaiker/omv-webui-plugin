// SPDX-License-Identifier: GPL-3.0-or-later
// What the reel's stages share that is not a component: the page's `still=1`, a figure that glides,
// and a path that draws when its answer turns it on. Each takes its reduced form from
// useReducedMotion. Development only (UI-11).
import { useGlide } from "@omv-webui/react-ui-components";
import { createContext, use, useEffect, useRef } from "react";
import type { DrawPathOptions } from "./helpers/drawPath.ts";
import { drawPath } from "./helpers/drawPath.ts";
import { useReducedMotion } from "./helpers/useReducedMotion.ts";

/** The page's `still=1`: timed returns (a check back to its copy glyph) wait for the next cause. */
export const StillContext = createContext(false);

export function useStill(): boolean {
  return use(StillContext);
}

/** A figure gliding to its target over `--duration-glide`; at the target at once when reduced. */
export function useGlideValue(target: number): number {
  const reduced = useReducedMotion();
  const glided = useGlide(target) ?? target;
  return reduced ? target : glided;
}

/**
 * A path drawn when `on` turns true and retracted when it turns false, never on the first render
 * (only a change is news). Returns the ref for the `<path>`.
 */
export function useDraw(on: boolean, options: DrawPathOptions = {}) {
  const pathRef = useRef<SVGPathElement>(null);
  const firstRef = useRef(true);
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
    });
  }, [on, duration, curve, delay]);
  return pathRef;
}
