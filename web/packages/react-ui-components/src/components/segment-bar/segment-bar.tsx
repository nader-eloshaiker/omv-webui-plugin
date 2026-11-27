// SPDX-License-Identifier: GPL-3.0-or-later
import { Meter } from "@base-ui/react/meter";
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils";
import type { CapacityThreshold } from "../capacity-meter/capacity-meter";
import { useGlide } from "../motion/motion";
import { StatusLabel } from "../status/status";
import {
  SEGMENT_BAR_SIZES,
  segmentBarDrawing,
  segmentBarOf,
  type SegmentBarSizeName,
} from "./segment-bar-model";

interface SegmentBarProps extends Omit<
  React.ComponentProps<"div">,
  "children" | "aria-label"
> {
  /** The meter's accessible name: "Data drive: space used". */
  "aria-label": string;
  /** How much of the whole is used, in percent (FileSystemMgmt.getList `percentage`). Clamped to 0 to 100. */
  value: number;
  /**
   * The warning mark, in percent (FileSystemMgmt.getList `usagewarnthreshold`), drawn as a straight
   * rule at its exact value in a wider gap. Leave it out (or pass null) when none is set; OMV's 0
   * means "never warn".
   */
  mark?: number | null;
  /**
   * The mark's value written above its rule, formatted by the caller: "85 %" in a row, "Warning at
   * 85 %" on a page. Not drawn in a cell, which has no room. Leave it out to draw the rule alone.
   */
  markLabel?: React.ReactNode;
  /**
   * Set when the mark is crossed: the status label beside the figures and, only then, the used part
   * past the mark (the whole used part when no mark is set) in the status stroke (style guide 5.6). A
   * cell has no room for the label: the table row it sits in shows it, beside the row's name.
   */
  threshold?: CapacityThreshold;
  /** The meter's text alternative, the whole reading in words: "62 % used, 1.4 TiB free of 3.6 TiB." */
  valueText: string;
  /**
   * The figures, formatted by the caller, always shown (style guide 5.6). Beside the bar in a cell
   * and under it in a row: "62 %, 1.4 TiB free"; a `<strong>` inside is set in the body ink. Beside
   * the headline on a page: "1.4 TiB free of 3.6 TiB".
   */
  figures: React.ReactNode;
  /** The page size's headline above the bar: "62 % used". Ignored at the other sizes. */
  headline?: React.ReactNode;
  /** The page size's line under the bar: what a segment stands for and where the mark is. */
  note?: React.ReactNode;
  /**
   * Twenty segments of 5 % at every size, each size one fixed width.
   * `row`: a row of a map or a list, 198px wide, the figures under it.
   * `cell`: a table cell in a 36 to 44px row, 148.5px wide, the figures beside it.
   * `page`: the file system's own page, 636px wide under a headline.
   */
  size?: SegmentBarSizeName;
}

const rootClass = cva("flex min-w-0", {
  variants: {
    size: {
      row: "flex-col items-start gap-1.5",
      cell: "flex-row items-center gap-2.5",
      page: "flex-col items-start gap-2",
    },
  },
  defaultVariants: { size: "row" },
});

// Room above the bar for the mark's value, when it is written.
const barClass = cva("relative block max-w-full flex-none", {
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

// Filled, never outlined (style guide 5.6): the empty segments in the `usage-empty` slate, the used
// part in the usage blue, and past the crossed mark in the status stroke. No stroke on any segment.
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

const ruleClass = cva("fill-none stroke-foreground", {
  variants: {
    size: {
      row: "stroke-[1.5]",
      cell: "stroke-[1.25]",
      page: "stroke-2",
    },
  },
});

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * The used part of a piece: its corners rounded as the piece's at the left, and at the right only
 * when the piece is full, so a piece filled in part ends square inside its slate.
 */
function usedPath(
  x: number,
  y: number,
  filled: number,
  w: number,
  h: number,
  r: number,
): string {
  const left = Math.min(r, w / 2, filled);
  const right = filled >= w - 0.01 ? left : 0;
  const end = x + filled;
  return (
    `M${f2(x + left)} ${f2(y)}H${f2(end - right)}` +
    (right > 0
      ? `A${f2(right)} ${f2(right)} 0 0 1 ${f2(end)} ${f2(y + right)}`
      : "") +
    `V${f2(y + h - right)}` +
    (right > 0
      ? `A${f2(right)} ${f2(right)} 0 0 1 ${f2(end - right)} ${f2(y + h)}`
      : "") +
    `H${f2(x + left)}A${f2(left)} ${f2(left)} 0 0 1 ${f2(x)} ${f2(y + h - left)}` +
    `V${f2(y + left)}A${f2(left)} ${f2(left)} 0 0 1 ${f2(x + left)} ${f2(y)}Z`
  );
}

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
      data-slot="segment-bar-threshold"
      className={cn("inline-flex", arrived && "animate-fade-in")}
    >
      <StatusLabel status={threshold.status}>{threshold.label}</StatusLabel>
    </span>
  );
}

