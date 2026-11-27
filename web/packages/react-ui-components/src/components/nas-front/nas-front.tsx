// SPDX-License-Identifier: GPL-3.0-or-later
// The drawing of the NAS's front (journal 2026-11-27): a chassis with one bay per disk, each disk in
// its caddy drawn as its kind; the NVMe stick in an M.2 slot on the mainboard under them, held by its
// socket and standoff screw as a disk is by its caddy; under the chassis each disk's words and, at the
// large size, a bracket per drive spanning the disks it is made of.
//
// Every drive is drawn as tall as the hard disk and as wide as its own device's proportion
// (`DrivePicture`), the stick upright. The board row keeps the bays' columns (a subgrid), so the M.2
// slot is exactly a bay wide and tall and its words sit in the columns beside it.
//
// The library knows no OMV read: the caller passes the bays, the sticks, the brackets
// (`nasFrontGroups` makes them from the caller's runs) and every word. The look is Tailwind on the
// theme tokens; the first visit's assembly and the wipe of a check's result are css-ui-style's
// `src/nas-front.css`, keyed on `data-slot` and `data-part`. Geometry from data (the column count, a
// part's place in the assembly, a bracket's span) is set through React's `style`, which writes the
// CSSOM and never markup (UI-1).
import { cva } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../utils";
import { DrivePicture } from "../drive-picture/drive-picture";
import type { DrivePictureShape } from "../drive-picture/drive-picture-model";
import { nasFrontColumns, type NasFrontGroup } from "./nas-front-model";

/** A disk in a bay. */
export interface NasFrontBay {
  id: string;
  /** Its kernel name, under its bay: "sda". */
  device: string;
  /** What it is drawn as; `disk` when its kind was not read (never guess). */
  kind: DrivePictureShape;
  /** Large size only: its kind and size, "Hard disk, 3.6 TiB". Left out in compact and narrow. */
  summary?: React.ReactNode;
  /** Large size only: its temperature or why there is none, "36 °C", "Asleep". */
  detail?: React.ReactNode;
}

/** An NVMe stick on the mainboard, in its M.2 slot. */
export interface NasFrontStick {
  id: string;
  /** Its kernel name beside it: "nvme0n1". */
  device: string;
  /**
   * Large size only, under its name: "On the mainboard, NVMe SSD, 238.5 GiB, System drive". A
   * `<strong>` inside (the storage it holds) is set in the foreground ink.
   */
  detail?: React.ReactNode;
}

type NasFrontSize = "large" | "small";

const PICTURE = { large: "large", small: "tile" } as const;

const rootVariants = cva(
  "group/nasfront m-0 flex min-w-0 flex-col [--nf-caddy-radius:calc(var(--radius-md)_-_4px)]",
  {
    variants: {
      size: {
        // The large drawing is its own container: under 32rem it tightens (the narrow drawing).
        large:
          "@container/nasfront gap-3 [--nf-hdd:62px] [--nf-slot-h:148px] compact:[--nf-hdd:46px] compact:[--nf-slot-h:112px]",
        small: "w-62 gap-1.5 [--nf-hdd:20px] [--nf-slot-h:72px]",
      },
    },
  },
);

const chassisVariants = cva(
  "relative border-[1.5px] border-art-line bg-art-chassis-top",
  {
    variants: {
      size: {
        large:
          "rounded-lg px-[22px] pt-10 pb-[18px] compact:px-[18px] compact:pt-8 compact:pb-3.5 @max-[32rem]/nasfront:px-3 @max-[32rem]/nasfront:pt-9 @max-[32rem]/nasfront:pb-3.5 @max-[32rem]/nasfront:[--nf-hdd:36px] @max-[32rem]/nasfront:[--nf-slot-h:112px]",
        small: "rounded-md px-2.5 pt-[26px] pb-2.5",
      },
    },
  },
);

const hostVariants = cva(
  "absolute font-mono font-semibold text-muted-foreground",
  {
    variants: {
      size: {
        large: "start-[22px] top-3 text-caption",
        small: "start-3 top-1.5 text-xs",
      },
    },
  },
);

/** The bays, the board, the words and the brackets share the chassis's columns. */
const columns = "grid grid-cols-[repeat(var(--n),minmax(0,1fr))]";

