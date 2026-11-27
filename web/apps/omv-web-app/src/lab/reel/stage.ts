// SPDX-License-Identifier: GPL-3.0-or-later
// What the reel's stages share that is not a component: the page's `still=1`, and a figure that
// glides. The glide itself and the path that draws on a change are the library's `useGlide` and
// `useDrawPath`. Development only (UI-11).
import { useGlide } from "@omv-webui/react-ui-components";
import { createContext, use } from "react";
import { useReducedMotion } from "../../hooks/useMotionPreference.ts";

/** The page's `still=1`: timed returns (a check back to its copy glyph) wait for the next cause. */
export const StillContext = createContext(false);

export function useStill(): boolean {
  return use(StillContext);
}

/**
 * A figure gliding to its target over `--duration-glide`; at the target at once when reduced, by
 * the system, the stored "Animations" preference or an enclosing reduced scope.
 */
export function useGlideValue(target: number): number {
  const reduced = useReducedMotion();
  const glided = useGlide(target) ?? target;
  return reduced ? target : glided;
}
