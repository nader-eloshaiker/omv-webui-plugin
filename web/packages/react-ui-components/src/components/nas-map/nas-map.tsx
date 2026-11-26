// SPDX-License-Identifier: GPL-3.0-or-later
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import { House, RotateCw } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { DriveBay, type DriveSlot } from "../drive-bay/drive-bay";
import { Icon, type IconName } from "../icon/icon";
import { useFirstTime } from "../motion/use-first-time";
import { Skeleton } from "../skeleton/skeleton";
import { StatusIcon } from "../status/status";
import {
  ADD_STORAGE_KEY,
  allOk,
  diskKey,
  folderKey,
  folderState,
  interfaceKey,
  MORE_ROWS_KEY,
  moreFoldersKey,
  moveInRows,
  rowKeys,
  sharedDiskState,
  storageKey,
  stripCounts,
  stripKey,
  traceOf,
  traceState,
  wayKey,
  waysRunning,
  type NasFolder,
  type NasHealth,
  type NasInterface,
  type NasInterfaceKind,
  type NasLane,
  type NasMapItem,
  type NasMapView,
  type NasMoreRow,
  type NasRaidRow,
  type NasRowDisk,
  type NasRowTone,
  type NasStorage,
  type NasStorageKind,
  type NasStorageRow,
  type NasTrace,
  type NasUnusedRow,
  type NasWay,
  type NasWayId,
} from "./nas-map-model";
import type { NasMapWords } from "./nas-map-words";

const WAY_ICON: Record<NasWayId, IconName> = {
  smb: "service-smb",
  nfs: "service-nfs",
  rsync: "service-rsync",
  ssh: "service-ssh",
};

const STORAGE_ICON: Record<NasStorageKind, IconName> = {
  fs: "file-system",
  raid: "raid-array",
  zfs: "zfs-pool",
};

const INTERFACE_ICON: Record<NasInterfaceKind, IconName> = {
  ethernet: "net-ethernet",
  wifi: "net-wifi",
  bond: "net-bond",
  vlan: "net-vlan",
  bridge: "net-bridge",
};

// The map narrows by its own width, not the window's: under 37.5rem (600px) each row stacks with
// its connectors vertical (6.8 item 11), under 60rem (960px) the storage column is narrower.
// Tailwind sees these as literal class names, so each is written out where it is used.

const labelClass = cva("", {
  variants: {
    tone: {
      none: "",
      ok: "text-ok-label",
      warning: "font-semibold text-warning-label",
      critical: "font-semibold text-critical-label",
      unknown: "text-unknown-label",
    },
  },
  defaultVariants: { tone: "none" },
});

const toneOfHealth = (h: NasHealth) => (h === "ok" ? "none" : h);

// ─── Context: tracing and the one tab stop ────────────────────────────────────────────────────

interface MapContextValue {
  trace: NasTrace | null;
  current: string | null;
  onTrace: (key: string | null) => void;
  register: (key: string, el: HTMLElement | null) => void;
  onOpen: (item: NasMapItem) => void;
  items: NasMapView["items"];
  words: NasMapWords;
}

const MapContext = React.createContext<MapContextValue | null>(null);

function useMap(): MapContextValue {
  const ctx = React.use(MapContext);
  if (!ctx) {
    throw new Error("A part of the NAS map outside NasMap.");
  }
  return ctx;
}

/** What a thing on the map takes from the map. */
interface ItemProps {
  ref: (el: HTMLElement | null) => void;
  "data-key": string;
  "data-trace": "lit" | "dim" | undefined;
  tabIndex: number;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onClick: () => void;
}

/**
 * A thing on the map: lit when the trace names it, as it is on a lit row, dimmed otherwise. On the
 * rows it is part of one roving tab stop; in the band each is its own.
 */
function useItem(key: string, rowId: string | null, roving = true): ItemProps {
  const ctx = useMap();
  return {
    ref: (el) => {
      ctx.register(key, el);
    },
    "data-key": key,
    "data-trace": traceState(ctx.trace, key, rowId),
    tabIndex: roving ? (ctx.current === key ? 0 : -1) : 0,
    onPointerEnter: () => {
      ctx.onTrace(key);
    },
    onPointerLeave: () => {
      ctx.onTrace(null);
    },
    onFocus: () => {
      ctx.onTrace(key);
    },
    onBlur: () => {
      ctx.onTrace(null);
    },
    onClick: () => {
      const item = ctx.items.get(key);
      if (item) {
        ctx.onOpen(item);
      }
    },
  };
}

function rowTrace(trace: NasTrace | null, rowId: string) {
  if (!trace) {
    return undefined;
  }
  return trace.rows.has(rowId) ? "lit" : "dim";
}

// A plain button on the ground: no box, the focus ring of the system, underline on hover.
const plainButton =
  "cursor-pointer rounded-sm border-0 bg-transparent p-0 text-start text-inherit";

// ─── Connectors ───────────────────────────────────────────────────────────────────────────────

const wireClass = cva(
  "h-0 self-center border-t-2 transition-[border-color,opacity] duration-base ease-standard " +
    "group-data-[trace=dim]/row:opacity-40 " +
    "@max-[37.5rem]/nasmap:me-0 @max-[37.5rem]/nasmap:mt-0.5 @max-[37.5rem]/nasmap:mb-1 @max-[37.5rem]/nasmap:ms-6 @max-[37.5rem]/nasmap:h-3 @max-[37.5rem]/nasmap:w-0 @max-[37.5rem]/nasmap:flex-none @max-[37.5rem]/nasmap:self-start @max-[37.5rem]/nasmap:border-t-0 @max-[37.5rem]/nasmap:border-s-2",
  {
    variants: {
      tone: {
        none: "border-art-line group-data-[trace=lit]/row:border-selected-mark",
        warning: "border-warning-stroke",
        critical: "border-critical-stroke",
        ghost: "border-dashed border-art-faint",
      },
      place: {
        // Between the disks and the storage: it fills the disks column, so every row's storage
        // starts at the same x.
        disks: "mx-1.5 flex-[1_0_1.375rem]",
        // Between the storage and its folders: short.
        folders: "ms-1 me-3 flex-[0_0_1.375rem]",
      },
    },
    defaultVariants: { tone: "none", place: "disks" },
  },
);

interface NasMapWireProps extends Omit<
  React.ComponentProps<"span">,
  "children"
> {
  /** The row's problem, or `ghost` for a dashed line to where something will go. */
  tone?: "none" | NasRowTone | "ghost";
  place?: "disks" | "folders";
}

/**
 * A short straight connector between neighbours on one row of the NAS map (6.8): it never crosses
 * another, takes the row's tone when the row has a problem, and is dashed to a ghost. Vertical when
 * the map is narrow. Decorative.
 */
function NasMapWire({ tone, place, className, ...props }: NasMapWireProps) {
  return (
    <span
      aria-hidden="true"
      data-part="wire"
      data-place={place ?? "disks"}
      data-tone={tone ?? "none"}
      className={cn(wireClass({ tone, place }), className)}
      {...props}
    />
  );
}

// ─── The disks of a row ───────────────────────────────────────────────────────────────────────

