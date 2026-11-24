// SPDX-License-Identifier: GPL-3.0-or-later
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../utils";
import { Skeleton } from "../skeleton/skeleton";
import { StatusIcon } from "../status/status";
import { STATUS_DRAWING, type HealthStatus } from "../status/status-kinds";

/** The caddy's face. `disk` is the generic one, for when what the disk is is not known. */
type DriveKind = "hdd" | "ssd" | "usb" | "disk";
type Tone = "ok" | "warning" | "critical" | "unknown";
const toneOf = (status: HealthStatus): Tone =>
  STATUS_DRAWING[status].tone as Tone;

interface DriveSlot {
  /** Stable across renders. */
  id: string;
  /** The device, in mono: "sdb". */
  device: string;
  /**
   * What it is, which changes the caddy's face: a hard disk with vents, an SSD, a USB stick, or
   * `disk`, a plain face that claims neither, when the type is not known (never guess).
   */
  kind: DriveKind;
  status: HealthStatus;
  /** The health in words: "OK", "Warning". */
  statusLabel: React.ReactNode;
  /** What it holds: "data", "Not used". Leave it out while that is not known, never "Empty". */
  role?: React.ReactNode;
  /** One quiet fact under the role: the temperature "34 °C", or "Asleep". */
  detail?: React.ReactNode;
  /**
   * Makes the slot a link to the disk's page: the element to render, `<a href=… />` or the router's
   * `<Link to=… />`. Its name is the slot's words ("sdb Warning data 41 °C") unless the element
   * carries an `aria-label` of its own.
   */
  link?: useRender.RenderProp;
}

interface DriveBayProps extends Omit<
  React.ComponentProps<"figure">,
  "children" | "aria-label"
> {
  /** What the picture shows: "The disks in this NAS". */
  "aria-label": string;
  slots: readonly DriveSlot[];
  /** The name on the chassis, in mono: the NAS's host name. */
  name?: React.ReactNode;
  /** The slot to ring twice after a jump to it ("View disk sdb"). */
  arrived?: string;
}

const bodyClass = cva("fill-surface stroke-art-line", {
  variants: {
    tone: {
      ok: "",
      warning: "stroke-warning-stroke stroke-2",
      critical: "stroke-critical-stroke stroke-2",
      unknown: "",
    },
  },
});

// The health light: the status fill ringed in its stroke; Unknown is a hollow dashed ring. It always
// travels with the icon and the word under the caddy.
const ledClass = cva("stroke-[1.5]", {
  variants: {
    tone: {
      ok: "fill-ok stroke-ok-stroke",
      warning: "fill-warning stroke-warning-stroke",
      critical: "fill-critical stroke-critical-stroke",
      unknown: "fill-none stroke-unknown-stroke",
      // The lit light while it is dark: what a light crossfades from on its first result.
      dim: "fill-muted-strong stroke-unknown-stroke",
    },
  },
});

const wordClass = cva("", {
  variants: {
    tone: {
      ok: "text-muted-foreground",
      warning: "text-warning-label",
      critical: "text-critical-label",
      unknown: "text-unknown-label",
    },
  },
});

// A change of state after mount (the disk check's result landing) crossfades the light, the edge and
// the word, slot after slot: the transition waits two stagger steps per slot. The first render has
// nothing to transition from, so the entrance is the slot's own `slot-in`. Under reduced motion the
// durations and the stagger are 0ms, so the new state is simply there.
const turn =
  "transition-[opacity,fill,stroke,color] duration-base ease-standard [transition-delay:calc(min(var(--stagger-index,0),11)*var(--motion-stagger)*2)]";

/** One caddy, front view: its face by kind, a handle and the health light. No activity light: OMV gives none per disk. */
function Caddy({ kind, tone }: { kind: DriveKind; tone: Tone }) {
  const part = "fill-muted-strong stroke-art-line";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 56 120"
      className="mb-1 h-auto w-full max-w-16 compact:max-w-11"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect
        x="2"
        y="2"
        width="52"
        height="116"
        rx="6"
        vectorEffect="non-scaling-stroke"
        className={cn(bodyClass({ tone }), turn)}
      />
      {kind === "disk" ? (
        <>
          {/* A blank label plate: a disk, without saying which kind. */}
          <rect x="12" y="30" width="32" height="48" rx="3" className={part} />
          <path d="M18 42h20" strokeWidth={2} className="stroke-art-faint" />
          <rect x="10" y="90" width="36" height="18" rx="4" className={part} />
        </>
      ) : kind === "usb" ? (
        <>
          <rect x="16" y="44" width="24" height="12" rx="2" className={part} />
          <path d="M28 56v22" strokeWidth={2} className="stroke-art-faint" />
          <rect x="14" y="78" width="28" height="18" rx="3" className={part} />
        </>
      ) : (
        <>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <path
              key={i}
              d={`M14 ${28 + i * 8}h28`}
              strokeWidth={2}
              className="stroke-art-faint"
            />
          ))}
          <rect x="10" y="90" width="36" height="18" rx="4" className={part} />
          {kind === "ssd" ? (
            <path d="M18 99h20" strokeWidth={2} className="stroke-art-faint" />
          ) : null}
        </>
      )}
      {/* The light: a hollow dashed ring while unknown, the lit state otherwise; the two crossfade. */}
      <circle
        cx="28"
        cy="14"
        r="4"
        strokeDasharray="2 2"
        data-light="unknown"
        className={cn(
          ledClass({ tone: "unknown" }),
          turn,
          tone === "unknown" ? "opacity-100" : "opacity-0",
        )}
      />
      <circle
        cx="28"
        cy="14"
        r="4"
        data-light={tone === "unknown" ? undefined : tone}
        className={cn(
          ledClass({ tone: tone === "unknown" ? "dim" : tone }),
          turn,
          tone === "unknown" ? "opacity-0" : "opacity-100",
        )}
      />
    </svg>
  );
}

