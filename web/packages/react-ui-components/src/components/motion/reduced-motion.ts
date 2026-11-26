// SPDX-License-Identifier: GPL-3.0-or-later
// Whether motion is reduced here (rethink 7.1 rule 5), from three sources: the system's
// prefers-reduced-motion, followed live; the person's "Animations: Reduced" preference, which the
// app passes to a `MotionProvider` (the library never reads a store); and a `MotionScope reduced`
// the caller sits inside. Code that runs outside React (an animation started from an effect) asks
// `reducedMotionAt(element)`, which reads the system and the nearest `data-motion="reduced"`: a
// `MotionScope` sets it on its wrapper, and the app sets it on <html> for the preference with
// `applyReducedMotion`.
import { createContext, use, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function mediaList(): MediaQueryList | null {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY)
    : null;
}

function subscribe(onChange: () => void): () => void {
  const list = mediaList();
  if (!list) {
    return () => undefined;
  }
  list.addEventListener("change", onChange);
  return () => {
    list.removeEventListener("change", onChange);
  };
}

/** The system setting now; false where there is no matchMedia (a test, a server render). */
export function systemReducedMotion(): boolean {
  return mediaList()?.matches ?? false;
}

/** The system setting, followed live: a change while the page is open is followed. */
export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, systemReducedMotion, () => false);
}

/**
 * The duration and distance tokens inside a reduced scope (foundation 7.3). `--duration-fast` keeps
 * its value: a change of place or shape becomes a short crossfade, not a cut (7.1 rule 5).
 */
export const REDUCED_MOTION_TOKENS: Readonly<Record<string, string>> = {
  "--duration-press": "0ms",
  "--duration-base": "0ms",
  "--duration-slow": "0ms",
  "--duration-glide": "0ms",
  "--motion-stagger": "0ms",
  "--motion-rise": "0px",
};

/** True inside a reduced `MotionProvider` or `MotionScope`. */
export const ReducedMotionContext = createContext(false);

/** True when the system, the preference or an enclosing reduced scope asks for less motion. */
export function useReducedMotion(): boolean {
  const system = useSystemReducedMotion();
  const scoped = use(ReducedMotionContext);
  return system || scoped;
}

/**
 * For code that runs outside React: whether motion is reduced for `element`, from the system setting
 * and the nearest `data-motion="reduced"` (a `MotionScope`, or <html> under the preference).
 */
export function reducedMotionAt(element: Element | null): boolean {
  return (
    systemReducedMotion() || element?.closest('[data-motion="reduced"]') != null
  );
}

/** Sets the reduced tokens on `element` through the CSSOM, or removes them. */
export function setReducedMotionTokens(
  element: HTMLElement,
  reduced: boolean,
): void {
  for (const [name, value] of Object.entries(REDUCED_MOTION_TOKENS)) {
    if (reduced) {
      element.style.setProperty(name, value);
    } else {
      element.style.removeProperty(name);
    }
  }
}

/**
 * Marks `element` reduced or not: `data-motion="reduced"` and the reduced tokens set through the
 * CSSOM (custom properties cascade, so every transition and keyframe inside that reads the tokens
 * lands at once), or both removed. Nothing is written into markup (UI-1). The app calls it on <html>
 * for the "Animations" preference; `MotionScope` does the same for its wrapper.
 */
export function applyReducedMotion(
  element: HTMLElement,
  reduced: boolean,
): void {
  setReducedMotionTokens(element, reduced);
  if (reduced) {
    element.dataset.motion = "reduced";
  } else if (element.dataset.motion === "reduced") {
    delete element.dataset.motion;
  }
}