/** A disk's slot as a button on the map: `DriveBay` renders it as the slot's link, with its words. */
function Slot({
  rowId,
  disk,
  healthShown,
  className,
  ...props
}: {
  rowId: string;
  disk: NasRowDisk;
  /** The slot shows its state's word (a disk in trouble that says its own problem). */
  healthShown: boolean;
} & React.ComponentProps<"button">) {
  const item = useItem(diskKey(rowId, disk.id), rowId);
  const { words } = useMap();
  return (
    <button
      {...props}
      {...item}
      type="button"
      aria-label={words.diskLabel({ ...disk, healthShown })}
      title={disk.alsoIn.length > 0 ? words.alsoIn(disk.alsoIn) : undefined}
      className={cn(
        className,
        "cursor-pointer border-0 bg-transparent text-inherit",
        "hover:[&_.font-mono]:underline hover:[&_.font-mono]:underline-offset-3",
        "data-[trace=lit]:bg-selected data-[trace=lit]:[&_.font-mono]:text-selected-label",
        "data-[trace=dim]:[&_*]:text-tertiary-foreground data-[trace=dim]:[&_svg]:opacity-45",
      )}
    />
  );
}

function Strip({
  rowId,
  disks,
  more,
}: {
  rowId: string;
  disks: readonly NasRowDisk[];
  more: boolean;
}) {
  const item = useItem(stripKey(rowId), rowId);
  const { words } = useMap();
  return (
    <button
      {...item}
      type="button"
      data-part="strip"
      className={cn(
        plainButton,
        "flex max-w-50 flex-col gap-1.5 p-1 text-foreground hover:[&>span:last-child]:underline",
        "data-[trace=dim]:text-tertiary-foreground",
      )}
    >
      <span aria-hidden="true" className="flex flex-wrap items-center gap-0.75">
        {disks.map((d) => (
          <span
            key={d.id}
            data-health={d.health}
            className={cn(
              // A tick is a tiny drawing of the disk in outline: healthy things carry no status colour.
              "rounded-[2px] border-[1.25px] border-art-line",
              d.kind === "ssd" || d.kind === "nvme" ? "h-2 w-3" : "h-3 w-2",
              d.health === "unknown" && "border-dashed border-unknown-stroke",
            )}
          />
        ))}
      </span>
      <span className="text-xs text-muted-foreground">
        {words.strip({ ...stripCounts(disks), more })}
      </span>
    </button>
  );
}

/**
 * A row's disks: the bare `DriveBay` at full size, then the strip beyond six. A state several of
 * them share is said once under them; only a disk whose state differs keeps its own word.
 */
function DiskCell({
  row,
  read,
}: {
  row: NasStorageRow | NasRaidRow | NasUnusedRow;
  read: "ok" | "loading" | "failed";
}) {
  const { words } = useMap();
  const note = row.kind === "storage" ? row.storage.disksNote : undefined;
  if (read === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-unknown-label">
        <StatusIcon status="unknown" />
        {words.disksUnread}
      </span>
    );
  }
  if (read === "loading") {
    return <Skeleton shape="block" className="h-12 w-10" />;
  }
  if (row.disks.length === 0) {
    // Where its disks are, in the app's sentence, in their place; kept narrow so a long sentence
    // does not widen the disks column of every row.
    return note ? (
      <span
        data-part="disks-note"
        className="max-w-44 text-xs text-balance text-muted-foreground @max-[37.5rem]/nasmap:mb-1.5 @max-[37.5rem]/nasmap:max-w-none"
      >
        {note}
      </span>
    ) : (
      <span className="text-xs text-tertiary-foreground">
        {words.disksNone}
      </span>
    );
  }
  const shared = sharedDiskState(row.bay.full);
  const slots: DriveSlot[] = row.bay.full.map((d) => ({
    id: d.id,
    device: d.device,
    kind: d.kind === "nvme" ? "ssd" : d.kind,
    status: d.health,
    statusLabel: d.healthLabel,
    // A disk whose state the row says once shows what a healthy one shows; one that says its own
    // problem shows that in place of its detail.
    detail: d.health === "ok" || shared?.ids.has(d.id) ? d.detail : undefined,
    health: shared?.ids.has(d.id) ? "none" : undefined,
    link: (
      <Slot
        rowId={row.id}
        disk={d}
        // As the bay's `problems` display draws it: a healthy disk's word, or one the row says once,
        // is for assistive technology only.
        healthShown={d.health !== "ok" && !shared?.ids.has(d.id)}
      />
    ),
  }));
  return (
    <span
      data-part="bay"
      className="flex max-w-60 flex-wrap items-center gap-x-1.5 gap-y-0.5 @max-[37.5rem]/nasmap:max-w-none"
    >
      <DriveBay
        variant="bare"
        health="problems"
        aria-label={words.lanes.disks.title}
        slots={slots}
      />
      {row.bay.strip.length > 0 ? (
        <Strip
          rowId={row.id}
          disks={row.bay.strip}
          more={row.bay.full.length > 0}
        />
      ) : null}
      {shared ? (
        <span
          className={cn(
            "inline-flex basis-full items-center gap-1 text-xs text-balance text-muted-foreground",
            labelClass({ tone: toneOfHealth(shared.health) }),
          )}
        >
          {shared.health === "warning" || shared.health === "critical" ? (
            <StatusIcon status={shared.health} className="size-3" />
          ) : null}
          {words.sharedDiskState(
            shared.label,
            row.bay.full
              .filter((d) => shared.ids.has(d.id))
              .map((d) => d.device),
          )}
        </span>
      ) : null}
    </span>
  );
}

// ─── The storage ──────────────────────────────────────────────────────────────────────────────

const storageClass = cva(
  "relative flex w-full min-w-0 flex-col gap-1.5 compact:gap-0.5 transition-colors duration-base",
  {
    variants: {
      variant: {
        real: "data-[trace=dim]:text-tertiary-foreground data-[trace=dim]:[&_svg]:opacity-45",
        // A picture of what will be: secondary ink, nothing to press.
        ghost: "text-tertiary-foreground",
      },
    },
    defaultVariants: { variant: "real" },
  },
);

interface NasMapStorageCellProps extends Omit<
  React.ComponentProps<"div">,
  "children"
> {
  kind: NasStorageKind;
  /** The plain name, as text: "Data drive". */
  name: string;
  /** The technical term, secondary: "EXT4", "Mirror (RAID 1)". Hidden in compact density. */
  tech?: React.ReactNode;
  /**
   * A state said beside the name: "At risk" when a disk on its row is in trouble. Its own state
   * ("Almost full") belongs to the meter.
   */
  state?: { tone: NasRowTone; label: React.ReactNode };
  /** The space used: the meter (or the waffle) the page draws, under the name. */
  meter?: React.ReactNode;
  /** The name as a button, or a link (`render`), that opens the storage. Without it, plain text. */
  action?: useRender.ComponentProps<"button">;
  /** `ghost`: the example row's picture, in secondary ink. */
  variant?: "real" | "ghost";
}

/**
 * One storage on a NAS map row: its icon, name and technical term, then the meter in its slot. No
 * box (style guide 10): the name is the control. The meter is the caller's, typed only as a node, so
 * any picture of space used fits.
 */