/**
 * Space used as one row of segments (owner, 2026-11-27): twenty segments of 5 % each, filled from
 * the left, the last used one in part, with the warning mark as a straight rule at its exact value in
 * a wider gap, so the room left before the warning can be counted. Each size has one fixed width, so
 * the same value and the same mark sit at the same place on every row of a list or table. A `meter`
 * with its value, range, name and text alternative, on Base UI's Meter; the figures are always
 * written beside it. Only with a status word does the used part past the mark take the status
 * colour. A new reading glides the fill over the glide duration; under reduced motion it is drawn at
 * its value at once. Nothing moves on load.
 */
function SegmentBar({
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
}: SegmentBarProps) {
  const used = Math.min(100, Math.max(0, value));
  const shown = useGlide(used) ?? used;
  const box = SEGMENT_BAR_SIZES[size];
  const model = segmentBarOf(shown, mark);
  const drawing = segmentBarDrawing(model, box);
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
  const y = box.ext;

  const bar = (
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
          data-slot="segment-bar-segments"
          className={barClass({ size, marked: showMark })}
          // The drawing at its own pixel size, scaled down only where the column is narrower.
          style={{ width: `${String(drawing.width)}px` }}
        >
          {showMark && drawing.ruleX !== null ? (
            <span
              aria-hidden="true"
              data-slot="segment-bar-mark"
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
            {model.pieces.map((p, i) => {
              const at = drawing.at[i] ?? { x: 0, w: 0, filled: 0 };
              if (at.w <= 0) {
                return null;
              }
              const crossed =
                threshold !== undefined && (mark === null || p.past);
              return (
                <g
                  key={`${String(p.segment)}:${String(p.from)}`}
                  data-segment={p.segment}
                  data-past={p.past || undefined}
                  data-over={(crossed && at.filled > 0) || undefined}
                >
                  <rect
                    data-part="empty"
                    className="fill-usage-empty"
                    x={at.x}
                    y={y}
                    width={at.w}
                    height={box.height}
                    rx={Math.min(r, at.w / 2)}
                  />
                  {at.filled > 0 ? (
                    <path
                      data-part="used"
                      className={usedClass({ tone: crossed ? tone : "usage" })}
                      d={usedPath(at.x, y, at.filled, at.w, box.height, r)}
                    />
                  ) : null}
                </g>
              );
            })}
            {drawing.rule === null ? null : (
              // The mark: a straight rule in the body ink down the wider gap. A mark on the scale,
              // not an outline.
              <path
                data-part="mark"
                d={drawing.rule}
                className={ruleClass({ size })}
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
        data-slot="segment-bar"
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
        {bar}
        {note === undefined ? null : (
          <p className="m-0 text-caption text-muted-foreground">{note}</p>
        )}
      </div>
    );
  }
  return (
    <div
      data-slot="segment-bar"
      data-size={size}
      className={cn(rootClass({ size }), className)}
      {...props}
    >
      {bar}
      <span className={figuresClass({ size })}>{figures}</span>
      {size === "row" ? statusWord : null}
    </div>
  );
}

export { SegmentBar };
export type { SegmentBarProps };