const baysVariants = cva(cn("m-0 list-none p-0", columns), {
  variants: {
    size: {
      large: "gap-3 @max-[32rem]/nasfront:gap-1.5",
      small: "gap-1.5",
    },
  },
});

// A bay is the opening in the chassis; the caddy in it carries the disk and a handle at its foot.
const slotVariants = cva(
  "relative grid h-(--nf-slot-h) w-full rounded-md border border-border bg-page",
  {
    variants: {
      size: {
        large: "overflow-hidden p-[5px] @max-[32rem]/nasfront:p-[3px]",
        small: "overflow-visible p-0.5",
      },
    },
  },
);

const caddyVariants = cva(
  "relative flex min-w-0 flex-col items-center justify-between rounded-(--nf-caddy-radius) border-[1.5px] bg-art-surface",
  {
    variants: {
      size: {
        large:
          "px-1.5 pt-3.5 pb-2.5 compact:pt-2.5 compact:pb-2 @max-[32rem]/nasfront:px-[3px] @max-[32rem]/nasfront:pt-2.5 @max-[32rem]/nasfront:pb-2",
        small: "px-0.5 pt-[7px] pb-[5px]",
      },
      // Whether the disk's health was read: the drawing's own line, or dashed in the Unknown stroke
      // before the check. `landing`: the result arrived on the page, and the solid line wipes over the
      // dashed one (its motion is in css-ui-style).
      outline: {
        solid: "border-art-line",
        unknown: "border-dashed border-unknown-stroke",
        landing:
          "border-dashed border-unknown-stroke after:absolute after:-inset-[1.5px] after:rounded-[inherit] after:border-[1.5px] after:border-art-line",
      },
    },
  },
);

const bayPictureVariants = cva("my-auto h-auto", {
  variants: {
    size: {
      large: "w-[min(var(--nf-hdd),80%)] compact:w-[min(var(--nf-hdd),70%)]",
      small: "w-[70%]",
    },
  },
});

const handleVariants = cva(
  "block w-[58%] rounded-full border-[1.5px] border-art-line",
  { variants: { size: { large: "h-1.5", small: "h-1" } } },
);

const boardVariants = cva(
  cn("overflow-hidden border-t border-dashed border-art-faint", columns),
  {
    variants: {
      size: {
        large: "mt-4 gap-3 pt-3.5 @max-[32rem]/nasfront:gap-1.5",
        small: "mt-2 gap-1.5 pt-1.5",
      },
    },
  },
);

// The stick's mount, drawn as the bays are: an opening a bay wide and tall, in it the stretch of
// mainboard the stick sits on drawn as a caddy is, the M.2 socket at its foot that takes the stick's
// contacts and the standoff screw at its head holding the notched end.
const m2Variants = cva(
  "grid h-(--nf-slot-h) overflow-hidden rounded-md border border-border bg-page",
  { variants: { size: { large: "p-[5px]", small: "p-0.5" } } },
);

const screwVariants = cva(
  "relative z-1 block flex-none rounded-full border-art-line bg-art-surface after:absolute after:top-1/2 after:-translate-y-1/2 after:bg-art-line",
  {
    variants: {
      size: {
        large:
          "-mb-1.5 size-[11px] border-[1.5px] after:inset-x-[1.5px] after:h-[1.5px]",
        small: "-mb-1 size-[7px] border after:inset-x-px after:h-px",
      },
    },
  },
);

const socketVariants = cva(
  "relative z-1 block flex-none rounded-[2px] border-art-line bg-art-surface",
  {
    variants: {
      size: {
        // As wide as the stick's picture and a little more, so its contacts sit inside it.
        large:
          "-mt-[5px] h-[9px] w-[calc(var(--nf-hdd)*20/52_+_8px)] border-[1.5px]",
        small: "-mt-[3px] h-1.5 w-[calc(var(--nf-hdd)*16/40_+_5px)] border",
      },
    },
  },
);

const stickPictureVariants = cva("my-auto h-auto", {
  variants: {
    size: {
      large: "w-[calc(var(--nf-hdd)*20/52)]",
      small: "w-[calc(var(--nf-hdd)*16/40)]",
    },
  },
});

