// SPDX-License-Identifier: GPL-3.0-or-later
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../utils";
import { Skeleton } from "../skeleton/skeleton";
import { StatusIcon } from "../status/status";
import { STATUS_DRAWING, type HealthStatus } from "../status/status-kinds";

/** The caddy's face. `disk` is the generic one, for when what the disk is is not known. */
type DriveKind = "hdd" | "ssd" | "nvme" | "usb" | "disk";
type Tone = "ok" | "warning" | "critical" | "unknown";
const toneOf = (status: HealthStatus): Tone =>
  STATUS_DRAWING[status].tone as Tone;

/**
 * How a slot shows its health: see `DriveBayProps.health`. A slot alone may also take `none`: no
 * mark and no word on screen, for a state the picture says once beside several slots; the word is
 * still read.
 */
type DriveHealthDisplay = "word" | "icon" | "problems" | "none";

interface DriveSlot {
  /** Stable across renders. */
  id: string;
  /** The device, in mono: "sdb". */
  device: string;
  /**
   * What it is, which changes the caddy's face: a hard disk, an SSD, an NVMe stick, a USB stick, or
   * `disk`, a plain face that claims neither, when the type is not known (never guess). The chassis
   * draws an NVMe stick with the SSD's face; the bare bay, too small for vents, draws each kind as
   * its own shape (a platter, flash chips, a stick).
   */
  kind: DriveKind;
  status: HealthStatus;
  /** The health in words: "OK", "Warning". */
  statusLabel: React.ReactNode;
  /** What it holds: "data", "Not used". Leave it out while that is not known, never "Empty". */
  role?: React.ReactNode;
  /** One secondary fact under the role: the temperature "34 °C", or "Asleep". */
  detail?: React.ReactNode;
  /**
   * Makes the slot a link to the disk's page: the element to render, `<a href=… />` or the router's
   * `<Link to=… />`. Its name is the slot's words ("sdb Warning data 41 °C") unless the element
   * carries an `aria-label` of its own. Any element works, a `<button>` included.
   */
  link?: useRender.RenderProp;
  /**
   * How this slot shows its health, in place of the bay's `health`: `icon` for a slot whose state
   * the picture around it says once for several disks.
   */
  health?: DriveHealthDisplay;
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
  /**
   * The slot jumped to ("View disk sdb"): a ring appears round it once, holds still for about a
   * second and fades out. Under reduced motion it is shown still and removed without the fade.
   */
  arrived?: string;
  /**
   * How each slot shows its health. `word`, the default: its icon and its word under the caddy.
   * `icon`: the icon alone, for a picture whose surroundings already say each disk's state in words;
   * the word stays for assistive technology and in a slot link's name. `problems`: a healthy slot
   * shows no mark at all (a healthy thing says nothing, style guide 10) and its `detail` in its
   * place; a slot in any other state shows its icon and its word. The word is always read.
   */
  health?: DriveHealthDisplay;
  /**
   * `chassis`, the default: the front panel, slots in a grid on the flat chassis. `bare`: the slots
   * alone, small and side by side on the page ground with nothing round them, for a picture that
   * holds several bays (the NAS map's rows). A bare bay has no entrance of its own: the picture that
   * holds it decides (its slots carry `data-slot="drive-slot"` for that).
   */
  variant?: "chassis" | "bare";
}

type BayVariant = NonNullable<DriveBayProps["variant"]>;

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

// The word beside the icon, or only for assistive technology when the picture shows the icon alone.
const healthWordClass = cva("", {
  variants: {
    health: { word: "", icon: "sr-only", problems: "", none: "sr-only" },
  },
  defaultVariants: { health: "word" },
});

const caddyClass = cva("h-auto w-full", {
  variants: {
    variant: {
      chassis: "mb-1 max-w-16 compact:max-w-11",
      bare: "mb-0.5 max-w-4.5 compact:max-w-3.5",
    },
  },
  defaultVariants: { variant: "chassis" },
});

// A change of state after mount (the disk check's result landing) turns the caddy's edge and the
// word, slot after slot: the transition waits two stagger steps per slot. The first render has
// nothing to transition from, so the entrance is the slot's own `slot-in`. Under reduced motion the
// durations and the stagger are 0ms, so the new state is simply there.
const turn =
  "transition-[opacity,fill,stroke,color] duration-base ease-standard [transition-delay:calc(min(var(--stagger-index,0),11)*var(--motion-stagger)*2)]";

