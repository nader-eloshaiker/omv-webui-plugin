// SPDX-License-Identifier: GPL-3.0-or-later
// Whether motion is reduced here (rethink 7.1 rule 5), from its three sources: the system's
// prefers-reduced-motion (live: a change while the page is open is followed), the "Animations"
// preference (useMotionStore), and a <MotionScope reduced> the caller sits inside (MotionScope.tsx).
// Written for the library (spec 8 row 7); it lives in the lab until the owner has seen the reel.
import { createContext, use, useSyncExternalStore } from "react";
import { useMotionStore } from "../../../stores/useMotionStore.ts";

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

/** The system setting, followed live. */
export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, systemReducedMotion, () => false);
}

/**
 * The duration and distance tokens inside a reduced scope (foundation 7.3). `--duration-fast` keeps
 * its value: a change of place or shape becomes a short crossfade, not a cut (7.1 rule 5).
 */
export const REDUCED_TOKENS: Readonly<Record<string, string>> = {
  "--duration-press": "0ms",
  "--duration-base": "0ms",
  "--duration-slow": "0ms",
  "--duration-glide": "0ms",
  "--motion-stagger": "0ms",
  "--motion-rise": "0px",
};

/** True inside a `<MotionScope reduced>`. */
export const MotionScopeContext = createContext(false);

/** True when the system, the preference or an enclosing `<MotionScope reduced>` asks for less. */
export function useReducedMotion(): boolean {
  const system = useSystemReducedMotion();
  const preference = useMotionStore((s) => s.motion === "reduced");
  const scoped = use(MotionScopeContext);
  return system || preference || scoped;
}

/**
 * For code that runs outside React (an animation started from an effect): whether motion is reduced
 * for `element`, from the system setting, the preference and the nearest `data-motion` scope.
 */
export function reducedMotionAt(element: Element | null): boolean {
  return (
    systemReducedMotion() ||
    useMotionStore.getState().motion === "reduced" ||
    element?.closest('[data-motion="reduced"]') != null
  );
}
