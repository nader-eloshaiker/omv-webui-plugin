// SPDX-License-Identifier: GPL-3.0-or-later
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge knows Tailwind's own radius scale, not the corner utilities css-ui-style adds. Told
// about them, `cn("rounded-control", "rounded-full")` keeps the last, as it does for any other radius,
// instead of leaving both for the stylesheet order to decide.
const twMerge = extendTailwindMerge({
  extend: { theme: { radius: ["control", "card"] } },
});

/** Composes class names; a later class wins over an earlier one of the same kind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
