// SPDX-License-Identifier: GPL-3.0-or-later
import { Meter } from "@base-ui/react/meter";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils";
import { ratioOf, ringArcs } from "../chart-model/chart-model";
import { StatusIcon, StatusPill } from "../status/status";
import { STATUS_DRAWING, type HealthStatus } from "../status/status-kinds";

/** The ring's box and stroke in pixels, per size. */
const GEOMETRY = {
  sm: { box: 56, stroke: 6 },
  md: { box: 88, stroke: 8 },
  lg: { box: 128, stroke: 11 },
} as const;
type RingSize = keyof typeof GEOMETRY;

const ringBoxClass = cva(
  "relative grid shrink-0 place-items-center text-center",
  {
    variants: {
      size: { sm: "size-14", md: "size-22", lg: "size-32" },
    },
    defaultVariants: { size: "md" },
  },
);

const figureClass = cva(
  "relative grid justify-items-center leading-tight font-semibold tabular-nums text-foreground",
  {
    variants: {
      size: { sm: "text-xs", md: "text-base", lg: "text-xl" },
    },
    defaultVariants: { size: "md" },
  },
);

const arcClass = cva(
  "fill-none transition-[stroke-dashoffset] duration-glide ease-standard animate-ring-in",
  {
    variants: {
      tone: {
        usage: "stroke-usage",
        warning: "stroke-warning",
        critical: "stroke-critical",
      },
    },
    defaultVariants: { tone: "usage" },
  },
);

/** A point on a circle, degrees clockwise from twelve o'clock. */
function pointAt(c: number, r: number, degrees: number) {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return { x: c + r * Math.cos(rad), y: c + r * Math.sin(rad) };
}

