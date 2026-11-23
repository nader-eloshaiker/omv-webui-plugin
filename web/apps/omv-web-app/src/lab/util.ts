// SPDX-License-Identifier: GPL-3.0-or-later
// Class and custom-property helpers for the design lab: development only (UI-11).
import type { CSSProperties } from "react";

export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/** Custom properties for the stylesheet, set through the CSSOM by React. */
export function vars(values: Record<string, string | number>): CSSProperties {
  return values as CSSProperties;
}