/**
 * The bare bay's faces (the NAS map's rows), drawn about 18px wide: too small for the chassis's
 * vents, which there leave a hard disk looking like the plain `disk`. Each kind is its own shape, as
 * in the lab's map and the drive pictures: a hard disk's platter and hub, an SSD's flash chips and
 * controller, an NVMe stick with its contacts and mounting hole, and the plain drive's blank plate.
 * The lines keep their width at this size.
 */
function BareFace({ kind }: { kind: Exclude<DriveKind, "usb"> }) {
  const line = {
    vectorEffect: "non-scaling-stroke",
    strokeWidth: 1,
  } as const;
  const part = "fill-muted-strong stroke-art-line";
  const handle = (
    <rect
      x="10"
      y="92"
      width="36"
      height="16"
      rx="4"
      className={part}
      {...line}
    />
  );
  switch (kind) {
    case "hdd":
      return (
        <>
          <circle cx="28" cy="46" r="19" className={part} {...line} />
          <circle cx="28" cy="46" r="5" className={part} {...line} />
          {handle}
        </>
      );
    case "ssd":
      return (
        <>
          <rect
            x="10"
            y="22"
            width="16"
            height="26"
            rx="2"
            className={part}
            {...line}
          />
          <rect
            x="30"
            y="22"
            width="16"
            height="26"
            rx="2"
            className={part}
            {...line}
          />
          <rect
            x="16"
            y="56"
            width="24"
            height="18"
            rx="2"
            className={part}
            {...line}
          />
          {handle}
        </>
      );
    case "nvme":
      return (
        <>
          <rect
            x="17"
            y="12"
            width="22"
            height="96"
            rx="3"
            className={part}
            {...line}
          />
          <path d="M22 20h12M22 28h12" className="stroke-art-faint" {...line} />
          <circle
            cx="28"
            cy="96"
            r="4"
            className="fill-surface stroke-art-line"
            {...line}
          />
        </>
      );
    case "disk":
      return (
        <>
          {/* A blank label plate: a disk, without saying which kind. */}
          <rect
            x="12"
            y="24"
            width="32"
            height="52"
            rx="3"
            className="fill-surface stroke-art-line"
            {...line}
          />
          {handle}
        </>
      );
  }
}

/**
 * One caddy, front view: its face by kind and a handle. No light of any kind: a coloured dot on a
 * drawing reads as a "live dot" (style guide 10), and OMV gives no activity per disk. A caddy in a
 * non-OK state is edged in its stroke; the icon and the word under it say which state.
 */
function Caddy({
  kind,
  tone,
  variant,
}: {
  kind: DriveKind;
  tone: Tone;
  variant: BayVariant;
}) {
  const part = "fill-muted-strong stroke-art-line";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 56 120"
      data-kind={variant === "chassis" && kind === "nvme" ? "ssd" : kind}
      className={caddyClass({ variant })}
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
      {variant === "bare" && kind !== "usb" ? (
        <BareFace kind={kind} />
      ) : kind === "disk" ? (
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
          {kind === "ssd" || kind === "nvme" ? (
            <path d="M18 99h20" strokeWidth={2} className="stroke-art-faint" />
          ) : null}
        </>
      )}
    </svg>
  );
}

const chassisClass =
  "m-0 rounded-card bg-art-chassis-top px-3.5 pt-2.5 pb-3.5 shadow-control ring-1 ring-border ring-inset";
const slotGridClass =
  "grid grid-cols-[repeat(auto-fit,minmax(3.75rem,1fr))] gap-2 compact:grid-cols-[repeat(auto-fit,minmax(3.25rem,1fr))] compact:gap-1.5";

const bayClass = cva("", {
  variants: {
    variant: { chassis: chassisClass, bare: "m-0 min-w-0" },
  },
  defaultVariants: { variant: "chassis" },
});

const listClass = cva("", {
  variants: {
    variant: {
      chassis: slotGridClass,
      bare: "flex flex-wrap items-start gap-x-1.5 gap-y-0.5",
    },
  },
  defaultVariants: { variant: "chassis" },
});

const slotBodyClass = cva(
  "grid min-w-0 content-start justify-items-center text-center",
  {
    variants: {
      variant: {
        chassis: "gap-0.5 rounded-control px-1 pt-1.5 pb-2",
        bare: "min-w-12 gap-0 rounded-sm p-0.5",
      },
    },
    defaultVariants: { variant: "chassis" },
  },
);

const deviceClass = cva("font-mono font-semibold text-foreground", {
  variants: {
    variant: { chassis: "text-sm", bare: "text-xs" },
  },
  defaultVariants: { variant: "chassis" },
});

