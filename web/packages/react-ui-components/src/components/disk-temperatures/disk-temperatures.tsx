// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils";
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
} from "../disclosure/disclosure";
import { DrivePicture } from "../drive-picture/drive-picture";
import { StatusIcon, StatusLabel } from "../status/status";
import { Tooltip } from "../tooltip/tooltip";
import {
  DASHBOARD_ALL,
  dashboardSplit,
  diskOverLimit,
  restSummary,
  sharedLimit,
  temperatureScale,
  temperatureShare,
  type DiskGroup,
  type DiskTemperature,
  type RestSummary,
  type TemperatureScale,
  type VolumeState,
} from "./disk-temperatures-model";

/** The words of the temperatures, from the caller: the library carries none of its own. */
interface DiskTemperaturesLabels {
  /**
   * A group's heading: "Backup, Mirror (RAID 1)", "tank, ZFS pool (mirror)", "Hard disks", and for
   * the disks whose kind was not read (a kind group with `kind: null`) a heading that says so: "Disks
   * whose kind is not known".
   */
  groupTitle: (group: DiskGroup) => string;
  /** An array's or pool's state beside its heading, with the status icon: "Rebuilding". */
  groupState: (state: VolumeState) => React.ReactNode;
  /** A group's list, for assistive technology: `(title) => \`${title}, read at 10:31\``. */
  listName: (title: string) => string;
  /** A reading with its unit: "36 °C". */
  celsius: (c: number) => string;
  /** Under a disk that is asleep, so was not read: "Asleep". */
  asleep: React.ReactNode;
  /** Under a disk that reports no temperature: "Not read". */
  notRead: React.ReactNode;
  /** Read after the figure of a disk at or past its limit, hidden: ", at or over the alert limit". */
  overLimit: string;
  /**
   * The sentence under the groups naming every disk at or past its limit, with the warning status
   * icon: "sdt is at 46 °C, at or over the alert limit of 45 °C." The only place the warning colour
   * is explained, so it is always shown.
   */
  overNote: (over: readonly DiskTemperature[]) => string;
  /** The sentence for the disks asleep: "sdd is asleep, so its temperature was not read." */
  asleepNote: (devices: readonly string[]) => React.ReactNode;
  /**
   * A hint on pointing at a disk, in a Tooltip: "Hard disk, alert limit 45 °C"; for a disk whose kind
   * was not read (`kind: null`), without a kind. Never the only place a fact appears: every figure is
   * also in the tile and its list.
   */
  hint?: (disk: DiskTemperature) => React.ReactNode;
}

/** The dashboard's words for the disks it sums up. */
interface DiskTemperaturesRestLabels {
  /**
   * The rest in one sentence: "The other 16 disks are between 31 °C and 43 °C, under the alert limit
   * of 45 °C." A disk asleep or unread is not counted in the range.
   */
  summary: (summary: RestSummary) => React.ReactNode;
  /** The disclosure that opens them in place: "Show the other 16 disks", or "Show all 24 disks". */
  show: (summary: RestSummary) => React.ReactNode;
}

interface DiskTemperaturesBaseProps extends Omit<
  React.ComponentProps<"div">,
  "children"
> {
  /** From `diskGroups`: each array and pool, then the disks in neither by kind. */
  groups: readonly DiskGroup[];
  labels: DiskTemperaturesLabels;
  /** The groups' heading level under the region's own heading. The default is `h3`. */
  headingLevel?: "h2" | "h3" | "h4" | "h5";
}

type DiskTemperaturesProps = DiskTemperaturesBaseProps &
  (
    | {
        /** `all`: every disk, as the Disks page shows them. */
        mode?: "all";
        restLabels?: never;
        dashboardAll?: never;
        defaultRestOpen?: never;
      }
    | {
        /**
         * `dashboard`: every disk up to `dashboardAll` (8); past that, the groups with a disk at or over
         * its limit, the rest summed up in a sentence and opened in place on request. A disk over its
         * limit is never behind the disclosure.
         */
        mode: "dashboard";
        restLabels: DiskTemperaturesRestLabels;
        /** Up to this many disks the dashboard shows them all. The default is 8. */
        dashboardAll?: number;
        /** The summed-up disks start opened. The default is closed. */
        defaultRestOpen?: boolean;
      }
  );

const tileClass = cva("flex flex-none flex-col items-center gap-0.5", {
  variants: {
    kind: { hdd: "w-13", ssd: "w-13", nvme: "w-18", disk: "w-13" },
  },
});

// Upright: the picture and the level beside it on one baseline. Lying (a stick): the level under it.
// A disk of no known kind (`disk`, the plain drive) is upright, in the hard disk's footprint, so its
// level and the alert line sit where every upright tile has them.
const artClass = cva("relative mb-1.5 flex", {
  variants: {
    kind: {
      disk: "h-14 items-end justify-center gap-1 self-stretch",
      hdd: "h-14 items-end justify-center gap-1 self-stretch",
      ssd: "h-14 items-end justify-center gap-1 self-stretch",
      nvme: "w-14 flex-col items-stretch gap-1 self-center",
    },
  },
});

