// SPDX-License-Identifier: GPL-3.0-or-later
// The "Animations" preference (useMotionStore) bound to the library's motion helpers, which read no
// store themselves. A screen passes `useMotionPreference()` to the library's `MotionProvider`; code
// that may sit outside one, or runs outside React, asks the two functions below, which add the
// stored preference to the library's own sources (the system setting, a reduced scope).
import {
  reducedMotionAt as libraryReducedMotionAt,
  useReducedMotion as useLibraryReducedMotion,
} from "@omv-webui/react-ui-components";
import { useMotionStore } from "../stores/useMotionStore.ts";

/** The stored "Animations" preference is Reduced: the value for `<MotionProvider reduced>`. */
export function useMotionPreference(): boolean {
  return useMotionStore((s) => s.motion === "reduced");
}

/** True when the system, the stored preference or an enclosing reduced scope asks for less motion. */
export function useReducedMotion(): boolean {
  const preference = useMotionPreference();
  const library = useLibraryReducedMotion();
  return preference || library;
}

/**
 * For code that runs outside React: whether motion is reduced for `element`, from the system, the
 * stored preference and the nearest `data-motion="reduced"`.
 */
export function reducedMotionAt(element: Element | null): boolean {
  return (
    useMotionStore.getState().motion === "reduced" ||
    libraryReducedMotionAt(element)
  );
}
