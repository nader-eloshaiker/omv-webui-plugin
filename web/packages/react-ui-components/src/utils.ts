// SPDX-License-Identifier: GPL-3.0-or-later
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge knows Tailwind's own scales, not the names css-ui-style adds. Told about them, a later
// class of the same kind wins (`cn("rounded-control", "rounded-full")`, `cn("p-card", "p-4")`) instead
// of both being left for the stylesheet order to decide. Without the type steps it would also take
// `text-section` for a colour and drop it beside `text-foreground`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["control", "card"],
      text: ["display", "figure", "title", "section", "body", "caption"],
      spacing: [
        "card",
        "gutter",
        "cell-y",
        "cell-x",
        "row",
        "control",
        "control-sm",
        "control-lg",
      ],
      shadow: ["control", "raised", "floating"],
      ease: ["standard", "enter", "exit", "settle", "soft"],
      animate: ["rise", "settle-in", "fade-in", "breathe", "draw", "leave"],
    },
    classGroups: {
      duration: [{ duration: ["press", "fast", "base", "slow", "glide"] }],
    },
  },
});

/** Composes class names; a later class wins over an earlier one of the same kind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
