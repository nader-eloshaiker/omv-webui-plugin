// SPDX-License-Identifier: GPL-3.0-or-later
import { Meter } from "@base-ui/react/meter";
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils";
import type { CapacityThreshold } from "../capacity-meter/capacity-meter";
import { useGlide } from "../motion/motion";
import { StatusLabel } from "../status/status";
import {
  WAFFLE_SHAPES,
  WAFFLE_SIZES,
  waffleDrawing,
  waffleOf,
  type WaffleSizeName,
} from "./waffle-model";

interface WaffleProps extends Omit<
  React.ComponentProps<"div">,
  "children" | "aria-label"
> {
  /** The meter's accessible name: "Data drive: space used". */
  "aria-label": string;
  /** How much of the whole is used, in percent (FileSystemMgmt.getList `percentage`). Clamped to 0 to 100. */
  value: number;
  /**
   * The warning mark, in percent (FileSystemMgmt.getList `usagewarnthreshold`), drawn as a wider gap
   * with a rule in it. Leave it out (or pass null) when none is set; OMV's 0 means "never warn".
   */
  mark?: number | null;
  /**
   * The mark's value written above its rule, formatted by the caller: "85 %" in a row, "Warning at
   * 85 %" on a page. Not drawn in a cell, which has no room. Leave it out to draw the rule alone.
   */
  markLabel?: React.ReactNode;
  /**
   * Set when the mark is crossed: the status label beside the figures and, only then, the used squares
   * past the mark (every used square when no mark is set) in the status stroke (style guide 5.6). A
   * cell has no room for the label: the table row it sits in shows it, beside the row's name.
   */
  threshold?: CapacityThreshold;
  /** The meter's text alternative, the whole reading in words: "62 % used, 1.4 TiB free of 3.6 TiB." */
  valueText: string;
  /**
   * The figures, formatted by the caller, always shown (style guide 5.6). Beside the squares in a
   * cell and under them in a row: "62 %, 1.4 TiB free"; a `<strong>` inside is set in the body ink.
   * Beside the headline on a page: "1.4 TiB free of 3.6 TiB".
   */
  figures: React.ReactNode;
  /** The page size's headline above the squares: "62 % used". Ignored at the other sizes. */
  headline?: React.ReactNode;
  /** The page size's line under the squares: what a square stands for and where the mark is. */
  note?: React.ReactNode;
  /**
   * `row`: a row of a map or a list, 1 % squares 7px wide, the figures under them.
   * `cell`: a table cell in a 36 to 44px row, 2.5 % squares two high, the figures beside them.
   * `page`: the file system's own page, 1 % squares 18px wide under a headline.
   */
  size?: WaffleSizeName;
}

const rootClass = cva("flex min-w-0", {
  variants: {
    size: {
      row: "flex-col items-start gap-2",
      cell: "flex-row items-center gap-2.5",
      page: "flex-col items-start gap-2",
    },
  },
  defaultVariants: { size: "row" },
});

// Room above the squares for the mark's value, when it is written.
const gridClass = cva("relative block max-w-full flex-none", {
  variants: {
    size: { row: "", cell: "", page: "" },
    marked: { true: "", false: "" },
  },
  compoundVariants: [
    { size: "row", marked: true, className: "pt-4" },
    { size: "page", marked: true, className: "pt-6" },
  ],
});

const markClass = cva(
  "absolute top-0 -translate-x-1/2 whitespace-nowrap text-muted-foreground tabular-nums",
  {
    variants: {
      size: {
        row: "text-xs leading-4",
        cell: "text-xs leading-4",
        page: "text-caption leading-5",
      },
    },
  },
);

const figuresClass = cva(
  "text-muted-foreground tabular-nums [&_strong]:font-semibold [&_strong]:text-foreground",
  {
    variants: {
      size: {
        row: "text-xs leading-4",
        cell: "text-caption whitespace-nowrap",
        page: "text-body",
      },
    },
  },
);

// Filled, never outlined (style guide 5.6): the empty squares in the `usage-empty` slate, the used
// ones in the usage blue, and past the crossed mark in the status stroke. No stroke on any square.
const usedClass = cva("", {
  variants: {
    tone: {
      usage: "fill-usage",
      warning: "fill-warning-stroke",
      critical: "fill-critical-stroke",
    },
  },
  defaultVariants: { tone: "usage" },
});

/**
 * The status label. It fades in over the base duration only when a new reading brings it; when the
 * page opens with it, it is simply there (style guide 10, rule 19).
 */
function ThresholdWord({
  threshold,
  arrived,
}: {
  threshold: CapacityThreshold;
  arrived: boolean;
}) {
  return (
    <span
      data-slot="waffle-threshold"
      className={cn("inline-flex", arrived && "animate-fade-in")}
    >
      <StatusLabel status={threshold.status}>{threshold.label}</StatusLabel>
    </span>
  );
}

