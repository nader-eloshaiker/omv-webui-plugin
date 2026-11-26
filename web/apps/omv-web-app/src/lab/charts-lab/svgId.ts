// SPDX-License-Identifier: GPL-3.0-or-later
// Ids for the SVG references the charts make (a clip path, the trace's gradient). Development only
// (UI-11).
import { useId } from "react";

/** An id for a clip path: React's, without the characters a `url(#…)` reference cannot take. */
export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9_-]/gu, "")}`;
}
