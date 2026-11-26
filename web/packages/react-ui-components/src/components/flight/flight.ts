// SPDX-License-Identifier: GPL-3.0-or-later
// Motion that depends on geometry (foundation 7.2): the pending flight and the pop of what it lands
// on. Native only: the Web Animations API, with the duration and curve read from the motion tokens
// (motion/motion-tokens.ts), so a change to the tokens changes these too. The moving element is made
// with `createElement` and positioned through the CSSOM, never from markup or a string (UI-1, UI-2).
// Under reduced motion (the system's, or a `data-motion="reduced"` scope round the element) nothing
// moves: the flight does not run and the pop is skipped; what they announce is said in words by the
// pill and the band.
import { animateElement, curveAt, durationAt } from "../motion/motion-tokens";
import { reducedMotionAt, systemReducedMotion } from "../motion/reduced-motion";

/** The reader's system asks for less motion. JavaScript motion checks the same query as the stylesheet. */
export function prefersReducedMotion(): boolean {
  return systemReducedMotion();
}

const canAnimate = (element: Element): boolean =>
  typeof (element as HTMLElement).animate === "function";

/** The flights on their way to each element, so what they land on can wait for them. */
const inFlight = new WeakMap<Element, Promise<void>>();

/** Resolves when every flight now on its way to `target` has landed (at once if none is). */
export function whenLanded(target: Element | null): Promise<void> {
  return (target && inFlight.get(target)) ?? Promise.resolve();
}

/** The pending mark: the gold with its navy ink around it, the band's pair (11.53:1). */
const PENDING_MARK_CLASS =
  "pointer-events-none fixed top-0 left-0 z-[100] size-3 rounded-full bg-pending ring-2 ring-pending-foreground";

const MARK_SIZE = 12;

function centre(rect: DOMRect): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2 - MARK_SIZE / 2,
    y: rect.top + rect.height / 2 - MARK_SIZE / 2,
  };
}

/**
 * The pending flight (foundation 7.2): a small pending mark flies on an arc from the control that
 * saved (`from`) to the pending indicator (`to`), so the reader sees where their change went. It is
 * added to <body> while it flies and removed when it lands. Resolves true when it flew, false when it
 * did not: reduced motion, no Web Animations API, or either end not on screen.
 */
export function flyPendingMark(from: Element, to: Element): Promise<boolean> {
  if (reducedMotionAt(from) || !canAnimate(document.body)) {
    return Promise.resolve(false);
  }
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if ((a.width === 0 && a.height === 0) || (b.width === 0 && b.height === 0)) {
    return Promise.resolve(false);
  }
  const root = document.documentElement;
  const duration = durationAt(root, "--duration-glide");
  if (duration <= 0) {
    return Promise.resolve(false);
  }
  const start = centre(a);
  const end = centre(b);
  // A quadratic arc whose control point is lifted above the higher end, more for a longer flight.
  const lift = Math.min(160, Math.abs(end.y - start.y) * 0.35 + 40);
  const control = {
    x: (start.x + end.x) / 2,
    y: Math.min(start.y, end.y) - lift,
  };
  const steps = 10;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * start.x + 2 * u * t * control.x + t * t * end.x;
    const y = u * u * start.y + 2 * u * t * control.y + t * t * end.y;
    // It appears small, swells as it leaves, and shrinks into the indicator.
    const scale = t < 0.12 ? 0.4 + (t / 0.12) * 0.75 : 1.15 - (t - 0.12) * 0.5;
    frames.push({
      offset: t,
      transform: `translate(${x}px, ${y}px) scale(${scale.toFixed(3)})`,
      opacity: t === 0 ? 0 : 1,
    });
  }

  const mark = document.createElement("div");
  mark.className = PENDING_MARK_CLASS;
  mark.setAttribute("aria-hidden", "true");
  mark.dataset.slot = "pending-flight";
  document.body.append(mark);

  const animation = animateElement(mark, frames, {
    duration,
    easing: curveAt(root, "--ease-standard"),
    fill: "forwards",
  });
  if (!animation) {
    mark.remove();
    return Promise.resolve(false);
  }
  const landed = animation.finished.then(
    () => undefined,
    () => undefined,
  );
  const done = landed.then(() => {
    mark.remove();
  });
  const previous = inFlight.get(to);
  const all = previous
    ? Promise.all([previous, done]).then(() => undefined)
    : done;
  inFlight.set(to, all);
  void all.then(() => {
    if (inFlight.get(to) === all) {
      inFlight.delete(to);
    }
  });
  return done.then(() => true);
}

/**
 * One short pop on the settle spring (foundation 7.1): the element scales up from 0.82 and lands
 * with the spring's overshoot, so the eye goes to what just changed. Nothing under reduced motion.
 */
export function popElement(element: Element | null): void {
  if (!element || reducedMotionAt(element) || !canAnimate(element)) {
    return;
  }
  const duration = durationAt(element, "--duration-glide");
  if (duration <= 0) {
    return;
  }
  animateElement(
    element,
    [{ transform: "scale(0.82)" }, { transform: "scale(1)" }],
    {
      duration: Math.round(duration * 0.8),
      easing: curveAt(element, "--ease-settle"),
    },
  );
}