// Filled, never outlined (style guide 5.6): the rest in the `usage-empty` slate, the level in the
// usage blue, and at or past the limit in the warning stroke, with its words. A disk with no reading
// has no track at all, only its word: nothing to fill. The slot keeps its width, so the picture
// stays where every other tile has it.
const barClass = cva("relative flex-none overflow-hidden rounded-[2px]", {
  variants: {
    kind: {
      hdd: "h-full w-2",
      ssd: "h-full w-2",
      nvme: "h-2 w-full",
      disk: "h-full w-2",
    },
    read: { true: "bg-usage-empty", false: "bg-transparent" },
  },
});

const levelClass = cva(
  "absolute transition-[height,width] duration-glide ease-standard",
  {
    variants: {
      kind: {
        hdd: "inset-x-0 bottom-0",
        disk: "inset-x-0 bottom-0",
        ssd: "inset-x-0 bottom-0",
        nvme: "inset-y-0 start-0",
      },
      over: { true: "bg-warning-stroke", false: "bg-usage" },
    },
  },
);

// The alert limit: one dashed rule at its height through the tile and half the gap either side, so
// the tiles of a row join it into one line; across a stick, the same rule turned upright about its
// middle (the stick and its level, 28px, and 4px either side). A mark on the scale, not an outline,
// and never an edge down one side of anything.
const limitClass = cva(
  "pointer-events-none absolute border-t-[1.5px] border-dashed border-foreground",
  {
    variants: {
      kind: {
        hdd: "-inset-x-[5px]",
        disk: "-inset-x-[5px]",
        ssd: "-inset-x-[5px]",
        nvme: "top-1/2 w-9 -translate-x-1/2 -translate-y-1/2 rotate-90 rtl:translate-x-1/2",
      },
    },
  },
);

const valueClass = cva(
  "inline-flex items-center gap-0.5 text-xs leading-4 whitespace-nowrap tabular-nums [&_svg]:size-3",
  {
    variants: {
      state: {
        read: "text-tertiary-foreground",
        unread: "text-muted-foreground",
        over: "font-semibold text-warning-label",
      },
    },
  },
);

const noteClass = "m-0 text-caption text-muted-foreground";
const groupsClass =
  "flex flex-wrap items-start gap-x-10 gap-y-6 compact:gap-x-8 compact:gap-y-4";

/** One disk: its picture, and beside it (under it, for a stick) its level on the shared scale. */
function Tile({
  d,
  scale,
  limit,
  labels,
}: {
  d: DiskTemperature;
  scale: TemperatureScale;
  limit: number | null;
  labels: DiskTemperaturesLabels;
}) {
  const over = diskOverLimit(d);
  const k = d.c === null ? 0 : temperatureShare(d.c, scale);
  const limitAt = limit === null ? null : temperatureShare(limit, scale);
  // A disk whose kind was not read is drawn as the plain drive, claiming none.
  const shape = d.kind ?? "disk";
  const upright = shape !== "nvme";
  const state = d.c === null ? "unread" : over ? "over" : "read";
  const hint = labels.hint?.(d);
  const tile = (
    <li
      data-slot="disk-temperature"
      data-kind={d.kind ?? "unknown"}
      data-state={state}
      className={tileClass({ kind: shape })}
    >
      <span aria-hidden="true" className={artClass({ kind: shape })}>
        <DrivePicture kind={shape} size="tile" />
        <span
          data-part="track"
          className={barClass({ kind: shape, read: d.c !== null })}
        >
          {d.c === null ? null : (
            <span
              data-part="level"
              className={levelClass({ kind: shape, over })}
              style={
                upright
                  ? { height: `${String(k * 100)}%` }
                  : { width: `${String(k * 100)}%` }
              }
            />
          )}
        </span>
        {limitAt === null ? null : (
          <span
            data-part="limit"
            data-at={limitAt}
            className={limitClass({ kind: shape })}
            style={
              upright
                ? { top: `${String((1 - limitAt) * 100)}%` }
                : { insetInlineStart: `${String(limitAt * 100)}%` }
            }
          />
        )}
      </span>
      <span className="font-mono text-xs leading-4 font-semibold text-foreground">
        {d.device}
      </span>
      <span className="sr-only">: </span>
      <span className={valueClass({ state })}>
        {d.c === null ? (
          d.asleep ? (
            labels.asleep
          ) : (
            labels.notRead
          )
        ) : over ? (
          <>
            <StatusIcon status="warning" />
            {labels.celsius(d.c)}
            <span className="sr-only">{labels.overLimit}</span>
          </>
        ) : (
          labels.celsius(d.c)
        )}
      </span>
    </li>
  );
  return hint === undefined ? tile : <Tooltip content={hint}>{tile}</Tooltip>;
}