function NasMapStorageCell({
  kind,
  name,
  tech,
  state,
  meter,
  action,
  variant,
  className,
  ...props
}: NasMapStorageCellProps) {
  const main = (
    <>
      <Icon
        name={STORAGE_ICON[kind]}
        size={20}
        motion="none"
        className="text-muted-foreground"
      />
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <bdi
          data-part="storage-name"
          className="truncate text-body leading-5 font-semibold"
        >
          {name}
        </bdi>
        {tech ? (
          <span className="truncate text-xs text-tertiary-foreground compact:hidden">
            {tech}
          </span>
        ) : null}
      </span>
      {state ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs whitespace-nowrap",
            labelClass({ tone: state.tone }),
          )}
        >
          <StatusIcon status={state.tone} className="size-3" />
          {state.label}
        </span>
      ) : null}
    </>
  );
  const mainClass =
    "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2";
  const { ref: actionRef, render: actionRender, ...actionProps } = action ?? {};
  const button = useRender({
    render: actionRender,
    ref: actionRef,
    defaultTagName: "button",
    props: {
      type: actionRender ? undefined : "button",
      ...actionProps,
      className: cn(
        plainButton,
        mainClass,
        "hover:[&_[data-part=storage-name]]:underline hover:[&_[data-part=storage-name]]:underline-offset-3 focus-visible:outline-offset-4",
        action?.className,
      ),
      children: main,
    },
    enabled: action !== undefined,
  });
  return (
    <div
      data-slot="nas-map-storage"
      className={cn(storageClass({ variant }), className)}
      {...props}
    >
      {action ? button : <span className={mainClass}>{main}</span>}
      {meter ? (
        <div
          data-part="meter"
          className="min-w-0 ps-7 @max-[37.5rem]/nasmap:ps-0"
        >
          {meter}
        </div>
      ) : null}
    </div>
  );
}

function StorageCell({
  row,
  meter,
}: {
  row: NasStorageRow;
  meter: React.ReactNode;
}) {
  const { words } = useMap();
  const s = row.storage;
  const item = useItem(storageKey(s.id), row.id);
  const own = s.health === "warning" || s.health === "critical";
  const { ref, onPointerEnter, onPointerLeave, ...focus } = item;
  return (
    <NasMapStorageCell
      kind={s.kind}
      name={s.name}
      tech={s.tech}
      data-trace={item["data-trace"]}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      state={
        !own && row.tone ? { tone: row.tone, label: words.atRisk } : undefined
      }
      meter={meter}
      action={{ ...focus, ref }}
    />
  );
}

// ─── The shared folders ───────────────────────────────────────────────────────────────────────

const folderClass = cva(
  "inline-flex min-h-7.5 max-w-full min-w-0 items-center gap-1.75 rounded-sm px-0.5 text-sm text-foreground compact:min-h-6.5",
  {
    variants: {
      variant: {
        real:
          plainButton +
          " transition-colors duration-base hover:[&_[data-part=folder-name]]:underline hover:[&_[data-part=folder-name]]:underline-offset-3 " +
          "data-[trace=lit]:bg-selected data-[trace=lit]:[&_[data-part=folder-name]]:text-selected-label " +
          "data-[trace=dim]:text-tertiary-foreground data-[trace=dim]:[&_svg]:opacity-45",
        more:
          plainButton +
          " text-link hover:underline data-[trace=dim]:text-tertiary-foreground",
        ghost: "text-tertiary-foreground",
      },
    },
    defaultVariants: { variant: "real" },
  },
);

interface NasMapFolderChipProps extends Omit<
  useRender.ComponentProps<"button">,
  "children"
> {
  /** The folder's name, as text. */
  name: string;
  /** The ways in that reach it, drawn as their icons, each with its short name as a tooltip. */
  ways: readonly { id: NasWayId; label: string }[];
  /** Shown when no way in reaches it: "Ways in: none". */
  noWays?: React.ReactNode;
  /** Its own problem, beside it. */
  state?: { tone: NasRowTone; label: React.ReactNode };
  /** `ghost`: the example row's picture, not a control. */
  variant?: "real" | "ghost";
}

/**
 * A shared folder on a NAS map row: its icon and name, then the icons of the ways in that reach it,
 * and its own problem in words. A button by default (or the `render` element); a ghost is a `span`.
 */
function NasMapFolderChip({
  name,
  ways,
  noWays,
  state,
  variant = "real",
  render,
  className,
  ...props
}: NasMapFolderChipProps) {
  // The spaces are not drawn (the chip is a flex row); they keep the name and the words after it
  // apart in the chip's text, so its accessible name can contain what it shows (WCAG 2.5.3).
  const children = (
    <>
      <Icon
        name="shared-folder"
        size={16}
        motion="none"
        className="flex-none text-muted-foreground"
      />
      <bdi data-part="folder-name" className="truncate font-medium">
        {name}
      </bdi>{" "}
      {ways.length === 0 ? (
        noWays ? (
          <span className="text-xs whitespace-nowrap text-tertiary-foreground">
            {noWays}
          </span>
        ) : null
      ) : (
        <span className="inline-flex gap-0.75 text-tertiary-foreground">
          {ways.map((w) => (
            <span key={w.id} title={w.label} className="inline-flex">
              <Icon name={WAY_ICON[w.id]} size={16} motion="none" />
            </span>
          ))}
        </span>
      )}{" "}
      {state ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs whitespace-nowrap",
            labelClass({ tone: state.tone }),
          )}
        >
          <StatusIcon status={state.tone} className="size-3" />
          {state.label}
        </span>
      ) : null}
    </>
  );
  const element = useRender({
    render,
    defaultTagName: variant === "ghost" ? "span" : "button",
    props: {
      type: variant === "ghost" || render ? undefined : "button",
      "data-slot": "nas-map-folder",
      ...props,
      className: cn(folderClass({ variant }), className),
      children,
    },
  });
  return element;
}

function FolderChip({
  folder,
  row,
  index,
}: {
  folder: NasFolder;
  row: NasStorageRow;
  index: number;
}) {
  const { words } = useMap();
  const item = useItem(folderKey(folder.id), row.id);
  const state = folderState(folder, row.tone);
  const ways = folder.ways.map((w) => ({ id: w, label: words.wayShort[w] }));
  return (
    <NasMapFolderChip
      {...item}
      name={folder.name}
      ways={ways}
      noWays={words.noWayIn}
      // Only the folder's own problem is said on it: the row's icon and its connectors already say
      // the row is at risk.
      state={
        state?.own
          ? { tone: state.health, label: folder.healthLabel }
          : undefined
      }
      aria-label={words.folderLabel({
        name: folder.name,
        ways: ways.map((w) => w.label),
        state: state
          ? state.own
            ? folder.healthLabel
            : words.atRisk
          : undefined,
      })}
      style={{ "--i": index } as React.CSSProperties}
    />
  );
}

function MoreFolders({ row }: { row: NasStorageRow }) {
  const { words } = useMap();
  const item = useItem(moreFoldersKey(row.id), row.id);
  return (
    <button
      {...item}
      type="button"
      data-slot="nas-map-folder"
      className={folderClass({ variant: "more" })}
      style={{ "--i": row.folders.shown.length } as React.CSSProperties}
    >
      {words.moreFolders(row.folders.hidden.length, allOk(row.folders.hidden))}
    </button>
  );
}

const lineClass =
  "inline-flex items-center gap-1.5 text-sm text-muted-foreground [&_svg]:size-3.25";
// Without a connector, words in the folders column start where the folders and its title do.
const folderLineClass =
  "ps-10 @max-[37.5rem]/nasmap:ps-0 @max-[37.5rem]/nasmap:pt-1";