const wordsVariants = cva(cn("m-0 list-none p-0", columns), {
  variants: {
    size: {
      // Inset by the chassis's padding and edge, so each column sits under its bay.
      large:
        "gap-x-3 px-[23.5px] compact:px-[19.5px] @max-[32rem]/nasfront:gap-x-1.5 @max-[32rem]/nasfront:px-[13.5px]",
      small: "gap-1.5 px-[11.5px]",
    },
  },
});

const deviceVariants = cva("font-mono text-foreground", {
  variants: {
    size: {
      large: "text-sm font-semibold",
      small: "text-xs font-medium",
    },
  },
});

const factClass = "text-caption leading-[1.3] text-muted-foreground";

function Bay({
  bay,
  index,
  size,
  outline,
}: {
  bay: NasFrontBay;
  index: number;
  size: NasFrontSize;
  outline: "solid" | "unknown" | "landing";
}) {
  return (
    <li
      data-part="bay"
      data-kind={bay.kind}
      className="flex min-w-0 flex-col items-center"
      style={{ "--i": index } as React.CSSProperties}
    >
      <span data-part="slot" className={slotVariants({ size })}>
        <span data-part="caddy" className={caddyVariants({ size, outline })}>
          <DrivePicture
            kind={bay.kind}
            size={PICTURE[size]}
            className={bayPictureVariants({ size })}
          />
          <span data-part="handle" className={handleVariants({ size })} />
        </span>
      </span>
    </li>
  );
}