/**
 * Space used as a waffle (owner, 2026-11-26): squares that each stand for a fixed share of the whole,
 * filled a column at a time from the left, with the warning mark as a wider gap and a rule between
 * the squares before it and the squares past it, so the room left before the warning can be counted.
 * A `meter` with its value, range, name and text alternative, on Base UI's Meter; the figures are
 * always written beside it. Only with a status word do the used squares past the mark take the
 * status colour. A new reading glides the fill over the glide duration; under reduced motion it is
 * drawn at its value at once. Nothing moves on load.
 */
function Waffle({
  value,
  mark = null,
  markLabel,
  threshold,
  valueText,
  figures,
  headline,
  note,
  size = "row",
  className,
  "aria-label": ariaLabel,
  ...props
}: WaffleProps) {
  const used = Math.min(100, Math.max(0, value));
  const shown = useGlide(used) ?? used;
  const shape = WAFFLE_SHAPES[size];
  const box = WAFFLE_SIZES[size];
  const model = waffleOf(shown, mark, shape);
  const drawing = waffleDrawing(model, shape, box);
  const showMark =
    markLabel !== undefined && size !== "cell" && drawing.ruleX !== null;
  const tone = threshold?.status ?? "usage";
  const [initialStatus] = React.useState(threshold?.status);
  const statusWord = threshold ? (
    <ThresholdWord
      threshold={threshold}
      arrived={threshold.status !== initialStatus}
    />
  ) : null;
  const r = box.radius;

  const grid = (
    <Meter.Root
      value={used}
      min={0}
      max={100}
      getAriaValueText={() => valueText}
      aria-label={ariaLabel}
      // Base UI appends a hidden "x" span for a meter with no text of its own; this one renders its
      // own children so the accessibility tree carries only the name, the value and the words.
      render={(meterProps) => (
        <span
          {...meterProps}
          data-slot="waffle-grid"
          className={gridClass({ size, marked: showMark })}
          // The drawing at its own pixel size, scaled down only where the column is narrower.
          style={{ width: `${String(drawing.width)}px` }}
        >
          {showMark && drawing.ruleX !== null ? (
            <span
              aria-hidden="true"
              data-slot="waffle-mark"
              className={markClass({ size })}
              style={{
                left: `${String((drawing.ruleX / drawing.width) * 100)}%`,
              }}
            >
              {markLabel}
            </span>
          ) : null}
          <svg
            aria-hidden="true"
            focusable="false"
            className="block h-auto w-full"
            viewBox={`0 0 ${String(drawing.width)} ${String(drawing.height)}`}
          >
            {model.squares.map((s, i) => {
              const p = drawing.at[i] ?? { x: 0, y: 0 };
              const crossed =
                threshold !== undefined && (mark === null || s.past);
              return (
                <g
                  key={`${String(s.col)}:${String(s.row)}`}
                  data-past={s.past || undefined}
                  data-over={(crossed && s.fill > 0) || undefined}
                >
                  <rect
                    data-part="empty"
                    className="fill-usage-empty"
                    x={p.x}
                    y={p.y}
                    width={box.sq}
                    height={box.sq}
                    rx={r}
                  />
                  {s.fill > 0 ? (
                    <rect
                      data-part="used"
                      className={usedClass({ tone: crossed ? tone : "usage" })}
                      x={p.x}
                      y={p.y + box.sq * (1 - s.fill)}
                      width={box.sq}
                      height={box.sq * s.fill}
                      rx={Math.min(r, (box.sq * s.fill) / 2)}
                    />
                  ) : null}
                </g>
              );
            })}
            {drawing.rule === null ? null : (
              // The mark: a rule in the body ink down the gap. A mark on the scale, not an outline.
              <path
                data-part="mark"
                d={drawing.rule}
                className={cn(
                  "fill-none stroke-foreground [stroke-linejoin:round]",
                  size === "cell" ? "stroke-[1.25]" : "stroke-[1.5]",
                )}
              />
            )}
          </svg>
        </span>
      )}
    />
  );

  if (size === "page") {
    return (
      <div
        data-slot="waffle"
        data-size={size}
        className={cn(rootClass({ size }), className)}
        {...props}
      >
        <p className="m-0 mb-1 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          {headline === undefined ? null : (
            <span className="text-figure font-semibold text-foreground tabular-nums">
              {headline}
            </span>
          )}
          <span className={figuresClass({ size })}>{figures}</span>
          {statusWord}
        </p>
        {grid}
        {note === undefined ? null : (
          <p className="m-0 text-caption text-muted-foreground">{note}</p>
        )}
      </div>
    );
  }
  return (
    <div
      data-slot="waffle"
      data-size={size}
      className={cn(rootClass({ size }), className)}
      {...props}
    >
      {grid}
      <span className={figuresClass({ size })}>{figures}</span>
      {size === "row" ? statusWord : null}
    </div>
  );
}

export { Waffle };
export type { WaffleProps };