function FoldersCell({
  row,
  read,
}: {
  row: NasStorageRow;
  read: "ok" | "loading" | "failed";
}) {
  const { words } = useMap();
  if (read === "failed") {
    return (
      <span className={cn(lineClass, folderLineClass)}>
        <StatusIcon status="unknown" />
        {words.foldersUnread}
      </span>
    );
  }
  if (read === "loading") {
    return (
      <span className={folderLineClass}>
        <Skeleton className="w-40" />
      </span>
    );
  }
  if (row.folders.shown.length === 0) {
    return (
      <span className={cn(lineClass, folderLineClass)}>
        {row.storage.system ? words.systemNoFolders : words.foldersNone}
      </span>
    );
  }
  return (
    <>
      <NasMapWire place="folders" tone={row.tone ?? "none"} />
      <span
        data-part="folders"
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5.5 gap-y-1 self-center py-0.5 @max-[37.5rem]/nasmap:gap-x-4 @max-[37.5rem]/nasmap:self-stretch"
      >
        {row.folders.shown.map((f, i) => (
          <FolderChip key={f.id} folder={f} row={row} index={i} />
        ))}
        {row.folders.hidden.length > 0 ? <MoreFolders row={row} /> : null}
      </span>
    </>
  );
}

// ─── Rows ─────────────────────────────────────────────────────────────────────────────────────

const rowClass =
  "group/row relative col-span-full grid grid-cols-subgrid items-center min-h-18 py-2.5 border-t border-border " +
  "transition-colors duration-base ease-standard data-[trace=lit]:bg-selected compact:min-h-0 compact:py-1 " +
  "@max-[37.5rem]/nasmap:flex @max-[37.5rem]/nasmap:flex-col @max-[37.5rem]/nasmap:items-stretch @max-[37.5rem]/nasmap:py-3.5 @max-[37.5rem]/nasmap:ps-7";
const cellClass =
  "flex min-w-0 items-center @max-[37.5rem]/nasmap:flex-col @max-[37.5rem]/nasmap:items-start";
const foldersCellClass = "self-stretch @max-[37.5rem]/nasmap:items-stretch";

/** The row's status icon at its start: a problem row is found from across the room. */
function Edge({ tone }: { tone?: NasRowTone | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center self-center transition-opacity duration-base group-data-[trace=dim]/row:opacity-40 [&_svg]:size-4.5",
        "@max-[37.5rem]/nasmap:absolute @max-[37.5rem]/nasmap:start-0 @max-[37.5rem]/nasmap:top-5.5",
        tone === "warning" && "text-warning-label",
        tone === "critical" && "text-critical-label",
      )}
    >
      {tone ? <StatusIcon status={tone} /> : null}
    </span>
  );
}

interface RowCommon {
  index: number;
  /** Appeared after the map was first drawn: a ghost becoming real (7.2). */
  fresh: boolean;
}

function StorageRowView({
  row,
  index,
  fresh,
  arrival,
  meter,
  reads,
}: RowCommon & {
  row: NasStorageRow;
  arrival: boolean;
  meter: React.ReactNode;
  reads: NasMapView["reads"];
}) {
  const { trace, words } = useMap();
  const folders = [...row.folders.shown, ...row.folders.hidden];
  const label = words.rowLabel({
    name: row.storage.name,
    devices: row.disks.map((d) => d.device),
    used: row.storage.used,
    problem:
      row.storage.health === "warning" || row.storage.health === "critical"
        ? row.storage.healthLabel
        : undefined,
    sick: row.disks
      .filter((d) => d.health === "warning" || d.health === "critical")
      .map((d) => ({ device: d.device, label: d.healthLabel })),
    folders: folders.map((f) => f.name),
    atRisk: row.tone !== null,
    system: Boolean(row.storage.system),
    disksNote: row.disks.length === 0 ? row.storage.disksNote : undefined,
  });
  const disksRead = readOf(reads, "disks");
  // A storage with no disk attached has nothing to connect from: its disks column holds a sentence.
  const wire = disksRead !== "ok" || row.disks.length > 0;
  return (
    <li
      data-slot="nas-map-row"
      data-kind="storage"
      data-tone={row.tone ?? undefined}
      data-trace={rowTrace(trace, row.id)}
      data-fresh={fresh || undefined}
      data-arrival={arrival || undefined}
      aria-label={label}
      className={rowClass}
      style={{ "--r": index } as React.CSSProperties}
    >
      <Edge tone={row.tone} />
      <span className={cellClass}>
        <DiskCell row={row} read={disksRead} />
        {wire ? (
          <NasMapWire tone={row.diskTrouble ? (row.tone ?? "none") : "none"} />
        ) : null}
      </span>
      <span className={cellClass}>
        <StorageCell row={row} meter={meter} />
      </span>
      <span className={cn(cellClass, foldersCellClass)}>
        <FoldersCell row={row} read={readOf(reads, "folders")} />
      </span>
    </li>
  );
}

/**
 * The disks in a RAID array the dashboard does not read: their bay, a connector into the array, and
 * in the storage column the app's sentence saying where the array is shown. A member in trouble
 * starts the row with its icon and gives the connector its tone, as on a storage row.
 */
function RaidRowView({
  row,
  index,
  fresh,
  reads,
}: RowCommon & { row: NasRaidRow; reads: NasMapView["reads"] }) {
  const { trace, words } = useMap();
  const devices = row.disks.map((d) => d.device);
  return (
    <li
      data-slot="nas-map-row"
      data-kind="raid"
      data-tone={row.tone ?? undefined}
      data-trace={rowTrace(trace, row.id)}
      data-fresh={fresh || undefined}
      aria-label={words.raidMembersLabel({
        devices,
        sick: row.disks
          .filter((d) => d.health === "warning" || d.health === "critical")
          .map((d) => ({ device: d.device, label: d.healthLabel })),
      })}
      className={rowClass}
      style={{ "--r": index } as React.CSSProperties}
    >
      <Edge tone={row.tone} />
      <span className={cellClass}>
        <DiskCell row={row} read={readOf(reads, "disks")} />
        <NasMapWire tone={row.tone ?? "none"} />
      </span>
      <span className={cellClass}>
        <span
          data-part="raid-note"
          className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-sm text-muted-foreground transition-colors duration-base group-data-[trace=dim]/row:text-tertiary-foreground"
        >
          <Icon
            name="raid-array"
            size={20}
            motion="none"
            className="group-data-[trace=dim]/row:opacity-45"
          />
          <span className="text-balance">{words.raidMembers(devices)}</span>
        </span>
      </span>
      <span className={cn(cellClass, foldersCellClass)} />
    </li>
  );
}

function AddStorage({
  rowId,
  render,
}: {
  rowId: string;
  render: React.ReactElement;
}) {
  const item = useItem(ADD_STORAGE_KEY, rowId);
  // The app's own button opens the page; the map adds its tab stop and its tracing.
  return useRender({
    render,
    ref: item.ref,
    props: {
      "data-key": item["data-key"],
      "data-trace": item["data-trace"],
      tabIndex: item.tabIndex,
      onPointerEnter: item.onPointerEnter,
      onPointerLeave: item.onPointerLeave,
      onFocus: item.onFocus,
      onBlur: item.onBlur,
    },
  });
}

function UnusedRowView({
  row,
  index,
  fresh,
  addStorage,
  captions,
  reads,
}: RowCommon & {
  row: NasUnusedRow;
  addStorage?: React.ReactElement | null;
  captions: boolean;
  reads: NasMapView["reads"];
}) {
  const { trace, words } = useMap();
  const devices = row.disks.map((d) => d.device);
  return (
    <li
      data-slot="nas-map-row"
      data-kind="unused"
      data-trace={rowTrace(trace, row.id)}
      data-fresh={fresh || undefined}
      aria-label={words.unusedLabel(devices)}
      className={rowClass}
      style={{ "--r": index } as React.CSSProperties}
    >
      <Edge />
      <span className={cellClass}>
        <DiskCell row={row} read={readOf(reads, "disks")} />
        <NasMapWire tone="ghost" />
      </span>
      <span className={cellClass}>
        <span
          data-slot="nas-map-ghost"
          className="flex w-full flex-col items-start gap-2"
        >
          <span className="text-sm text-muted-foreground">
            {words.unused(devices)}
          </span>
          {addStorage ? (
            <AddStorage rowId={row.id} render={addStorage} />
          ) : null}
        </span>
      </span>
      <span className={cn(cellClass, foldersCellClass)}>
        {captions ? (
          <span className={cn(lineClass, folderLineClass, "compact:hidden")}>
            {words.unusedFolders}
          </span>
        ) : null}
      </span>
    </li>
  );
}

