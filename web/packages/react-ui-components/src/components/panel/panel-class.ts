// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";

/**
 * The grounds a page region sits on (the dashboard, owner 2026-11-27), each for one kind of thing:
 * - `raised`: things read and moving as one, an instrument or a list worked through as one ("Right
 *   now", the temperatures, what needs you, the first steps, This NAS): the surface with the raised
 *   elevation and a hairline edge.
 * - `plate`: a drawing on its own sunken sheet (the NAS map): the muted ground, no shadow, so its
 *   rows and lines read as drawn on one sheet, not as one more card.
 *
 * Both name their ground in `--ground`, for a mark that has to cut a rule under it (a chart's scale
 * value) to paint itself on the right colour.
 */
export const panelClass = cva(
  "min-w-0 rounded-card border border-border p-card text-foreground",
  {
    variants: {
      ground: {
        raised: "surface-raised [--ground:var(--theme-surface)]",
        plate: "bg-muted [--ground:var(--theme-muted)]",
      },
    },
    defaultVariants: { ground: "raised" },
  },
);