const smallClass = cva("", {
  variants: {
    variant: { chassis: "text-caption", bare: "text-xs leading-4" },
  },
  defaultVariants: { variant: "chassis" },
});

/** A slot's words under its caddy, and the link round both when it has one. */
function SlotBody({
  slot,
  health,
  variant,
}: {
  slot: DriveSlot;
  health: DriveHealthDisplay;
  variant: BayVariant;
}) {
  const tone = toneOf(slot.status);
  const shown = slot.health ?? health;
  // `problems`: a healthy slot keeps its word for assistive technology only, and shows no mark.
  const silent = shown === "none" || (shown === "problems" && tone === "ok");
  const content = (
    <>
      <Caddy kind={slot.kind} tone={tone} variant={variant} />
      <span className={deviceClass({ variant })}>{slot.device}</span>
      <span
        className={cn(
          "inline-flex flex-wrap items-center justify-center gap-1 font-medium",
          smallClass({ variant }),
          variant === "bare" && "whitespace-nowrap",
          wordClass({ tone }),
          silent && "sr-only",
          turn,
        )}
      >
        {silent ? null : <StatusIcon status={slot.status} className="size-3" />}
        <span
          data-slot="drive-slot-state"
          className={healthWordClass({ health: silent ? "none" : shown })}
        >
          {slot.statusLabel}
        </span>
      </span>
      {slot.role ? (
        <span
          className={cn(
            "text-tertiary-foreground [overflow-wrap:anywhere]",
            smallClass({ variant }),
          )}
        >
          {slot.role}
        </span>
      ) : null}
      {slot.detail ? (
        <span
          className={cn(
            "tabular-nums [overflow-wrap:anywhere]",
            variant === "bare"
              ? "text-muted-foreground"
              : "text-tertiary-foreground",
            smallClass({ variant }),
          )}
        >
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
      // The neutral hover on the slot, never on the state's marks, so they read the same under the pointer.
      className: cn(
        slotBodyClass({ variant }),
        "h-full transition-[background-color,translate] duration-fast ease-standard hover:bg-muted active:translate-y-px",
      ),
      children: content,
    },
    enabled: slot.link !== undefined,
  });
  return slot.link ? (
    link
  ) : (
    <div className={slotBodyClass({ variant })}>{content}</div>
  );
}

/**
 * The NAS front panel (foundation 9): one caddy per disk and, under it, the device, its health as an
 * icon and a word, what it holds and one secondary detail (the temperature, "Asleep"). The chassis
 * is a flat fill: no gradient and no lights (style guide 10). Answers "which disk is which,
 * and which one is the problem?". The words are HTML, so they reflow: six slots across become four at
 * 390px.
 *
 * A slot with `link` opens its disk's page. When a slot's state changes after mount (the disk check's
 * result lands), the edges and words change in turn, a slot at a time; under reduced motion they change at once.
 * With `health="icon"` a slot shows its health by its icon, and a non-OK caddy by its edge, alone.
 * `variant="bare"` draws the slots small with no chassis, for the NAS map.
 */
function DriveBay({
  slots,
  name,
  arrived,
  health = "word",
  variant = "chassis",
  className,
  ...props
}: DriveBayProps) {
  return (
    <figure
      data-slot="drive-bay"
      data-variant={variant}
      className={cn(bayClass({ variant }), className)}
      {...props}
    >
      {name ? (
        <div className="mb-2.5 font-mono text-xs font-medium text-tertiary-foreground">
          {name}
        </div>
      ) : null}
      <ol className={listClass({ variant })}>
        {slots.map((slot, i) => (
          <li
            key={slot.id}
            data-slot="drive-slot"
            data-status={slot.status}
            data-arrived={arrived === slot.id ? "" : undefined}
            style={{ "--stagger-index": i } as React.CSSProperties}
            className={cn(
              "grid min-w-0 rounded-control",
              // The slot jumped to is ringed once instead of entering in turn; a bare bay's slots
              // come in as the picture holding them says.
              arrived === slot.id
                ? "animate-arrive"
                : variant === "chassis" && "animate-slot-in stagger",
            )}
          >
            <SlotBody slot={slot} health={health} variant={variant} />
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
 * bars under each, still. Hidden from assistive technology: the region carries `aria-busy` and a
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
          <div key={i} className={cn(slotBodyClass(), "gap-1")}>
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
export type {
  DriveBayProps,
  DriveBaySkeletonProps,
  DriveHealthDisplay,
  DriveKind,
  DriveSlot,
};