function MoreRowView({ row, index }: RowCommon & { row: NasMoreRow }) {
  const { trace, words } = useMap();
  const item = useItem(MORE_ROWS_KEY, row.id);
  const names = row.hidden.map((r) => r.storage.name);
  const disks = row.hidden.reduce((n, r) => n + r.disks.length, 0);
  const folders = row.hidden.reduce(
    (n, r) => n + r.folders.shown.length + r.folders.hidden.length,
    0,
  );
  const ok = row.hidden.every((r) => r.tone === null);
  const link = words.moreRows.link(row.hidden.length, ok);
  return (
    <li
      data-slot="nas-map-row"
      data-kind="more"
      data-trace={rowTrace(trace, row.id)}
      aria-label={link}
      className={rowClass}
      style={{ "--r": index } as React.CSSProperties}
    >
      <Edge />
      <span className={cellClass}>
        <span className={lineClass}>{words.moreRows.disks(disks)}</span>
      </span>
      <span className={cellClass}>
        <button
          {...item}
          type="button"
          data-part="more-rows"
          className={cn(
            plainButton,
            "text-sm text-link hover:underline focus-visible:outline-offset-4 data-[trace=dim]:text-tertiary-foreground",
          )}
        >
          {link}
        </button>
      </span>
      <span className={cn(cellClass, foldersCellClass)}>
        <span className={cn(lineClass, folderLineClass)}>
          {words.moreRows.folders(names, folders)}
        </span>
      </span>
    </li>
  );
}

/** What a row will look like, for a NAS with nothing on it yet (7.3): a picture, hidden from assistive technology. */
function ExampleRow({ meter }: { meter?: React.ReactNode }) {
  const { words } = useMap();
  const e = words.example;
  return (
    <li
      data-slot="nas-map-row"
      data-kind="example"
      aria-hidden="true"
      className={rowClass}
    >
      <Edge />
      <span className={cellClass}>
        <span className="grid min-w-12 justify-items-center p-0.5 text-tertiary-foreground">
          <Icon
            name="disk-hdd"
            size={20}
            motion="none"
            className="opacity-60"
          />
          <span className="font-mono text-xs">{e.device}</span>
        </span>
        <NasMapWire tone="ghost" />
      </span>
      <span className={cellClass}>
        <NasMapStorageCell
          variant="ghost"
          kind="fs"
          name={e.storage}
          tech={e.tech}
          meter={
            meter ?? (
              <span className="block h-1.5 rounded-full border border-dashed border-art-faint" />
            )
          }
        />
      </span>
      <span className={cn(cellClass, foldersCellClass)}>
        <NasMapWire place="folders" tone="ghost" />
        <span className="flex flex-1 flex-wrap items-center gap-x-5.5 gap-y-1 self-center @max-[37.5rem]/nasmap:self-stretch">
          <NasMapFolderChip
            variant="ghost"
            name={e.folder}
            ways={[{ id: "smb", label: "" }]}
          />
          <span className="text-xs text-tertiary-foreground">{e.tag}</span>
        </span>
      </span>
    </li>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((r) => (
        <li
          key={r}
          data-slot="nas-map-row"
          data-kind="skeleton"
          aria-hidden="true"
          className={rowClass}
        >
          <Edge />
          <span className={cellClass}>
            <span className="flex gap-1.5">
              <Skeleton shape="block" className="h-12 w-10" />
              {r === 1 ? (
                <Skeleton shape="block" className="h-12 w-10" />
              ) : null}
            </span>
            <NasMapWire />
          </span>
          <span className={cellClass}>
            <Skeleton shape="block" className="h-11 w-full" />
          </span>
          <span className={cn(cellClass, foldersCellClass)}>
            <NasMapWire place="folders" />
            <span className="flex flex-1 flex-wrap items-center gap-x-5.5 self-center @max-[37.5rem]/nasmap:self-stretch">
              <Skeleton shape="block" className="h-5 w-24" />
              <Skeleton shape="block" className="h-5 w-24" />
            </span>
          </span>
        </li>
      ))}
    </>
  );
}

// ─── The band: ways in into the network ───────────────────────────────────────────────────────

// One fan-in that reads at a glance: each way in that is on has a short stub to one bus, the bus one
// stub to each interface, and each interface one to your network. Items are one height, so the
// bus's ends are the first and last items' middles and every line is straight. Narrow, it stacks.
const stub =
  "after:absolute after:top-[calc(50%-1px)] after:w-5.5 after:border-t-2 after:border-art-line after:transition-[border-color,opacity] after:duration-base " +
  "group-data-[lit]/band:after:border-selected-mark @max-[37.5rem]/nasmap:after:hidden";
const stubBefore =
  "before:absolute before:top-[calc(50%-1px)] before:w-5.5 before:border-t-2 before:border-art-line before:transition-[border-color] before:duration-base " +
  "group-data-[lit]/band:before:border-selected-mark @max-[37.5rem]/nasmap:before:hidden";

const bandItemClass = cva(
  "grid min-h-9.5 w-full grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 rounded-sm px-2 py-1 text-start text-foreground compact:min-h-7.5 compact:py-0.5 " +
    "transition-colors duration-base ease-standard",
  {
    variants: {
      variant: {
        button:
          plainButton +
          " hover:[&_[data-part=band-name]]:underline hover:[&_[data-part=band-name]]:underline-offset-3 " +
          "data-[trace=lit]:bg-selected data-[trace=lit]:[&_[data-part=band-name]]:text-selected-label " +
          "data-[trace=dim]:text-tertiary-foreground data-[trace=dim]:[&_svg]:opacity-45 data-[trace=dim]:[&_*]:text-tertiary-foreground",
        plain: "",
      },
    },
    defaultVariants: { variant: "button" },
  },
);

function WayItem({
  way,
  interfaces,
  said,
}: {
  way: NasWay;
  interfaces: readonly NasInterface[];
  said: boolean;
}) {
  const { words } = useMap();
  const item = useItem(wayKey(way.id), null, false);
  return (
    <li
      data-part="way"
      data-trace={item["data-trace"]}
      className={cn(
        "relative",
        stub,
        "after:start-full data-[trace=lit]:after:border-selected-mark data-[trace=dim]:after:opacity-40",
      )}
    >
      <button
        {...item}
        type="button"
        aria-label={words.wayLabel({
          name: way.name,
          tech: way.tech,
          running: way.running,
          over: interfaces.filter((i) => i.up).map((i) => i.name),
        })}
        className={bandItemClass()}
      >
        <Icon
          name={WAY_ICON[way.id]}
          size={20}
          motion="none"
          className="text-muted-foreground"
        />
        <span
          data-part="band-name"
          className="truncate text-sm leading-4.5 font-semibold"
        >
          {way.name}{" "}
          <span className="text-xs font-normal text-tertiary-foreground">
            {way.tech}
          </span>
        </span>{" "}
        {/* A running way says nothing when the band says it once for all; a problem, its icon and word. */}
        {way.running && said ? null : (
          <span
            className={cn(
              "inline-flex items-center gap-1 justify-self-start ps-2 text-xs whitespace-nowrap text-muted-foreground",
              !way.running && labelClass({ tone: "warning" }),
            )}
          >
            {way.running ? null : (
              <StatusIcon status="warning" className="size-3" />
            )}
            {way.running ? words.running : words.notRunning}
          </span>
        )}
      </button>
    </li>
  );
}