/** An arc as a path, so a dashed (Unknown) part can carry its own dash pattern. */
function arcPath(c: number, r: number, from: number, sweep: number): string {
  const a = pointAt(c, r, from);
  const b = pointAt(c, r, from + sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M${a.x.toFixed(3)} ${a.y.toFixed(3)}A${r} ${r} 0 ${large} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)}`;
}

/* ─── Capacity ring ───────────────────────────────────────────────────────────────────────────── */

interface CapacityRingThreshold {
  status: "warning" | "critical";
  /** The pill's words: "Almost full". */
  label: React.ReactNode;
}

interface CapacityRingProps
  extends
    Omit<React.ComponentProps<"div">, "children">,
    VariantProps<typeof ringBoxClass> {
  /** What is measured: "data". Names the meter. */
  label: React.ReactNode;
  /** How much is used, out of `max`; `null` when there is no reading, drawn as a hollow dashed ring. */
  value: number | null;
  max: number;
  /** The numbers in words, also the meter's value text: "2.2 TiB of 3.6 TiB used". */
  valueText: string;
  /** The figure inside the ring, formatted by the caller: "62%". */
  figure: React.ReactNode;
  /** A crossed threshold: the arc takes the status fill, and only with this pill. */
  threshold?: CapacityRingThreshold;
  /** Words beside the ring, under the label and the numbers: the type, where it lives. */
  children?: React.ReactNode;
}

/**
 * How full something is, for a few capacities side by side (foundation 8, Sky): an arc of the usage
 * blue that draws on entrance, the figure inside and the words beside. Past an administrator's
 * threshold the arc takes the warning or critical fill together with its pill. A `meter` on Base UI.
 */
function CapacityRing({
  label,
  value,
  max,
  valueText,
  figure,
  threshold,
  size,
  className,
  children,
  ...props
}: CapacityRingProps) {
  const g = GEOMETRY[size ?? "md"];
  const c = g.box / 2;
  const r = (g.box - g.stroke) / 2;
  const ring = (arc: React.ReactNode) => (
    <div className={ringBoxClass({ size })}>
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        viewBox={`0 0 ${g.box} ${g.box}`}
      >
        {/* No reading: a thin dashed ring, like the hollow Unknown dot, never an empty track. */}
        <circle
          cx={c}
          cy={c}
          r={r}
          strokeWidth={value === null ? 2 : g.stroke}
          className={cn(
            "fill-none",
            value === null ? "stroke-unknown-stroke" : "stroke-usage-track",
          )}
          strokeDasharray={value === null ? "3 4" : undefined}
        />
        {arc}
      </svg>
      <span className={figureClass({ size })}>
        {value === null ? <StatusIcon status="unknown" /> : figure}
      </span>
    </div>
  );
  const beside = (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {value === null ? (
          <p className="font-semibold text-foreground">{label}</p>
        ) : (
          <Meter.Label className="font-semibold text-foreground">
            {label}
          </Meter.Label>
        )}
        {threshold && value !== null ? (
          <StatusPill status={threshold.status}>{threshold.label}</StatusPill>
        ) : null}
      </div>
      <p
        className={cn(
          "text-sm tabular-nums",
          value === null ? "text-unknown-label" : "text-muted-foreground",
        )}
      >
        {valueText}
      </p>
      {children ? (
        <div className="text-caption text-tertiary-foreground">{children}</div>
      ) : null}
    </div>
  );
  const rootClass = cn("flex items-center gap-4", className);
  if (value === null) {
    // No reading: no `meter` claiming a value, and the ring is hollow and dashed, never empty-looking.
    return (
      <div
        data-slot="capacity-ring"
        data-state="unknown"
        className={rootClass}
        {...props}
      >
        {ring(null)}
        {beside}
      </div>
    );
  }
  const ratio = ratioOf(value, max);
  const arc =
    ratio > 0 ? (
      <circle
        cx={c}
        cy={c}
        r={r}
        strokeWidth={g.stroke}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="100"
        strokeDashoffset={100 - ratio * 100}
        transform={`rotate(-90 ${c} ${c})`}
        className={arcClass({ tone: threshold?.status ?? "usage" })}
      />
    ) : null;
  return (
    <Meter.Root
      value={value}
      max={max}
      getAriaValueText={() => valueText}
      data-slot="capacity-ring"
      className={rootClass}
      // As CapacityMeter: render these children, not Base UI's, which add a hidden "x" for NVDA that
      // a meter with its own visible words does not need.
      render={(meterProps) => (
        <div {...meterProps} {...props}>
          {ring(arc)}
          {beside}
        </div>
      )}
    />
  );
}

/* ─── Health ring ─────────────────────────────────────────────────────────────────────────────── */

interface HealthArea {
  /** Stable across renders. */
  id: string;
  /** The area: "Disks", "File systems", "Services". */
  label: React.ReactNode;
  status: HealthStatus;
  /** The state in words: "OK", "1 warning", "Not checked". */
  statusLabel: React.ReactNode;
}

const segmentClass = cva("fill-none", {
  variants: {
    tone: {
      ok: "stroke-ok",
      warning: "stroke-warning",
      critical: "stroke-critical",
      // Unknown is never a calm fill: the stroke grey, dashed, like the hollow dot.
      unknown: "stroke-unknown-stroke",
    },
  },
});

const wordClass = cva("font-medium", {
  variants: {
    tone: {
      ok: "text-ok-label",
      warning: "text-warning-label",
      critical: "text-critical-label",
      unknown: "text-unknown-label",
    },
  },
});

type HealthTone = "ok" | "warning" | "critical" | "unknown";
const toneOf = (status: HealthStatus): HealthTone =>
  STATUS_DRAWING[status].tone as HealthTone;

interface HealthRingProps
  extends
    Omit<React.ComponentProps<"div">, "children">,
    VariantProps<typeof ringBoxClass> {
  /** What the ring sums up, naming the group: "Health of this NAS". */
  label: string;
  /** One segment per area, in the order the words list them. */
  areas: readonly HealthArea[];
  /** The figure inside: "OK", "2 issues". */
  figure: React.ReactNode;
  /** `beside`: the areas with their states as words next to the ring. `hidden`: for screen readers only, when the page says them elsewhere. */
  legend?: "beside" | "hidden";
}

/**
 * A roll-up (foundation 8): one segment per area in its status fill, Unknown dashed, the figure
 * inside and the words beside. The segments draw in turn on entrance. Every state is also a word and
 * an icon, so nothing depends on colour.
 */
function HealthRing({
  label,
  areas,
  figure,
  size,
  legend = "beside",
  className,
  ...props
}: HealthRingProps) {
  const g = GEOMETRY[size ?? "md"];
  const c = g.box / 2;
  const r = (g.box - g.stroke) / 2;
  const arcs = ringArcs(areas.length);
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="health-ring"
      className={cn("flex flex-wrap items-center gap-x-5 gap-y-3", className)}
      {...props}
    >
      <div className={ringBoxClass({ size })}>
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full"
          viewBox={`0 0 ${g.box} ${g.box}`}
        >
          <circle
            cx={c}
            cy={c}
            r={r}
            strokeWidth={g.stroke}
            className="fill-none stroke-usage-track"
          />
          {areas.map((area, i) => {
            const arc = arcs[i];
            if (!arc) {
              return null;
            }
            const tone = toneOf(area.status);
            const dashed = tone === "unknown";
            // One area is the whole circle: two half arcs, since one arc cannot close on itself.
            const d =
              arc.length >= 100
                ? `${arcPath(c, r, 0, 180)}${arcPath(c, r, 180, 180).replace(/^M[\d. -]+/, "")}`
                : arcPath(c, r, arc.rotate, arc.length * 3.6);
            return (
              <path
                key={area.id}
                data-status={area.status}
                d={d}
                strokeWidth={g.stroke}
                pathLength={dashed ? undefined : 1}
                strokeDasharray={dashed ? "3 3" : undefined}
                style={{ "--stagger-index": i } as React.CSSProperties}
                className={cn(
                  segmentClass({ tone }),
                  // Solid parts draw along their length in turn; a dashed part fades in.
                  dashed ? "animate-fade-in" : "line-draw",
                )}
              />
            );
          })}
        </svg>
        <span className={figureClass({ size })}>{figure}</span>
      </div>
      <ul
        className={cn(
          "flex min-w-0 flex-col gap-1 text-sm",
          legend === "hidden" && "sr-only",
        )}
      >
        {areas.map((area) => {
          const tone = toneOf(area.status);
          return (
            <li key={area.id} className="flex items-center gap-2">
              <StatusIcon
                status={area.status}
                className={wordClass({ tone })}
              />
              <span className="text-foreground">{area.label}</span>
              <span className={wordClass({ tone })}>{area.statusLabel}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { CapacityRing, HealthRing };
export type {
  CapacityRingProps,
  CapacityRingThreshold,
  HealthArea,
  HealthRingProps,
  RingSize,
};
