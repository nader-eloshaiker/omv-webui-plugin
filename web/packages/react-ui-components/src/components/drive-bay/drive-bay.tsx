// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../utils";
import { StatusIcon } from "../status/status";
import { STATUS_DRAWING, type HealthStatus } from "../status/status-kinds";

type DriveKind = "hdd" | "ssd" | "usb";
type Tone = "ok" | "warning" | "critical" | "unknown";
const toneOf = (status: HealthStatus): Tone =>
  STATUS_DRAWING[status].tone as Tone;

interface DriveSlot {
  /** Stable across renders. */
  id: string;
  /** The device, in mono: "sdb". */
  device: string;
  /** What it is, which changes the caddy's face: a disk with vents, an SSD, a USB stick. */
  kind: DriveKind;
  status: HealthStatus;
  /** The health in words: "OK", "Warning". */
  statusLabel: React.ReactNode;
  /** What it holds: "data", "Not used". */
  role?: React.ReactNode;
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
        className={bodyClass({ tone })}
      />
      {kind === "usb" ? (
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
      <circle
        cx="28"
        cy="14"
        r="4"
        strokeDasharray={tone === "unknown" ? "2 2" : undefined}
        className={ledClass({ tone })}
      />
    </svg>
  );
}

/**
 * The NAS front panel (foundation 9): one caddy per disk, each with its health light and, under it,
 * the device, its health as an icon and a word, and what it holds. The chassis is lit from above,
 * one step (material light). Answers "which disk is which, and which one is the problem?". The words
 * are HTML, so they reflow: six slots across become four at 390px.
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
      className={cn(
        "m-0 rounded-card bg-linear-to-b from-art-chassis-top to-art-chassis-bottom px-3.5 pt-2.5 pb-3.5 shadow-control ring-1 ring-border ring-inset",
        className,
      )}
      {...props}
    >
      {name ? (
        <div className="mb-2.5 flex items-center gap-2 font-mono text-xs font-medium text-tertiary-foreground">
          <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
          {name}
        </div>
      ) : null}
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(3.75rem,1fr))] gap-2 compact:grid-cols-[repeat(auto-fit,minmax(3.25rem,1fr))] compact:gap-1.5">
        {slots.map((slot, i) => {
          const tone = toneOf(slot.status);
          return (
            <li
              key={slot.id}
              data-status={slot.status}
              data-arrived={arrived === slot.id ? "" : undefined}
              style={{ "--stagger-index": i } as React.CSSProperties}
              className={cn(
                "grid min-w-0 content-start justify-items-center gap-0.5 rounded-control px-1 pt-1.5 pb-2 text-center",
                // The slot jumped to rings twice instead of entering in turn.
                arrived === slot.id
                  ? "animate-arrive motion-reduce:ring-2 motion-reduce:ring-focus-ring"
                  : "animate-slot-in stagger",
              )}
            >
              <Caddy kind={slot.kind} tone={tone} />
              <span className="font-mono text-sm font-semibold text-foreground">
                {slot.device}
              </span>
              <span
                className={cn(
                  "inline-flex flex-wrap items-center justify-center gap-1 text-caption font-semibold",
                  wordClass({ tone }),
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
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

export { DriveBay };
export type { DriveBayProps, DriveKind, DriveSlot };