function InterfaceItem({ iface }: { iface: NasInterface }) {
  const { words, trace } = useMap();
  const item = useItem(interfaceKey(iface.id), null, false);
  const lit = trace !== null && trace.ways.size > 0;
  return (
    <li
      data-part="interface"
      className={cn(
        "relative",
        stub,
        stubBefore,
        "after:start-full before:end-full",
      )}
    >
      <button
        {...item}
        data-trace={lit ? "lit" : item["data-trace"]}
        type="button"
        className={bandItemClass()}
      >
        <Icon
          name={INTERFACE_ICON[iface.kind]}
          size={20}
          motion="none"
          className="text-muted-foreground"
        />
        <span
          data-part="band-name"
          className="truncate font-mono text-sm font-semibold"
        >
          {iface.name}
        </span>{" "}
        {iface.up ? (
          <span className="justify-self-start ps-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {[iface.speed, iface.address].filter(Boolean).length > 0 ? (
              <>
                {iface.speed}
                {iface.speed && iface.address ? ", " : null}
                {iface.address ? (
                  <span className="font-mono">{iface.address}</span>
                ) : null}
              </>
            ) : null}
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1 ps-2 text-xs whitespace-nowrap",
              labelClass({ tone: "critical" }),
            )}
          >
            <StatusIcon status="critical" className="size-3" />
            {words.notConnected}
          </span>
        )}
      </button>
    </li>
  );
}

/** The bus a list's stubs join: a vertical line between its first and last items' middles. */
function Bus({ column, count }: { column: string; count: number }) {
  return (
    <span
      aria-hidden="true"
      data-part="bus"
      className={cn(
        "relative row-start-2 self-stretch",
        column,
        "@max-[37.5rem]/nasmap:col-start-1 @max-[37.5rem]/nasmap:row-start-auto @max-[37.5rem]/nasmap:ms-4 @max-[37.5rem]/nasmap:h-3.5 @max-[37.5rem]/nasmap:w-0 @max-[37.5rem]/nasmap:self-start @max-[37.5rem]/nasmap:border-s-2 @max-[37.5rem]/nasmap:border-art-line @max-[37.5rem]/nasmap:group-data-[lit]/band:border-selected-mark",
      )}
    >
      {count > 1 ? (
        <span
          className={cn(
            "absolute start-[calc(50%-1px)] top-4.75 bottom-4.75 border-s-2 border-art-line transition-[border-color] duration-base compact:top-3.75 compact:bottom-3.75",
            "group-data-[lit]/band:border-selected-mark @max-[37.5rem]/nasmap:hidden",
          )}
        />
      ) : (
        <span
          className={cn(
            "absolute inset-x-0 top-[calc(50%-1px)] border-t-2 border-art-line transition-[border-color] duration-base",
            "group-data-[lit]/band:border-selected-mark @max-[37.5rem]/nasmap:hidden",
          )}
        />
      )}
    </span>
  );
}