const chassisClass =
  "m-0 rounded-card bg-linear-to-b from-art-chassis-top to-art-chassis-bottom px-3.5 pt-2.5 pb-3.5 shadow-control ring-1 ring-border ring-inset";
const slotGridClass =
  "grid grid-cols-[repeat(auto-fit,minmax(3.75rem,1fr))] gap-2 compact:grid-cols-[repeat(auto-fit,minmax(3.25rem,1fr))] compact:gap-1.5";
const slotBodyClass =
  "grid min-w-0 content-start justify-items-center gap-0.5 rounded-control px-1 pt-1.5 pb-2 text-center";

/** A slot's words under its caddy, and the link round both when it has one. */
function SlotBody({ slot }: { slot: DriveSlot }) {
  const tone = toneOf(slot.status);
  const content = (
    <>
      <Caddy kind={slot.kind} tone={tone} />
      <span className="font-mono text-sm font-semibold text-foreground">
        {slot.device}
      </span>
      <span
        className={cn(
          "inline-flex flex-wrap items-center justify-center gap-1 text-caption font-semibold",
          wordClass({ tone }),
          turn,
        )}
      >
        <StatusIcon status={slot.status} className="size-3" />
        {slot.statusLabel}
      </span>
      {slot.role ? (
        <span className="text-caption text-tertiary-foreground [overflow-wrap:anywhere]">
          {slot.role}
        </span>
      ) : null}
      {slot.detail ? (
        <span className="text-caption text-tertiary-foreground tabular-nums [overflow-wrap:anywhere]">
          {slot.detail}
        </span>
      ) : null}
    </>
  );
  const link = useRender({
    render: slot.link,
    defaultTagName: "a",
    props: {
      "data-slot": "drive-slot-link",
      // The neutral hover on the slot, never on the light, so the state reads the same under the pointer.
      className: cn(
        slotBodyClass,
        "h-full transition-[background-color,translate] duration-fast ease-standard hover:bg-muted active:translate-y-px",
      ),
      children: content,
    },
    enabled: slot.link !== undefined,
  });
  return slot.link ? link : <div className={slotBodyClass}>{content}</div>;
}

/**
 * The NAS front panel (foundation 9): one caddy per disk, each with its health light and, under it,
 * the device, its health as an icon and a word, what it holds and one quiet detail (the temperature,
 * "Asleep"). The chassis is lit from above, one step (material light). Answers "which disk is which,
 * and which one is the problem?". The words are HTML, so they reflow: six slots across become four at
 * 390px.
 *
 * A slot with `link` opens its disk's page. When a slot's state changes after mount (the disk check's
 * result lands), the lights change in turn, a slot at a time; under reduced motion they change at once.
 */
function DriveBay({
  slots,
  name,
  arrived,
  className,
  ...props
}: DriveBayProps) {
  return (
    <figure
      data-slot="drive-bay"
      className={cn(chassisClass, className)}
      {...props}
    >
      {name ? (
        <div className="mb-2.5 flex items-center gap-2 font-mono text-xs font-medium text-tertiary-foreground">
          <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
          {name}
        </div>
      ) : null}
      <ol className={slotGridClass}>
        {slots.map((slot, i) => (
          <li
            key={slot.id}
            data-status={slot.status}
            data-arrived={arrived === slot.id ? "" : undefined}
            style={{ "--stagger-index": i } as React.CSSProperties}
            className={cn(
              "grid min-w-0 rounded-control",
              // The slot jumped to rings twice instead of entering in turn.
              arrived === slot.id
                ? "animate-arrive motion-reduce:ring-2 motion-reduce:ring-focus-ring"
                : "animate-slot-in stagger",
            )}
          >
            <SlotBody slot={slot} />
          </li>
        ))}
      </ol>
    </figure>
  );
}

interface DriveBaySkeletonProps extends Omit<
  React.ComponentProps<"div">,
  "children"
> {
  /** How many caddies to stand in for. */
  slots?: number;
}

/**
 * A `DriveBay` while the disk list is read: the chassis with caddy-shaped placeholders and two text
 * bars under each, breathing. Hidden from assistive technology: the region carries `aria-busy` and a
 * polite "Loading the disks…" of its own.
 */
function DriveBaySkeleton({
  slots = 4,
  className,
  ...props
}: DriveBaySkeletonProps) {
  return (
    <div
      data-slot="drive-bay-skeleton"
      aria-hidden="true"
      className={cn(chassisClass, className)}
      {...props}
    >
      <Skeleton className="mb-2.5 w-16 text-xs" />
      <div className={slotGridClass}>
        {Array.from({ length: slots }, (_, i) => (
          <div key={i} className={cn(slotBodyClass, "gap-1")}>
            <Skeleton
              shape="block"
              className="mb-1 aspect-[56/120] w-full max-w-16 compact:max-w-11"
            />
            <Skeleton className="w-9 text-sm" />
            <Skeleton className="w-12 text-caption" />
          </div>
        ))}
      </div>
    </div>
  );
}

export { DriveBay, DriveBaySkeleton };
export type { DriveBayProps, DriveBaySkeletonProps, DriveKind, DriveSlot };
