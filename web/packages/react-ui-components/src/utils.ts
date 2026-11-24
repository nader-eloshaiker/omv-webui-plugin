// SPDX-License-Identifier: GPL-3.0-or-later
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge knows Tailwind's own scales, not the ones css-ui-style adds. Told about the corner
// utilities, `cn("rounded-control", "rounded-full")` keeps the last, as it does for any other radius.
// Told about the named type steps (foundation 4), it reads `text-caption` as a size, not a colour, so
// `cn("text-caption", "text-warning-label")` keeps both instead of dropping the size.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["control", "card"],
      text: ["display", "figure", "title", "section", "body", "caption"],
    },
  },
});

/** Composes class names; a later class wins over an earlier one of the same kind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