function Band({
  view,
  captions,
  laneError,
}: {
  view: NasMapView;
  captions: readonly NasLane[];
  laneError: (lane: NasLane) => React.ReactNode;
}) {
  const { trace, words } = useMap();
  const id = React.useId();
  const lit = trace !== null && trace.ways.size > 0;
  const waysRead = readOf(view.reads, "ways");
  const netRead = readOf(view.reads, "network");
  const running = waysRead === "ok" ? waysRunning(view.ways.on) : null;
  const narrowPlace =
    "@max-[37.5rem]/nasmap:col-start-1 @max-[37.5rem]/nasmap:row-start-auto";
  return (
    <div
      data-slot="nas-map-band"
      data-tracing={trace ? "" : undefined}
      data-lit={lit || undefined}
      className="group/band mt-5.5 grid grid-cols-[minmax(0,max-content)_2.75rem_minmax(0,max-content)_2.75rem_minmax(0,max-content)_minmax(0,1fr)] items-center gap-y-2 @max-[37.5rem]/nasmap:grid-cols-1 @max-[37.5rem]/nasmap:gap-y-0"
    >
      <div
        data-part="band-head"
        className={cn(
          "col-start-1 row-start-1 flex flex-col gap-0.5 self-end",
          narrowPlace,
          "@max-[37.5rem]/nasmap:mb-2",
        )}
      >
        <span className="flex flex-wrap items-baseline gap-x-2.5">
          <h3
            id={`${id}-ways`}
            className="text-sm leading-4.5 font-normal text-muted-foreground"
          >
            {words.lanes.ways.title}
          </h3>
          {running ? (
            <span className="text-xs text-tertiary-foreground">
              {words.waysRunning(running.running, running.total)}
            </span>
          ) : null}
        </span>
        {captions.includes("ways") ? (
          <p className="text-xs text-tertiary-foreground compact:hidden">
            {words.lanes.ways.caption}
          </p>
        ) : null}
      </div>
      <div
        data-part="band-head"
        className="col-start-3 col-end-7 row-start-1 flex flex-col gap-0.5 self-end @max-[37.5rem]/nasmap:hidden"
      >
        <h3
          id={`${id}-net`}
          className="text-sm leading-4.5 font-normal text-muted-foreground"
        >
          {words.lanes.network.title}
        </h3>
        {captions.includes("network") ? (
          <p className="text-xs text-tertiary-foreground compact:hidden">
            {words.lanes.network.caption}
          </p>
        ) : null}
      </div>
      <div
        data-part="band-ways"
        className={cn("col-start-1 row-start-2 min-w-0", narrowPlace)}
      >
        {waysRead === "failed" ? (
          laneError("ways")
        ) : waysRead === "loading" ? (
          <Skeleton className="w-48" />
        ) : view.ways.on.length > 0 ? (
          <ul
            aria-labelledby={`${id}-ways`}
            className="grid w-full grid-cols-[max-content_max-content_minmax(max-content,1fr)] gap-y-1 [&>li]:col-span-full [&>li]:grid [&>li]:grid-cols-subgrid [&>li>button]:col-span-full [&>li>button]:grid-cols-subgrid @max-[37.5rem]/nasmap:grid-cols-[max-content_minmax(0,1fr)_max-content]"
          >
            {view.ways.on.map((w) => (
              <WayItem
                key={w.id}
                way={w}
                interfaces={view.interfaces}
                said={running !== null}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{words.noWayOn}</p>
        )}
      </div>
      {view.ways.off.length > 0 && waysRead === "ok" ? (
        <p
          data-part="band-off"
          className="col-start-1 col-end-7 row-start-3 text-xs text-muted-foreground @max-[37.5rem]/nasmap:order-last @max-[37.5rem]/nasmap:col-start-1 @max-[37.5rem]/nasmap:col-end-2 @max-[37.5rem]/nasmap:row-start-auto @max-[37.5rem]/nasmap:mt-1.5"
        >
          {words.off(view.ways.off.map((w) => w.name))}
        </p>
      ) : null}
      <Bus column="col-start-2" count={view.ways.on.length} />
      <div
        data-part="band-net"
        className={cn("col-start-3 row-start-2 min-w-0", narrowPlace)}
      >
        {netRead === "failed" ? (
          laneError("network")
        ) : netRead === "loading" ? (
          <Skeleton className="w-48" />
        ) : (
          <ul
            aria-labelledby={`${id}-net`}
            className="grid w-full grid-cols-[max-content_max-content_minmax(max-content,1fr)] gap-y-1 [&>li]:col-span-full [&>li]:grid [&>li]:grid-cols-subgrid [&>li>button]:col-span-full [&>li>button]:grid-cols-subgrid @max-[37.5rem]/nasmap:grid-cols-[max-content_minmax(0,1fr)_max-content]"
          >
            {view.interfaces.map((n) => (
              <InterfaceItem key={n.id} iface={n} />
            ))}
          </ul>
        )}
      </div>
      <Bus column="col-start-4" count={view.interfaces.length} />
      <div
        data-part="band-world"
        className={cn(
          "relative col-start-5 row-start-2 inline-flex min-h-9.5 items-center gap-2.5 justify-self-start px-2.5 text-foreground compact:min-h-7.5",
          stubBefore,
          "before:end-full",
          narrowPlace,
          "@max-[37.5rem]/nasmap:mb-1.5 @max-[37.5rem]/nasmap:px-2",
        )}
      >
        <House aria-hidden="true" className="size-5 text-muted-foreground" />
        <span
          className={cn("text-sm font-semibold", lit && "text-selected-label")}
        >
          {words.world}
        </span>
      </div>
    </div>
  );
}

// ─── Errors ───────────────────────────────────────────────────────────────────────────────────

function readOf(
  reads: NasMapView["reads"],
  lane: NasLane,
): "ok" | "loading" | "failed" {
  return reads[lane] ?? "loading";
}

function LaneError({
  title,
  message,
  retry,
}: {
  title: string;
  message?: React.ReactNode;
  retry?: { label: string; busy: boolean; onRetry: () => void };
}) {
  return (
    <div
      role="alert"
      data-part="lane-error"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
    >
      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-unknown-label">
        <StatusIcon status="unknown" />
        {title}
      </p>
      {message ? (
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {message}
        </p>
      ) : null}
      {retry ? (
        <Button
          variant="neutral"
          size="sm"
          disabled={retry.busy}
          onClick={retry.onRetry}
        >
          <RotateCw aria-hidden="true" />
          {retry.label}
        </Button>
      ) : null}
    </div>
  );
}

// ─── The map ──────────────────────────────────────────────────────────────────────────────────

interface NasMapProps extends Omit<
  React.ComponentProps<"section">,
  "children" | "title"
> {
  /** What to draw: `nasMapView(input)`. */
  view: NasMapView;
  /** Everything the map says, from the app's catalogue. */
  words: NasMapWords;
  /** Each storage's space used, drawn by the page (a meter or the waffle), in its row's slot. */
  meter: (storage: NasStorage) => React.ReactNode;
  /** Pressing a thing on the map: open its page. */
  onOpen: (item: NasMapItem) => void;
  /** The columns that show their one-line caption for a newcomer (P.3). Compact density hides them. */
  captions?: readonly NasLane[];
  /** Show the example row of a new NAS (P.3, G1): newcomer guidance, so it follows "Show tips". */
  example?: boolean;
  /**
   * The unused row's "Add storage": the app's button (`<Button>Add storage</Button>`), which joins
   * the map's tab stop. Leave it out when a first step offers it; the row is then a picture.
   */
  addStorage?: React.ReactElement | null;
  /** The map's actions under the band, in reading order, each once on the screen (`nasMapActions`). */
  actions?: React.ReactNode;
  /** A first-time tip in the map's header: the app's `Tip`. */
  tip?: React.ReactNode;
  /** Pointing at or focusing a thing on the map: the first success of the tracing tip. */
  onTraced?: () => void;
  /** The heading's level: 2 by default. */
  headingLevel?: 2 | 3;
  /**
   * The first visit's assembly (6.8): whether this browser has seen it, from the app's first-time
   * flags. On a first visit the NAS assembles row by row, once, and `onSeen` is called; otherwise it
   * is there when the page is. The library keeps no flag of its own.
   */
  seen?: boolean;
  onSeen?: () => void;
  /** "Show me around": assemble again whatever `seen` says. Re-key the map to replay it. */
  replay?: boolean;
  /**
   * A problem that just arrived (7.6): the disk or storage id it is about and a count that changes
   * with each arrival. Its row's connectors draw again in its tone.
   */
  arrival?: { id: string; n: number } | null;
  /** A failed read's message, as text from the backend (UI-2), per lane. */
  errors?: Partial<Record<NasLane, React.ReactNode>>;
  /** Read a failed lane again; the lanes being read again show their button busy. */
  onRetry?: (lane: NasLane) => void;
  retrying?: readonly NasLane[];
}

const gridClass =
  "grid grid-cols-[1.75rem_minmax(0,max-content)_minmax(12.5rem,15rem)_minmax(0,1fr)] " +
  "@max-[60rem]/nasmap:grid-cols-[1.5rem_minmax(0,max-content)_minmax(11.25rem,12.75rem)_minmax(0,1fr)] @max-[37.5rem]/nasmap:block";

/**
 * The NAS as a map read by rows, not lines (rethink 6.8), on the page ground with nothing boxed. Each
 * storage is a row, left to right: its disks, a short straight connector, the storage with its meter,
 * another connector and its shared folders with the ways they are reached by. What hangs together
 * sits on one row, so a problem flows along its row and nowhere else: the row starts with the
 * problem's icon and its connectors take the tone. A storage with no disk attached (a file system on
 * an array the dashboard does not read) says where its disks are in their place, with no connector;
 * the disks in an array stand on a row of their own and are never called unused. Unused disks end
 * where new storage will go. Under
 * the rows, one band: the ways in that are on, fanning into the network through one bus.
 *
 * Tracing is highlighting: pointing at or focusing a thing lights what it belongs to and reaches, the
 * rest is shown at reduced emphasis (never under 3:1 for text). The rows are one tab stop, moved by
 * the arrow keys. The rows share their column tracks (a subgrid), so the eye scans a column as easily
 * as a row. Under 600px of its own width each row stacks, its connectors vertical.
 *
 * Motion (7.2, 7.6, 7.10), all in css-ui-style `src/nas-map.css`: the first visit's assembly (fades
 * done within 400ms, movement and drawing to about 900ms), a problem's row drawing its connectors
 * again, and a ghost becoming real (a row that appears later draws in from the dashed picture). Under
 * reduced motion each is a short fade. Geometry from data (a row's place in the assembly) reaches the
 * CSS as custom properties through React's `style`, never markup.
 */
function NasMap({
  view,
  words,
  meter,
  onOpen,
  captions = [],
  example = false,
  addStorage,
  actions,
  tip,
  onTraced,
  headingLevel = 2,
  seen = true,
  onSeen,
  replay = false,
  arrival = null,
  errors,
  onRetry,
  retrying = [],
  className,
  style,
  ...props
}: NasMapProps) {
  const titleId = React.useId();
  const hintId = React.useId();
  const loading = readOf(view.reads, "storage") === "loading";
  const storageFailed = readOf(view.reads, "storage") === "failed";
  const [hot, setHot] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<string | null>(null);
  const elementsRef = React.useRef(new Map<string, HTMLElement>());

  // The first visit: decided once, when the rows are there to assemble.
  const noop = React.useCallback(() => undefined, []);
  const first = useFirstTime(seen, onSeen ?? noop);
  const [assemble, setAssemble] = React.useState<boolean | null>(() =>
    loading ? null : replay || first.first,
  );
  if (assemble === null && !loading) {
    setAssemble(replay || first.first);
  }
  const markSeen = first.done;
  React.useEffect(() => {
    if (assemble) {
      markSeen();
    }
  }, [assemble, markSeen]);

  // The rows there when the map was first drawn with its readings; one that appears later (storage
  // just added) is a ghost becoming real.
  const [firstRows, setFirstRows] = React.useState<ReadonlySet<string> | null>(
    () => (loading ? null : new Set(view.rows.map((r) => r.id))),
  );
  if (firstRows === null && !loading) {
    setFirstRows(new Set(view.rows.map((r) => r.id)));
  }

  const grid = React.useMemo(
    () =>
      loading || storageFailed
        ? []
        : view.rows.map((r) => rowKeys(r, Boolean(addStorage))),
    [view.rows, loading, storageFailed, addStorage],
  );
  const flat = grid.flat(2);
  const current =
    active !== null && flat.includes(active) ? active : (flat[0] ?? null);
  const trace = React.useMemo(
    () => (hot === null ? null : traceOf(view, hot)),
    [hot, view],
  );
  const arrivalRow =
    arrival === null
      ? undefined
      : view.rows.find(
          (r) =>
            r.kind === "storage" &&
            (r.storage.id === arrival.id ||
              r.disks.some((d) => d.id === arrival.id)),
        )?.id;

  const register = React.useCallback((key: string, el: HTMLElement | null) => {
    if (el) {
      elementsRef.current.set(key, el);
    } else {
      elementsRef.current.delete(key);
    }
  }, []);
  const onTrace = React.useCallback(
    (key: string | null) => {
      setHot(key);
      if (key !== null) {
        if (flat.includes(key)) {
          setActive(key);
        }
        onTraced?.();
      }
    },
    [flat, onTraced],
  );
  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (current === null) {
      return;
    }
    const target = moveInRows(grid, current, event.key);
    if (target === null) {
      return;
    }
    event.preventDefault();
    setActive(target);
    elementsRef.current.get(target)?.focus();
  };

  const ctx: MapContextValue = {
    trace,
    current,
    onTrace,
    register,
    onOpen,
    items: view.items,
    words,
  };

  const laneError = (lane: NasLane) => (
    <LaneError
      title={words.laneError(lane)}
      message={errors?.[lane]}
      retry={
        onRetry
          ? {
              label: retrying.includes(lane) ? words.retrying : words.retry,
              busy: retrying.includes(lane),
              onRetry: () => {
                onRetry(lane);
              },
            }
          : undefined
      }
    />
  );

  const Heading = headingLevel === 2 ? "h2" : "h3";
  const SubHeading = headingLevel === 2 ? "h3" : "h4";
  const columnCaptions = captions.some(
    (l) => l === "disks" || l === "storage" || l === "folders",
  );

  return (
    <MapContext value={ctx}>
      <section
        data-slot="nas-map"
        data-assemble={assemble ? "full" : undefined}
        data-tracing={trace ? "" : undefined}
        aria-labelledby={titleId}
        aria-busy={loading || undefined}
        className={cn("@container/nasmap relative min-w-0", className)}
        style={{ "--rows": view.rows.length, ...style } as React.CSSProperties}
        {...props}
      >
        <header className="mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 compact:mb-1.5">
          <Heading id={titleId} className="text-section text-foreground">
            {words.title}
          </Heading>
          {tip ? <div className="min-w-0 basis-full">{tip}</div> : null}
        </header>

        {(["disks", "folders"] as const)
          .filter((lane) => readOf(view.reads, lane) === "failed")
          .map((lane) => (
            <div key={lane} className="mb-3">
              {laneError(lane)}
            </div>
          ))}

        <div data-part="grid" className={gridClass}>
          <div
            data-part="columns"
            className={cn(
              "col-span-full grid grid-cols-subgrid items-end pb-2",
              columnCaptions
                ? "@max-[37.5rem]/nasmap:mb-2.5 @max-[37.5rem]/nasmap:flex @max-[37.5rem]/nasmap:flex-col @max-[37.5rem]/nasmap:items-stretch @max-[37.5rem]/nasmap:gap-1 compact:@max-[37.5rem]/nasmap:hidden"
                : "@max-[37.5rem]/nasmap:hidden",
            )}
          >
            <span className="@max-[37.5rem]/nasmap:hidden" />
            {(["disks", "storage", "folders"] as const).map((lane) => (
              <span
                key={lane}
                data-part="column"
                className={cn(
                  "flex min-w-0 flex-col gap-0.5 pe-3 @max-[37.5rem]/nasmap:flex-row @max-[37.5rem]/nasmap:flex-wrap @max-[37.5rem]/nasmap:items-baseline @max-[37.5rem]/nasmap:gap-x-2 @max-[37.5rem]/nasmap:p-0",
                  lane === "folders" && "ps-9.5",
                )}
              >
                <SubHeading className="text-sm leading-4.5 font-normal text-muted-foreground">
                  {words.lanes[lane].title}
                </SubHeading>
                {captions.includes(lane) ? (
                  <span className="text-xs text-tertiary-foreground compact:hidden">
                    {words.lanes[lane].caption}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
          {storageFailed ? (
            <div className="col-span-full">{laneError("storage")}</div>
          ) : (
            <ul
              tabIndex={-1}
              aria-label={words.rowsLabel}
              aria-describedby={hintId}
              onKeyDown={onKeyDown}
              className="col-span-full grid grid-cols-subgrid border-b border-border outline-none @max-[37.5rem]/nasmap:flex @max-[37.5rem]/nasmap:flex-col"
            >
              {loading ? (
                <SkeletonRows />
              ) : (
                view.rows.map((row, index) => {
                  const fresh = firstRows !== null && !firstRows.has(row.id);
                  switch (row.kind) {
                    case "storage":
                      return (
                        <StorageRowView
                          key={
                            row.id === arrivalRow
                              ? `${row.id} ${String(arrival?.n ?? 0)}`
                              : row.id
                          }
                          row={row}
                          index={index}
                          fresh={fresh}
                          arrival={row.id === arrivalRow}
                          meter={meter(row.storage)}
                          reads={view.reads}
                        />
                      );
                    case "raid":
                      return (
                        <RaidRowView
                          key={row.id}
                          row={row}
                          index={index}
                          fresh={fresh}
                          reads={view.reads}
                        />
                      );
                    case "unused":
                      return (
                        <UnusedRowView
                          key={row.id}
                          row={row}
                          index={index}
                          fresh={fresh}
                          addStorage={addStorage}
                          captions={captions.includes("folders")}
                          reads={view.reads}
                        />
                      );
                    case "more":
                      return (
                        <MoreRowView
                          key={row.id}
                          row={row}
                          index={index}
                          fresh={fresh}
                        />
                      );
                  }
                })
              )}
              {!loading && example ? <ExampleRow /> : null}
            </ul>
          )}
          <p id={hintId} className="sr-only">
            {words.keyboardHint}
          </p>
        </div>

        {loading ? null : (
          <Band view={view} captions={captions} laneError={laneError} />
        )}

        {actions ? (
          <div
            data-part="actions"
            className="-ms-2.5 mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1"
          >
            {actions}
          </div>
        ) : null}
      </section>
    </MapContext>
  );
}

export { NasMap, NasMapFolderChip, NasMapStorageCell, NasMapWire };
export type {
  NasMapFolderChipProps,
  NasMapProps,
  NasMapStorageCellProps,
  NasMapWireProps,
};
