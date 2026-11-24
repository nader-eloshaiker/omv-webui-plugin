// SPDX-License-Identifier: GPL-3.0-or-later
// Whether a media query matches now, following it as it changes. Reads only; where matchMedia is
// missing (an old test environment) it never matches.
import { useSyncExternalStore } from "react";

/** A viewport under 640px: a phone (the library's charts use the same line). */
export const PHONE_QUERY = "(max-width: 639.98px)";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => {
        list.removeEventListener("change", onChange);
      };
    },
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
    () => false,
  );
}