function Group({
  g,
  scale,
  limit,
  labels,
  headingLevel: Heading,
}: {
  g: DiskGroup;
  scale: TemperatureScale;
  limit: number | null;
  labels: DiskTemperaturesLabels;
  headingLevel: NonNullable<DiskTemperaturesBaseProps["headingLevel"]>;
}) {
  const id = React.useId();
  const title = labels.groupTitle(g);
  return (
    <section
      data-slot="disk-group"
      data-from={g.from}
      aria-labelledby={id}
      className="min-w-0 max-w-full flex-[0_1_auto]"
    >
      {/* Every head is at least one status label tall, so a group that says "Rebuilding" starts its
          tiles at the same height as its neighbours and the limit stays one line across a row. */}
      <div className="mb-2 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-0.5">
        <Heading
          id={id}
          className="m-0 text-caption leading-5 font-semibold text-foreground"
        >
          {title}
        </Heading>
        {g.state === null ? null : (
          <StatusLabel status={g.state.tone}>
            {labels.groupState(g.state)}
          </StatusLabel>
        )}
      </div>
      <ul
        aria-label={labels.listName(title)}
        className="m-0 flex list-none flex-wrap gap-x-2.5 gap-y-4 p-0 compact:gap-y-3"
      >
        {g.disks.map((d) => (
          <Tile
            key={d.device}
            d={d}
            scale={scale}
            limit={limit}
            labels={labels}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * The disks' temperatures by kind (owner, 2026-11-26): each RAID array and ZFS pool is a group of its
 * own, then the disks in neither by kind, those of no known kind last. Each disk is drawn as its kind
 * (a plain drive claiming none when its kind was not read) with its temperature as a
 * filled level beside it, on one scale shared by every group, so the alert limit is one dashed line at
 * the same height through every upright tile and a mark at the same temperature on each stick. A
 * sleeping disk shows its word and no bar. The warning colour appears only on a disk at or past its
 * limit, together with the sentence that says so. Within a group the disks are in device order: the
 * NAS does not report which slot of the case a disk is in.
 *
 * In `dashboard` mode, past eight disks only the groups with a disk over its limit are shown, the rest
 * summed up in a sentence and opened in place by a Disclosure; the scale is still the one every disk
 * shares. One reading, when the page read the disk list: no history, and nothing moves on load.
 */
function DiskTemperatures({
  groups,
  labels,
  mode = "all",
  restLabels,
  dashboardAll = DASHBOARD_ALL,
  defaultRestOpen = false,
  headingLevel = "h3",
  className,
  ...props
}: DiskTemperaturesProps) {
  const disks = groups.flatMap((g) => g.disks);
  const limit = sharedLimit(disks);
  const scale = temperatureScale(disks, limit);
  const split =
    mode === "dashboard" && restLabels !== undefined
      ? dashboardSplit(groups, dashboardAll)
      : { shown: [...groups], rest: [] };
  const restDisks = split.rest.flatMap((g) => g.disks);
  const rest = restSummary(restDisks, split.shown.length === 0, limit);
  const over = disks.filter(diskOverLimit);
  const asleep = disks.filter((d) => d.asleep).map((d) => d.device);
  const list = (gs: readonly DiskGroup[]) => (
    <div className={groupsClass}>
      {gs.map((g) => (
        <Group
          key={g.id}
          g={g}
          scale={scale}
          limit={limit}
          labels={labels}
          headingLevel={headingLevel}
        />
      ))}
    </div>
  );
  return (
    <div
      data-slot="disk-temperatures"
      data-mode={mode}
      className={cn("flex min-w-0 flex-col gap-4", className)}
      {...props}
    >
      {split.shown.length === 0 ? null : list(split.shown)}
      {over.length === 0 ? null : (
        <p className={noteClass}>
          <StatusLabel status="warning">{labels.overNote(over)}</StatusLabel>
        </p>
      )}
      {split.rest.length === 0 || restLabels === undefined ? null : (
        <div className="flex flex-col items-start gap-1">
          <p className={cn(noteClass, "tabular-nums")}>
            {restLabels.summary(rest)}
          </p>
          <Disclosure className="self-stretch" defaultOpen={defaultRestOpen}>
            <DisclosureTrigger variant="inline">
              {restLabels.show(rest)}
            </DisclosureTrigger>
            <DisclosurePanel>
              <div className="pt-3">{list(split.rest)}</div>
            </DisclosurePanel>
          </Disclosure>
        </div>
      )}
      {asleep.length === 0 ? null : (
        <p className={noteClass}>{labels.asleepNote(asleep)}</p>
      )}
    </div>
  );
}

export { DiskTemperatures };
export type {
  DiskTemperaturesLabels,
  DiskTemperaturesProps,
  DiskTemperaturesRestLabels,
};
