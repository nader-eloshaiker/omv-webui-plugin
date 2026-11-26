// SPDX-License-Identifier: GPL-3.0-or-later
// A path drawn along its length (rethink 7.1 rule 7, 7.4, 7.8): the lineage strip's lines, a check,
// an erase picture's strike, a delete picture's links. `pathLength="1"` and a dash of 1, so the dash
// offset runs 1 (nothing drawn) to 0 (drawn) whatever the length of the path; the Web Animations API
// moves it on the motion tokens. Retracting runs 0 to 1 on the exit curve. Under reduced motion the
// path is set to its end and crossfades over `--duration-fast` instead. Nothing is written into
// markup: the end state is set through the CSSOM (UI-1). Reduced motion comes from the system and
// the nearest `data-motion="reduced"` (`reducedMotionAt`), or from `reduced`.
import type { CurveToken, DurationToken } from "./motion-tokens";
import {
  animateElement,
  animationSettled,
  curveAt,
  durationAt,
} from "./motion-tokens";
import { reducedMotionAt } from "./reduced-motion";

export interface DrawPathOptions {
  /** `draw` (the default) draws it; `retract` takes it back, on the exit curve unless told. */
  direction?: "draw" | "retract";
  /** The duration token; `--duration-slow` to draw and `--duration-base` to retract by default. */
  duration?: DurationToken;
  /** The curve token; `--ease-standard` to draw and `--ease-exit` to retract by default. */
  curve?: CurveToken;
  /** A wait before it starts, in milliseconds (a stagger). */
  delay?: number;
  /** Force the reduced form, or the full one; by default from the element's scope (see `reducedMotionAt`). */
  reduced?: boolean;
}

/** The animation now running on each path, so a second call interrupts the first. */
const running = new WeakMap<Element, Animation>();

/**
 * Draws (or retracts) `element` and resolves when it has landed, or when a later call interrupted
 * it. The interrupted one jumps to its end first, so nothing is left part-way (7.1 rule 3).
 */
export function drawPath(
  element: SVGGeometryElement,
  options: DrawPathOptions = {},
): Promise<void> {
  const direction = options.direction ?? "draw";
  const reduced = options.reduced ?? reducedMotionAt(element);
  running.get(element)?.finish();
  running.delete(element);

  if (element.getAttribute("pathLength") !== "1") {
    element.setAttribute("pathLength", "1");
  }
  element.style.setProperty("stroke-dasharray", "1");
  const from = direction === "draw" ? 1 : 0;
  const to = direction === "draw" ? 0 : 1;
  // The end state is the resting style, so nothing depends on a fill that outlives the animation.
  element.style.setProperty("stroke-dashoffset", String(to));

  let animation: Animation | null;
  if (reduced) {
    // A crossfade: the line is (or is not) there, and fades to it.
    const fast = durationAt(element, "--duration-fast");
    if (fast <= 0) {
      return Promise.resolve();
    }
    animation =
      direction === "draw"
        ? animateElement(element, [{ opacity: 0 }, { opacity: 1 }], {
            duration: fast,
            delay: 0,
            easing: curveAt(element, "--ease-standard"),
          })
        : animateElement(
            element,
            [
              { opacity: 1, strokeDashoffset: 0 },
              { opacity: 0, strokeDashoffset: 0 },
            ],
            {
              duration: fast,
              easing: curveAt(element, "--ease-standard"),
            },
          );
  } else {
    const duration = durationAt(
      element,
      options.duration ??
        (direction === "draw" ? "--duration-slow" : "--duration-base"),
    );
    if (duration <= 0) {
      return Promise.resolve();
    }
    animation = animateElement(
      element,
      [{ strokeDashoffset: from }, { strokeDashoffset: to }],
      {
        duration,
        delay: options.delay ?? 0,
        // Before its delay the path stands at its start, not at its end.
        fill: "backwards",
        easing: curveAt(
          element,
          options.curve ??
            (direction === "draw" ? "--ease-standard" : "--ease-exit"),
        ),
      },
    );
  }
  if (!animation) {
    return Promise.resolve();
  }
  running.set(element, animation);
  const done = animationSettled(animation);
  void done.then(() => {
    if (running.get(element) === animation) {
      running.delete(element);
    }
  });
  return done;
}