function Stick({ stick, size }: { stick: NasFrontStick; size: NasFrontSize }) {
  return (
    <span
      data-part="stick"
      className="col-span-full grid min-w-0 grid-cols-subgrid items-center"
    >
      <span data-part="m2" aria-hidden="true" className={m2Variants({ size })}>
        <span className="flex min-w-0 flex-col items-center justify-center rounded-(--nf-caddy-radius) border-[1.5px] border-art-line bg-art-surface">
          <span data-part="screw" className={screwVariants({ size })} />
          <span
            data-part="stick-picture"
            className="flex min-w-0 flex-col items-center justify-between"
          >
            <DrivePicture
              kind="nvme"
              size={PICTURE[size]}
              orientation="upright"
              className={stickPictureVariants({ size })}
            />
          </span>
          <span data-part="socket" className={socketVariants({ size })} />
        </span>
      </span>
      {size === "large" ? (
        <span
          data-part="stick-words"
          className="col-[2/-1] flex min-w-0 flex-col gap-0.5"
        >
          <span data-part="device" className={deviceVariants({ size })}>
            {stick.device}
          </span>
          {stick.detail ? (
            <span
              data-part="fact"
              className={cn(
                factClass,
                "[&_strong]:font-semibold [&_strong]:text-foreground",
              )}
            >
              {stick.detail}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

function Group({ group, index }: { group: NasFrontGroup; index: number }) {
  return (
    <li
      data-part="group"
      data-dashed={group.dashed === true || undefined}
      className="flex min-w-0 flex-col items-center gap-0.5 text-center"
      style={
        {
          "--i": index,
          gridColumn: `${String(group.start)} / span ${String(group.span)}`,
        } as React.CSSProperties
      }
    >
      <span
        data-part="bracket"
        aria-hidden="true"
        className={cn(
          "mt-1 mb-1.5 block h-3 w-full origin-top rounded-b-[6px] border-[1.5px] border-t-0 border-art-line",
          group.dashed && "border-dashed",
        )}
      />
      <span
        data-part="group-name"
        className={cn(
          "text-body",
          group.dashed
            ? "font-normal text-muted-foreground"
            : "font-semibold text-foreground",
        )}
      >
        {group.name}
      </span>
      {group.tech ? (
        <span
          data-part="group-tech"
          className="text-caption text-muted-foreground"
        >
          {group.tech}
        </span>
      ) : null}
    </li>
  );
}

interface NasFrontProps extends Omit<
  React.ComponentProps<"figure">,
  "children" | "aria-label" | "role"
> {
  /** The NAS's host name, on the chassis: "nas". Decorative; say it in `label`. */
  host: string;
  /** The disks in the bays, in the order the caller reads them (no bay position is claimed). */
  bays: readonly NasFrontBay[];
  /** The NVMe sticks on the mainboard, each in its M.2 slot under the bays. */
  board?: readonly NasFrontStick[];
  /** Large size only: a bracket per drive under the chassis, from `nasFrontGroups`. */
  groups?: readonly NasFrontGroup[];
  /**
   * `large`: the welcome's drawing, with each disk's words and the brackets. `small`: beside a later
   * answer, the caddies and the device names only, read as one picture.
   */
  size?: NasFrontSize;
  /**
   * The drawing's accessible name. Large: "The disks in nas and the drives they make". Small, where
   * the drawing is one image, it says what the outlines show: "The disks in nas: not checked since
   * you signed in".
   */
  label: string;
  /** Assemble on this render (a first visit, or Show me around): the disks rise into their bays. */
  assemble?: boolean;
  /**
   * Whether the disks' health was read: false draws each caddy dashed in the Unknown stroke, true in
   * the drawing's own line. Left out, no health is drawn (the welcome's large drawing).
   */
  checked?: boolean;
  /** With `checked`: the result arrived while the page was open, so each outline joins up once. */
  landed?: boolean;
}

/**
 * The NAS's front: the chassis with its host name, a bay per disk drawn as its kind, the NVMe sticks
 * in their M.2 slots on the board, the disks' words under their bays and, large, the brackets naming
 * the storage each run of disks makes (dashed for unused). The large drawing is a figure whose words
 * are lists (the pictures are hidden); the small one is a single image named by `label`.
 */
function NasFront({
  host,
  bays,
  board = [],
  groups = [],
  size = "large",
  label,
  assemble = false,
  checked,
  landed = false,
  className,
  style,
  ...props
}: NasFrontProps) {
  const small = size === "small";
  const outline =
    checked === undefined
      ? "solid"
      : !checked
        ? "unknown"
        : landed
          ? "landing"
          : "solid";
  return (
    <figure
      data-slot="nas-front"
      data-size={size}
      data-assemble={assemble ? "full" : undefined}
      data-checked={checked === undefined ? undefined : String(checked)}
      data-landed={outline === "landing" || undefined}
      aria-label={label}
      role={small ? "img" : undefined}
      className={cn(rootVariants({ size }), className)}
      style={
        {
          "--n": nasFrontColumns(bays.length, board.length),
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      <div data-part="chassis" className={chassisVariants({ size })}>
        <span
          data-part="host"
          aria-hidden="true"
          className={hostVariants({ size })}
        >
          {host}
        </span>
        <ol
          data-part="bays"
          aria-hidden="true"
          className={baysVariants({ size })}
        >
          {bays.map((bay, i) => (
            <Bay
              key={bay.id}
              bay={bay}
              index={i}
              size={size}
              outline={outline}
            />
          ))}
        </ol>
        {board.length > 0 ? (
          <div
            data-part="board"
            aria-hidden={small || undefined}
            className={boardVariants({ size })}
          >
            {board.map((stick) => (
              <Stick key={stick.id} stick={stick} size={size} />
            ))}
          </div>
        ) : null}
      </div>
      <ol
        data-part="labels"
        aria-hidden={small || undefined}
        className={cn(wordsVariants({ size }), !small && "mt-0.5")}
      >
        {bays.map((bay) => (
          <li
            key={bay.id}
            data-part="label"
            className="flex min-w-0 flex-col items-center gap-0.5 text-center"
          >
            <span data-part="device" className={deviceVariants({ size })}>
              {bay.device}
            </span>
            {small ? null : (
              <>
                {bay.summary ? (
                  <span
                    data-part="fact"
                    data-fact="kind"
                    className={cn(
                      factClass,
                      "compact:hidden @max-[32rem]/nasfront:hidden",
                    )}
                  >
                    {bay.summary}
                  </span>
                ) : null}
                {bay.detail ? (
                  <span data-part="fact" className={factClass}>
                    {bay.detail}
                  </span>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ol>
      {!small && groups.length > 0 ? (
        <ol data-part="groups" className={wordsVariants({ size })}>
          {groups.map((group, i) => (
            <Group
              key={`${group.id}-${String(group.start)}`}
              group={group}
              index={i}
            />
          ))}
        </ol>
      ) : null}
    </figure>
  );
}

export { NasFront };
export type { NasFrontProps, NasFrontSize };
