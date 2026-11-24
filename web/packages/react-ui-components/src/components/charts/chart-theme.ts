// SPDX-License-Identifier: GPL-3.0-or-later
// How the charts are painted. Every mark is painted by class, never by a colour attribute: an SVG
// attribute does not resolve a custom property, and the tokens are custom properties. Series take
// `currentColor` from a `text-*` token class on their layer; Recharts' own greys (the grid, the
// cursor, the reference line) are overridden from the chart's frame; every text takes
// `currentColor` and a text token. Colours come from css-ui-style only (`series-1..4`, `trace`).
import { cva } from "class-variance-authority";
import { cn } from "../../utils";

/** The colour of a series: the brand trace for one live series, a categorical colour otherwise. */
export type SeriesTone =
  "trace" | "series-1" | "series-2" | "series-3" | "series-4";

/** Literal classes, so Tailwind finds them. */
export const TONE_TEXT: Record<SeriesTone, string> = {
  trace: "text-trace",
  "series-1": "text-series-1",
  "series-2": "text-series-2",
  "series-3": "text-series-3",
  "series-4": "text-series-4",
};

/** Solid, dashed, dotted, dash-dot: each series has its own, so none rests on colour alone (style guide 3.9). */
export const SERIES_DASH = [undefined, "6 4", "1 5", "10 4 1 4"] as const;

/** One series: the trace alone; with others, the categorical colours in order. */
export function toneFor(index: number, count: number): SeriesTone {
  if (count === 1) {
    return "trace";
  }
  return (
    (["series-1", "series-2", "series-3", "series-4"] as const)[index % 4] ??
    "series-1"
  );
}

/** A line the chart's alert or threshold is drawn at, with its words: "Alert at 55 °C". */
export interface ChartAlert {
  value: number;
  /** The words on a large chart. */
  label: string;
  /** Shorter words for a tile: "55 °C". Defaults to `label`. */
  short?: string;
}

/**
 * The frame every chart is drawn in. It paints what Recharts draws in its own greys, sets the ground
 * the dots are ringed in (`--chart-ground`) and shows the keyboard focus on the drawing.
 */
export const chartFrameClass = cva(
  [
    "relative min-w-0 tabular-nums [--chart-ground:var(--color-surface)]",
    "[&_.recharts-surface]:overflow-visible",
    "[&_.recharts-surface:focus]:outline-none [&_.recharts-surface:focus-visible]:rounded-sm",
    "[&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-offset-4 [&_.recharts-surface:focus-visible]:outline-focus-ring",
    "[&_.recharts-cartesian-grid_line]:stroke-border",
    // Axis words: 12px, the caption tier; mono in compact density (Instrument's readouts).
    "[&_.recharts-cartesian-axis-tick-value]:text-xs [&_.recharts-cartesian-axis-tick-value]:font-medium [&_.recharts-cartesian-axis-tick-value]:text-tertiary-foreground",
    "compact:[&_.recharts-cartesian-axis-tick-value]:font-mono",
    "[&_.recharts-reference-line-line]:stroke-border-control",
    "[&_.recharts-tooltip-wrapper]:pointer-events-none [&_.recharts-tooltip-wrapper]:z-10",
    "[&_.recharts-tooltip-cursor]:stroke-border-control",
    "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted-strong [&_.recharts-rectangle.recharts-tooltip-cursor]:stroke-none [&_.recharts-rectangle.recharts-tooltip-cursor]:opacity-60",
  ].join(" "),
  {
    variants: {
      ground: {
        surface: "",
        muted: "[--chart-ground:var(--color-muted)]",
      },
    },
    defaultVariants: { ground: "surface" },
  },
);

/** The classes of a dot ringed in the chart's ground (the newest sample, the pointed one). */
export function dotClass(tone: SeriesTone): string {
  return cn(
    TONE_TEXT[tone],
    "fill-current stroke-2 [stroke:var(--chart-ground)]",
  );
}

/** Recharts writes a text's fill itself: `currentColor` hands the colour to the token class. */
export const TICK = { fill: "currentColor" } as const;
