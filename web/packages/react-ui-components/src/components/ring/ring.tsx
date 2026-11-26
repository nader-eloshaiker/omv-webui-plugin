// SPDX-License-Identifier: GPL-3.0-or-later
import { Meter } from "@base-ui/react/meter";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils";
import { ratioOf, ringArcs } from "../chart-model/chart-model";
import { Skeleton } from "../skeleton/skeleton";
import { StatusIcon, StatusLabel } from "../status/status";
import { STATUS_DRAWING, type HealthStatus } from "../status/status-kinds";

/** The ring's box and stroke in pixels, per size. */
const GEOMETRY = {
  xs: { box: 40, stroke: 5 },
  sm: { box: 56, stroke: 6 },
  md: { box: 88, stroke: 8 },
  lg: { box: 128, stroke: 11 },
} as const;
type RingSize = keyof typeof GEOMETRY;

const ringBoxClass = cva(
  "relative grid shrink-0 place-items-center text-center",
  {
    variants: {
      // `xs` is a mark beside a heading (the first steps' progress); the others hold a figure.
      size: { xs: "size-10", sm: "size-14", md: "size-22", lg: "size-32" },
    },
    defaultVariants: { size: "md" },
  },
);

const figureClass = cva(
  "relative grid justify-items-center leading-tight font-semibold tabular-nums text-foreground",
  {
    variants: {
      size: {
        xs: "text-[0.6875rem]",
        sm: "text-xs",
        md: "text-base",
        lg: "text-xl",
      },
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
        // The first-steps progress (rethink A4): the accent at its label step, which clears 3:1 on the
        // empty part in both themes (the accent's stroke does not in dark).
        action: "stroke-action-label",
        // Past a threshold, the status stroke: the status fills fall under 3:1 on the empty part in
        // one theme each (warning in light, critical in dark).
        warning: "stroke-warning-stroke",
        critical: "stroke-critical-stroke",
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

/** A state in words, in its label colour. */
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

/** The usage arc: a circle with `pathLength="100"` that draws on entrance, then glides. */
function UsageArc({
  c,
  r,
  stroke,
  ratio,
  tone,
}: {
  c: number;
  r: number;
  stroke: number;
  ratio: number;
  tone: "usage" | "action" | "warning" | "critical";
}) {
  if (ratio <= 0) {
    return null;
  }
  return (
    <circle
      cx={c}
      cy={c}
      r={r}
      strokeWidth={stroke}
      strokeLinecap="round"
      pathLength={100}
      strokeDasharray="100"
      strokeDashoffset={100 - ratio * 100}
      transform={`rotate(-90 ${c} ${c})`}
      className={arcClass({ tone })}
    />
  );
}

/* ─── Capacity ring ───────────────────────────────────────────────────────────────────────────── */

interface CapacityRingThreshold {
  status: "warning" | "critical";
  /** The status words: "Almost full", "Critical". */
  label: React.ReactNode;
}

/** A ring that opens its page: the whole tile is the link's target. */
type CapacityRingLink =
  | { link?: undefined; linkLabel?: undefined }
  | {
      /**
       * Makes the ring a link tile: the element to render as the link, `<a href=… />` or the
       * router's `<Link to=… />`. It covers the tile, takes the neutral hover and the focus ring
       * round the tile. No chevron: the tile's name says where it goes (style guide 10).
       */
      link: useRender.RenderProp;
      /** The link's name, said after the meter: "Open file system Data". */
      linkLabel: string;
    };

type CapacityRingProps = Omit<React.ComponentProps<"div">, "children"> &
  VariantProps<typeof ringBoxClass> &
  CapacityRingLink & {
    /** What is measured: "data". Names the meter. */
    label: React.ReactNode;
    /**
     * How much is used, out of `max`; `null` when there is no reading, drawn as a hollow dashed
     * ring. With a `threshold` as well, the thing is known to be bad without a reading (a missing
     * file system): the dashed ring takes that state's stroke and icon, and the status label shows.
     */
    value: number | null;
    max: number;
    /** The numbers in words, also the meter's value text: "2.2 TiB of 3.6 TiB used". */
    valueText: string;
    /** The figure inside the ring, formatted by the caller: "62%". */
    figure: React.ReactNode;
    /** A crossed threshold, or a known bad state: the arc takes the status colour, and only with this status label. */
    threshold?: CapacityRingThreshold;
    /** Words beside the ring, under the label and the numbers: the type, where it lives. */
    children?: React.ReactNode;
  };

const dashedClass = cva("fill-none", {
  variants: {
    tone: {
      unknown: "stroke-unknown-stroke",
      warning: "stroke-warning-stroke",
      critical: "stroke-critical-stroke",
    },
  },
});

/** The link that covers a ring tile. */
function TileLink({
  render,
  label,
}: {
  render: useRender.RenderProp;
  label: string;
}) {
  const link = useRender({
    render,
    defaultTagName: "a",
    props: {
      "data-slot": "capacity-ring-link",
      "aria-label": label,
      className: "absolute inset-0 rounded-[inherit]",
    },
  });
  // No chevron: the tile's name says where it goes, and its hover says it acts (style guide 10).
  return link;
}

/**
 * How full something is, for a few capacities side by side (foundation 8, Sky): an arc of the usage
 * blue on a ring of the `usage-empty` slate, filled and never outlined (style guide 5.6), that draws
 * on entrance, the figure inside and the words beside. Past an administrator's threshold the arc
 * takes the warning or critical stroke together with its status label. A `meter` on Base UI.
 *
 * - No reading (`value={null}`): a thin dashed ring with the Unknown icon, and no `meter`.
 * - No reading but known bad (`value={null}` with `threshold`, a missing file system): the dashed
 *   ring in that state's stroke with its icon, and the status label.
 * - A link tile (`link` and `linkLabel`): the tile opens the thing's page; the meter is read first,
 *   then the link by its own name.
 */
function CapacityRing({
  label,
  value,
  max,
  valueText,
  figure,
  threshold,
  size,
  link,
  linkLabel,
  className,
  children,
  ...props
}: CapacityRingProps) {
  const g = GEOMETRY[size ?? "md"];
  const c = g.box / 2;
  const r = (g.box - g.stroke) / 2;
  const noReading = value === null;
  const dashedTone = threshold?.status ?? "unknown";
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
          strokeWidth={noReading ? 2 : g.stroke}
          className={
            noReading
              ? dashedClass({ tone: dashedTone })
              : "fill-none stroke-usage-empty"
          }
          strokeDasharray={noReading ? "3 4" : undefined}
        />
        {arc}
      </svg>
      <span className={figureClass({ size })}>
        {noReading ? (
          <StatusIcon
            status={dashedTone}
            className={threshold ? wordClass({ tone: dashedTone }) : undefined}
          />
        ) : (
          figure
        )}
      </span>
    </div>
  );
  const beside = (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {noReading ? (
          <p className="font-semibold text-foreground">{label}</p>
        ) : (
          <Meter.Label className="font-semibold text-foreground">
            {label}
          </Meter.Label>
        )}
        {threshold ? (
          <StatusLabel status={threshold.status}>{threshold.label}</StatusLabel>
        ) : null}
      </div>
      <p
        className={cn(
          "text-sm tabular-nums",
          noReading && !threshold
            ? "text-unknown-label"
            : "text-muted-foreground",
        )}
      >
        {valueText}
      </p>
      {children ? (
        <div className="text-caption text-tertiary-foreground">{children}</div>
      ) : null}
    </div>
  );
  const rootClass = cn(
    "flex items-center gap-4",
    link &&
      "group/tile relative -mx-2 rounded-control px-2 py-2 transition-[background-color,translate] duration-fast ease-standard hover:bg-muted has-[[data-slot=capacity-ring-link]:active]:translate-y-px",
    className,
  );
  const tail = link ? <TileLink render={link} label={linkLabel} /> : null;
  if (noReading) {
    // No reading: no `meter` claiming a value, and the ring is dashed, never empty-looking.
    return (
      <div
        data-slot="capacity-ring"
        data-state="unknown"
        data-status={threshold?.status}
        className={rootClass}
        {...props}
      >
        {ring(null)}
        {beside}
        {tail}
      </div>
    );
  }
  const arc = (
    <UsageArc
      c={c}
      r={r}
      stroke={g.stroke}
      ratio={ratioOf(value, max)}
      tone={threshold?.status ?? "usage"}
    />
  );
  return (
    <Meter.Root
      value={value}
      max={max}
      getAriaValueText={() => valueText}
      data-slot="capacity-ring"
      data-status={threshold?.status}
      className={rootClass}
      // As CapacityMeter: render these children, not Base UI's, which add a hidden "x" for NVDA that
      // a meter with its own visible words does not need.
      render={(meterProps) =>
        link ? (
          // A link tile: the meter and the link are siblings, so the link never takes the meter's role.
          <div
            data-slot="capacity-ring"
            data-status={threshold?.status}
            className={meterProps.className}
            {...props}
          >
            <div
              {...meterProps}
              className="flex min-w-0 items-center gap-4"
              data-slot="capacity-ring-meter"
            >
              {ring(arc)}
              {beside}
            </div>
            {tail}
          </div>
        ) : (
          <div {...meterProps} {...props}>
            {ring(arc)}
            {beside}
          </div>
        )
      }
    />
  );
}

/* ─── Progress ring ───────────────────────────────────────────────────────────────────────────── */

type ProgressRingProps = Omit<
  React.ComponentProps<"div">,
  "children" | "aria-label" | "aria-labelledby"
> &
  VariantProps<typeof ringBoxClass> &
  (
    | {
        /** The id of the heading the ring belongs to: the card's title "First steps". */
        "aria-labelledby": string;
        "aria-label"?: undefined;
      }
    | { "aria-label": string; "aria-labelledby"?: undefined }
  ) & {
    /** How many are done, out of `max`. */
    value: number;
    max: number;
    /** The count in words, the meter's value text: "1 of 2 done". */
    valueText: string;
    /** The figure inside, formatted by the caller: "1/2". */
    figure: React.ReactNode;
  };

/**
 * A ring and its figure only, named by a heading outside it (foundation 8): how many of a set of
 * steps are done, as the first steps' "1/2" beside the card title. The accent, Cobalt, on the
 * `usage-empty` ring (rethink A4: the first-steps progress is the next thing to do), never a status hue, since
 * configuration is not health. A `meter` on Base UI. `xs` beside a
 * heading, the other sizes as `CapacityRing`.
 */
function ProgressRing({
  value,
  max,
  valueText,
  figure,
  size,
  className,
  ...props
}: ProgressRingProps) {
  const g = GEOMETRY[size ?? "xs"];
  const c = g.box / 2;
  const r = (g.box - g.stroke) / 2;
  return (
    <Meter.Root
      value={value}
      max={max}
      getAriaValueText={() => valueText}
      render={(meterProps) => (
        <div
          {...meterProps}
          data-slot="progress-ring"
          className={cn(ringBoxClass({ size: size ?? "xs" }), className)}
          {...props}
        >
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
              className="fill-none stroke-usage-empty"
            />
            <UsageArc
              c={c}
              r={r}
              stroke={g.stroke}
              ratio={ratioOf(value, max)}
              tone="action"
            />
          </svg>
          <span
            aria-hidden="true"
            className={figureClass({ size: size ?? "xs" })}
          >
            {figure}
          </span>
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
            // Not an amount of a whole: the ground between the segments of a roll-up.
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

/* ─── Skeletons ───────────────────────────────────────────────────────────────────────────────── */

/** The ring's track alone, still, while the first read is in flight. */
function TrackSkeleton({ size }: { size: RingSize }) {
  const g = GEOMETRY[size];
  const c = g.box / 2;
  const r = (g.box - g.stroke) / 2;
  return (
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
          className="fill-none stroke-muted-strong"
        />
      </svg>
    </div>
  );
}

interface RingSkeletonProps
  extends
    Omit<React.ComponentProps<"div">, "children">,
    VariantProps<typeof ringBoxClass> {}

/**
 * A `CapacityRing` while its first read is in flight: the track only, still, and two text bars
 * where the label and the numbers go, at their real line heights. Hidden from assistive technology:
 * the region carries `aria-busy` and a polite "Loading …" of its own (style guide 5.2).
 */
function CapacityRingSkeleton({
  size,
  className,
  ...props
}: RingSkeletonProps) {
  return (
    <div
      data-slot="capacity-ring-skeleton"
      aria-hidden="true"
      className={cn("flex items-center gap-4", className)}
      {...props}
    >
      <TrackSkeleton size={size ?? "md"} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Skeleton className="w-24 font-semibold" />
        <Skeleton className="w-40 max-w-full text-sm" />
      </div>
    </div>
  );
}

interface HealthRingSkeletonProps extends RingSkeletonProps {
  /** How many legend rows to stand in for: the areas the ring will have. */
  areas?: number;
  /** As the `HealthRing` it stands in for. */
  legend?: "beside" | "hidden";
}

/**
 * A `HealthRing` while the first reads are in flight: the track only, still, and a bar per
 * legend row. Hidden from assistive technology, as every skeleton.
 */
function HealthRingSkeleton({
  size,
  areas = 4,
  legend = "beside",
  className,
  ...props
}: HealthRingSkeletonProps) {
  return (
    <div
      data-slot="health-ring-skeleton"
      aria-hidden="true"
      className={cn("flex flex-wrap items-center gap-x-5 gap-y-3", className)}
      {...props}
    >
      <TrackSkeleton size={size ?? "md"} />
      {legend === "beside" ? (
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          {Array.from({ length: areas }, (_, i) => (
            <Skeleton key={i} className="w-36" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export {
  CapacityRing,
  CapacityRingSkeleton,
  HealthRing,
  HealthRingSkeleton,
  ProgressRing,
};
export type {
  CapacityRingProps,
  CapacityRingThreshold,
  HealthArea,
  HealthRingProps,
  HealthRingSkeletonProps,
  ProgressRingProps,
  RingSize,
  RingSkeletonProps,
};
