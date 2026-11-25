// SPDX-License-Identifier: GPL-3.0-or-later
// Region C, "Your NAS" (rethink spec 6.8): the NAS read by rows, not lines, on the page ground with
// nothing boxed. Each storage is one row, left to right: its disks as their drawings, a short straight
// connector, the storage as its icon, name, usage bar and figures, another connector and its shared
// folders as icon and name with the ways they are reached by. What hangs together sits on one row, so
// a problem flows right along its row and nowhere else: the row starts with the problem's status
// icon and its connectors take the tone. Unused disks end in "Add storage". Under the rows, one band:
// the ways in that are on, as icon, name and state, fanning into the network through one bus.
// Tracing is highlighting: pointing at or focusing a thing lights what it belongs to and reaches,
// and shows the rest at reduced emphasis. The rows share their column tracks (a subgrid), so the
// column headers read and the eye scans down a column as easily as along a row.
//
// Lab-local until the owner has seen it, the candidate *SystemMap of spec 8 row 1. Development
// only (UI-11). Connectors are CSS borders between neighbours on one row, so none can cross another;
// motion runs through CSS keyframes, and geometry from data (a row's place in the assembly) reaches
// the CSS as custom properties through the CSSOM, never a style attribute in markup (UI-1).
import type { IconName } from "@omv-webui/react-ui-components";
import {
  Button,
  CapacityMeter,
  Icon,
  Skeleton,
  StatusIcon,
} from "@omv-webui/react-ui-components";
import { House, RotateCw } from "lucide-react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import {
  createContext,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { Tip } from "../forms/parts.tsx";
import type { ItemProps } from "./Bay.tsx";
import { BayStrip, SlotTile } from "./Bay.tsx";
import type {
  AccentAt,
  LaneId,
  Layout,
  MapAction,
  MapFolder,
  MapIface,
  MapStorage,
  MapView,
  MapWay,
  MoreRow,
  Nas,
  RowDisk,
  StorageRow,
  Trace,
  UnusedRow,
  WayId,
} from "./model.ts";
import {
  ADD_KEY,
  diskKey,
  folderState,
  LANES,
  listWords,
  mapActions,
  moreKey,
  moreWords,
  moveInRows,
  percent,
  plural,
  rowDiskState,
  rowKeys,
  rowName,
  stripKey,
  traceOf,
  wayKey,
  wayName,
  waysRunning,
} from "./model.ts";
import type { Assemble } from "./welcome.ts";

const WAY_ICON: Record<WayId, IconName> = {
  smb: "service-smb",
  nfs: "service-nfs",
  rsync: "service-rsync",
  ssh: "service-ssh",
};

const WAY_SHORT: Record<WayId, string> = {
  smb: "Windows and Mac",
  nfs: "Linux",
  rsync: "rsync",
  ssh: "SSH",
};

const STORAGE_ICON: Record<MapStorage["kind"], IconName> = {
  fs: "file-system",
  raid: "raid-array",
  zfs: "zfs-pool",
};

const ACTION_ICON: Partial<Record<MapAction, ReactNode>> = {
  "Check disk health": <Icon name="check-health" size={16} />,
  "Add storage": <Icon name="file-system" mark="create" size={16} />,
  "Add a shared folder": <Icon name="shared-folder" mark="create" size={16} />,
};

const LANE_ERROR = "The request timed out after 10 seconds.";

// ─── The map's context: tracing and the one tab stop ──────────────────────────────────────────

interface MapCtx {
  trace: Trace | null;
  current: string | null;
  onTrace: (key: string | null) => void;
  register: (key: string, el: HTMLElement | null) => void;
  onNote: (text: string) => void;
  /** The start of the map's element ids: "dm" on the dashboard. */
  ids: string;
}

const MapContext = createContext<MapCtx | null>(null);

function useMapCtx(): MapCtx {
  const ctx = use(MapContext);
  if (!ctx) {
    throw new Error("A map item outside the map.");
  }
  return ctx;
}

/**
 * A thing on the map: lit when the trace names it, left as it is on a lit row, dimmed otherwise.
 * On the rows it is part of one roving tab stop; in the band each is its own.
 */
function useItem(key: string, rowId: string | null, roving = true): ItemProps {
  const ctx = useMapCtx();
  const t = ctx.trace;
  return {
    ref: (el) => {
      ctx.register(key, el);
    },
    "data-key": key,
    "data-trace": !t
      ? undefined
      : t.keys.has(key)
        ? "lit"
        : rowId !== null && t.rows.has(rowId)
          ? undefined
          : "dim",
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
  };
}

function rowTrace(ctx: MapCtx, rowId: string): "lit" | "dim" | undefined {
  if (!ctx.trace) {
    return undefined;
  }
  return ctx.trace.rows.has(rowId) ? "lit" : "dim";
}

// ─── The pieces of a row ──────────────────────────────────────────────────────────────────────

function Slot({
  rowId,
  disk,
  said,
}: {
  rowId: string;
  disk: RowDisk;
  said: boolean;
}) {
  const ctx = useMapCtx();
  const item = useItem(diskKey(rowId, disk.id), rowId);
  return (
    <SlotTile
      disk={disk}
      alsoIn={disk.alsoIn}
      said={said}
      item={item}
      onOpen={ctx.onNote}
    />
  );
}

function Strip({ rowId, row }: { rowId: string; row: StorageRow | UnusedRow }) {
  const ctx = useMapCtx();
  const item = useItem(stripKey(rowId), rowId);
  return (
    <BayStrip
      disks={row.bay.strip}
      hasFull={row.bay.full.length > 0}
      item={item}
      onOpen={ctx.onNote}
    />
  );
}

/**
 * The row's disks: full slots, then the strip when there are more than six. A state several of them
 * share is said once under them ("Not checked yet: sda, sdb and sdc"); only a disk whose state
 * differs keeps its own word.
 */
function Bay({
  row,
  failed,
}: {
  row: StorageRow | UnusedRow;
  failed: boolean;
}) {
  if (failed) {
    return (
      <span className="dm-bay dm-bay-unread">
        <StatusIcon status="unknown" />
        Disks: not read
      </span>
    );
  }
  if (row.disks.length === 0) {
    return <span className="dm-bay dm-bay-none">Disks: none</span>;
  }
  const shared = rowDiskState(row.bay.full);
  const problem = shared?.health === "warning" || shared?.health === "critical";
  return (
    <span className="dm-bay" data-strip={row.bay.strip.length > 0 || undefined}>
      {row.bay.full.map((d, i) => (
        <span
          key={d.id}
          className="dm-slot-wrap"
          style={{ "--i": i } as CSSProperties}
        >
          <Slot rowId={row.id} disk={d} said={shared?.ids.has(d.id) ?? false} />
        </span>
      ))}
      {row.bay.strip.length > 0 ? <Strip rowId={row.id} row={row} /> : null}
      {shared ? (
        <span className="dm-bay-said" data-health={shared.health}>
          {problem ? <StatusIcon status={shared.health} /> : null}
          {shared.words}
        </span>
      ) : null}
    </span>
  );
}

/** A short straight connector between neighbours on a row; it takes the row's tone. */
function Wire({ tone, dashed }: { tone?: string | null; dashed?: boolean }) {
  return (
    <span
      className="dm-wire"
      data-tone={tone ?? undefined}
      data-dashed={dashed || undefined}
      aria-hidden="true"
    />
  );
}

function StorageNode({ row }: { row: StorageRow }) {
  const ctx = useMapCtx();
  const s = row.storage;
  const item = useItem(s.id, row.id);
  const own = s.health === "warning" || s.health === "critical";
  // A disk in trouble puts the storage at risk; its own problem is said beside the meter's figures.
  const atRisk = !own && row.tone !== null;
  const { ref, onPointerEnter, onPointerLeave, ...focus } = item;
  return (
    <div
      className="dm-store"
      data-health={s.health}
      data-risk={atRisk ? (row.tone ?? undefined) : undefined}
      data-trace={item["data-trace"]}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <button
        ref={ref}
        {...focus}
        type="button"
        className="dm-store-main"
        onClick={() => {
          ctx.onNote(`Opens ${s.name}.`);
        }}
      >
        <Icon name={STORAGE_ICON[s.kind]} size={20} motion="none" />
        <span className="dm-store-words">
          <span className="dm-store-name">
            <bdi>{s.name}</bdi>
          </span>
          <span className="dm-store-tech">{s.tech}</span>
        </span>
        {atRisk ? (
          <span className="dm-state" data-health={row.tone ?? undefined}>
            <StatusIcon status={row.tone ?? "warning"} />
            At risk
          </span>
        ) : null}
      </button>
      <CapacityMeter
        variant="compact"
        label={`${s.name}: space used`}
        value={s.used}
        max={1}
        valueText={`${percent(s.used)} used, ${s.free} free`}
        threshold={
          s.health === "warning" || s.health === "critical"
            ? { status: s.health, label: s.word }
            : undefined
        }
        className="dm-usage"
      />
    </div>
  );
}

function FolderChip({
  folder,
  row,
  index,
}: {
  folder: MapFolder;
  row: StorageRow;
  index: number;
}) {
  const ctx = useMapCtx();
  const item = useItem(folder.id, row.id);
  const state = folderState(folder, row.tone);
  const via = folder.via.map((w) => WAY_SHORT[w]);
  // Only the folder's own problem is said on it; the row's status icon and toned connector already
  // say the row is at risk, so the folders do not repeat it.
  const own =
    folder.health === "warning" || folder.health === "critical"
      ? { health: folder.health, word: folder.word }
      : null;
  return (
    <button
      {...item}
      type="button"
      className="dm-folder"
      data-health={state?.health}
      style={{ "--i": index } as CSSProperties}
      aria-label={`${folder.name}: ${via.length > 0 ? `reached by ${listWords(via)}` : "no way in reaches it"}${state ? `, ${state.word.toLowerCase()}` : ""}`}
      onClick={() => {
        ctx.onNote(`Opens the shared folder ${folder.name}.`);
      }}
    >
      <Icon name="shared-folder" size={16} motion="none" />
      <span className="dm-folder-name">
        <bdi>{folder.name}</bdi>
      </span>
      {folder.via.length === 0 ? (
        <span className="dm-folder-none">Ways in: none</span>
      ) : (
        <span className="dm-folder-via">
          {folder.via.map((w) => (
            <span key={w} title={WAY_SHORT[w]} className="dm-folder-way">
              <Icon name={WAY_ICON[w]} size={16} motion="none" />
            </span>
          ))}
        </span>
      )}
      {own ? (
        <span className="dm-state" data-health={own.health}>
          <StatusIcon status={own.health} />
          {own.word}
        </span>
      ) : null}
    </button>
  );
}

function MoreFolders({ row }: { row: StorageRow }) {
  const ctx = useMapCtx();
  const item = useItem(moreKey(row.id), row.id);
  return (
    <button
      {...item}
      type="button"
      className="dm-folder dm-folder-more"
      style={{ "--i": row.folders.shown.length } as CSSProperties}
      onClick={() => {
        ctx.onNote(`Opens Shared folders, those on ${row.storage.name}.`);
      }}
    >
      {moreWords(row.folders.hidden)}
    </button>
  );
}

function Folders({ row, failed }: { row: StorageRow; failed: boolean }) {
  if (failed) {
    return (
      <span className="dm-secondary-line">
        <StatusIcon status="unknown" />
        Shared folders: not read
      </span>
    );
  }
  if (row.folders.shown.length === 0) {
    return (
      <span className="dm-secondary-line">
        {row.system
          ? "This drive holds the system itself, so it keeps no shared folders."
          : "Shared folders: none"}
      </span>
    );
  }
  return (
    <span className="dm-folders">
      {row.folders.shown.map((f, i) => (
        <FolderChip key={f.id} folder={f} row={row} index={i} />
      ))}
      {row.folders.hidden.length > 0 ? <MoreFolders row={row} /> : null}
    </span>
  );
}

// ─── Rows ─────────────────────────────────────────────────────────────────────────────────────

interface RowProps {
  index: number;
  fresh: boolean;
  arrival: number | undefined;
}

function StorageRowView({
  row,
  failed,
  index,
  fresh,
  arrival,
}: RowProps & { row: StorageRow; failed: readonly LaneId[] }) {
  const ctx = useMapCtx();
  return (
    <li
      key={arrival}
      className="dm-row"
      data-kind="storage"
      data-tone={row.tone ?? undefined}
      data-trace={rowTrace(ctx, row.id)}
      data-arrived={fresh || undefined}
      data-arrival={arrival === undefined ? undefined : ""}
      aria-label={rowName(row)}
      style={{ "--r": index } as CSSProperties}
    >
      <span className="dm-edge" aria-hidden="true">
        {row.tone ? <StatusIcon status={row.tone} /> : null}
      </span>
      <span className="dm-cell dm-cell-disks">
        <Bay row={row} failed={failed.includes("disks")} />
        <Wire tone={row.diskTrouble ? row.tone : null} />
      </span>
      <span className="dm-cell dm-cell-storage">
        <StorageNode row={row} />
      </span>
      <span
        className="dm-cell dm-cell-folders"
        data-tone={row.tone ?? undefined}
      >
        {/* A connector only where it leads to folders. */}
        {row.folders.shown.length > 0 ? <Wire tone={row.tone} /> : null}
        <Folders row={row} failed={failed.includes("folders")} />
      </span>
    </li>
  );
}

function UnusedRowView({
  row,
  index,
  fresh,
  ghostAdds,
  accent,
  failed,
  captions,
}: RowProps & {
  row: UnusedRow;
  ghostAdds: boolean;
  accent: boolean;
  failed: boolean;
  captions: boolean;
}) {
  const ctx = useMapCtx();
  const item = useItem(ADD_KEY, row.id);
  const one = row.disks.length === 1;
  const devices = listWords(row.disks.map((d) => d.device));
  return (
    <li
      className="dm-row"
      data-kind="unused"
      data-trace={rowTrace(ctx, row.id)}
      data-arrived={fresh || undefined}
      aria-label={rowName(row)}
      style={{ "--r": index } as CSSProperties}
    >
      <span className="dm-edge" aria-hidden="true" />
      <span className="dm-cell dm-cell-disks">
        <Bay row={row} failed={failed} />
        <Wire dashed />
      </span>
      <span className="dm-cell dm-cell-storage">
        <span className="dm-ghost-store" data-trace={item["data-trace"]}>
          <span className="dm-ghost-line">
            {one ? "Disk" : "Disks"} {devices} {one ? "is" : "are"} not in use
            yet.
          </span>
          {ghostAdds ? (
            <Button
              {...item}
              variant={accent ? "primary" : "neutral"}
              size="sm"
              className="dm-ghost-action"
              onClick={() => {
                ctx.onNote("Add storage opens its page.");
              }}
            >
              <Icon name="file-system" mark="create" size={16} />
              Add storage
            </Button>
          ) : null}
        </span>
      </span>
      <span className="dm-cell dm-cell-folders">
        {captions ? (
          <span className="dm-secondary-line">
            Shared folders live on storage.
          </span>
        ) : null}
      </span>
    </li>
  );
}

function MoreRowView({ row, index }: RowProps & { row: MoreRow }) {
  const ctx = useMapCtx();
  const item = useItem(row.id, row.id);
  const names = row.hidden.map((r) => r.storage.name);
  const disks = row.hidden.reduce((n, r) => n + r.disks.length, 0);
  const folders = row.hidden.reduce(
    (n, r) => n + r.folders.shown.length + r.folders.hidden.length,
    0,
  );
  return (
    <li
      className="dm-row"
      data-kind="more"
      data-trace={rowTrace(ctx, row.id)}
      aria-label={rowName(row)}
      style={{ "--r": index } as CSSProperties}
    >
      <span className="dm-edge" aria-hidden="true" />
      <span className="dm-cell dm-cell-disks">
        <span className="dm-secondary-line">
          {plural(disks, "disk", "disks")}
        </span>
      </span>
      <span className="dm-cell dm-cell-storage">
        <button
          {...item}
          type="button"
          className="dm-more-rows"
          onClick={() => {
            ctx.onNote("Opens File systems, every drive.");
          }}
        >
          {moreWords(row.hidden.map((r) => ({ health: r.tone ?? "ok" })))}
        </button>
      </span>
      <span className="dm-cell dm-cell-folders">
        <span className="dm-secondary-line">
          {listWords(names)} hold{" "}
          {plural(folders, "shared folder", "shared folders")}.
        </span>
      </span>
    </li>
  );
}

/** What a row will look like, for a NAS with nothing on it yet (7.3): hidden from assistive technology. */
function ExampleRow() {
  return (
    <li
      className="dm-row dm-row-example"
      data-kind="example"
      aria-hidden="true"
    >
      <span className="dm-edge" />
      <span className="dm-cell dm-cell-disks">
        <span className="dm-bay">
          <span className="dm-slot dm-slot-ghost">
            <Icon name="disk-hdd" size={20} motion="none" />
            <span className="dm-slot-device">disk</span>
          </span>
        </span>
        <Wire dashed />
      </span>
      <span className="dm-cell dm-cell-storage">
        <span className="dm-store dm-store-ghost">
          <span className="dm-store-main">
            <Icon name="file-system" size={20} motion="none" />
            <span className="dm-store-words">
              <span className="dm-store-name">Data drive</span>
              <span className="dm-store-tech">EXT4</span>
            </span>
          </span>
          <span className="dm-ghost-bar" />
        </span>
      </span>
      <span className="dm-cell dm-cell-folders">
        <Wire dashed />
        <span className="dm-folders">
          <span className="dm-folder dm-folder-ghost">
            <Icon name="shared-folder" size={16} motion="none" />
            <span className="dm-folder-name">Photos</span>
            <span className="dm-folder-via">
              <Icon name="service-smb" size={16} motion="none" />
            </span>
          </span>
          <span className="dm-example-tag">Example</span>
        </span>
      </span>
    </li>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((r) => (
        <li key={r} className="dm-row" data-kind="skeleton" aria-hidden="true">
          <span className="dm-edge" />
          <span className="dm-cell dm-cell-disks">
            <span className="dm-bay">
              <span className="dm-slot-skeleton" />
              {r === 1 ? <span className="dm-slot-skeleton" /> : null}
            </span>
            <Wire />
          </span>
          <span className="dm-cell dm-cell-storage">
            <Skeleton shape="block" className="dm-store-skeleton" />
          </span>
          <span className="dm-cell dm-cell-folders">
            <Wire />
            <span className="dm-folders">
              {[0, 1].map((i) => (
                <Skeleton
                  key={i}
                  shape="block"
                  className="dm-folder-skeleton"
                />
              ))}
            </span>
          </span>
        </li>
      ))}
    </>
  );
}

// ─── The band: ways in into the network ───────────────────────────────────────────────────────

function WayTile({
  way,
  ifaces,
  said,
}: {
  way: MapWay;
  ifaces: readonly MapIface[];
  /** "Running" is said once beside the heading, so a running way does not repeat it. */
  said: boolean;
}) {
  const ctx = useMapCtx();
  const item = useItem(wayKey(way.id), null, false);
  return (
    <li
      className="dm-way"
      data-trace={item["data-trace"]}
      aria-label={wayName(way, ifaces)}
    >
      <button
        {...item}
        type="button"
        className="dm-wt"
        data-health={way.running ? "ok" : "warning"}
        onClick={() => {
          ctx.onNote(`Opens ${way.name} sharing (${way.tech}).`);
        }}
      >
        <Icon name={WAY_ICON[way.id]} size={20} motion="none" />
        <span className="dm-wt-name">
          {way.name} <span className="dm-wt-tech">{way.tech}</span>
        </span>
        {/* A healthy thing shows its word only, unless the band says it once for all; a problem
            its icon and the word in its colour. */}
        {way.running && said ? null : (
          <span
            className="dm-wt-state"
            data-health={way.running ? undefined : "warning"}
          >
            {way.running ? null : <StatusIcon status="warning" />}
            {way.running ? "Running" : "Not running"}
          </span>
        )}
      </button>
    </li>
  );
}

function IfaceTile({ iface }: { iface: MapIface }) {
  const ctx = useMapCtx();
  const item = useItem(iface.id, null, false);
  const lit = ctx.trace !== null && ctx.trace.ways.size > 0;
  return (
    <li className="dm-iface" data-trace={lit ? "lit" : item["data-trace"]}>
      <button
        {...item}
        data-trace={lit ? undefined : item["data-trace"]}
        type="button"
        className="dm-wt"
        data-health={iface.up ? "ok" : "critical"}
        onClick={() => {
          ctx.onNote(`Opens interface ${iface.name}.`);
        }}
      >
        <Icon name={iface.kind} size={20} motion="none" />
        <span className="dm-wt-name">
          <span className="dm-mono">{iface.name}</span>
        </span>
        {iface.up ? (
          <span className="dm-wt-state">
            {iface.speed}, <span className="dm-mono">{iface.address}</span>
          </span>
        ) : (
          <span className="dm-wt-state" data-health="critical">
            <StatusIcon status="critical" />
            Not connected
          </span>
        )}
      </button>
    </li>
  );
}

function Band({
  view,
  failed,
  captions,
  retrying,
  onRetry,
}: {
  view: MapView;
  failed: readonly LaneId[];
  captions: readonly LaneId[];
  retrying: readonly LaneId[];
  onRetry: (lane: LaneId) => void;
}) {
  const ctx = useMapCtx();
  const ids = ctx.ids;
  const lit = ctx.trace !== null && ctx.trace.ways.size > 0;
  const waysFailed = failed.includes("ways");
  const netFailed = failed.includes("network");
  const running = waysFailed ? null : waysRunning(view.ways.on);
  return (
    <div
      className="dm-band"
      data-tracing={ctx.trace ? "" : undefined}
      data-lit={lit || undefined}
    >
      <div className="dm-band-head" data-part="ways">
        <span className="dm-band-title-row">
          <h3 id={`${ids}-band-ways-title`} className="dm-col-title">
            Ways in
          </h3>
          {running ? <span className="dm-band-note">{running}</span> : null}
        </span>
        {captions.includes("ways") ? (
          <p className="dm-caption">{LANES[3]?.caption}</p>
        ) : null}
      </div>
      <div className="dm-band-head" data-part="net">
        <h3 id={`${ids}-band-net-title`} className="dm-col-title">
          Network
        </h3>
        {captions.includes("network") ? (
          <p className="dm-caption">{LANES[4]?.caption}</p>
        ) : null}
      </div>
      <div
        id={`${ids}-band-ways`}
        tabIndex={-1}
        className="dm-band-part"
        data-part="ways"
      >
        {waysFailed ? (
          <LaneError
            lane="ways in"
            retrying={retrying.includes("ways")}
            onRetry={() => {
              onRetry("ways");
            }}
          />
        ) : view.ways.on.length > 0 ? (
          <ul className="dm-ways" aria-labelledby={`${ids}-band-ways-title`}>
            {view.ways.on.map((w) => (
              <WayTile
                key={w.id}
                way={w}
                ifaces={view.ifaces}
                said={running !== null}
              />
            ))}
          </ul>
        ) : (
          <p className="dm-secondary-line">No way in is on yet.</p>
        )}
      </div>
      {view.ways.off && !waysFailed ? (
        <p className="dm-off">{view.ways.off}</p>
      ) : null}
      <span className="dm-bus" data-part="in" aria-hidden="true" />
      <div
        id={`${ids}-band-net`}
        tabIndex={-1}
        className="dm-band-part"
        data-part="net"
      >
        {netFailed ? (
          <LaneError
            lane="the network"
            retrying={retrying.includes("network")}
            onRetry={() => {
              onRetry("network");
            }}
          />
        ) : (
          <ul className="dm-ifaces" aria-labelledby={`${ids}-band-net-title`}>
            {view.ifaces.map((n) => (
              <IfaceTile key={n.id} iface={n} />
            ))}
          </ul>
        )}
      </div>
      <span className="dm-bus" data-part="out" aria-hidden="true" />
      <div className="dm-world" data-trace={lit ? "lit" : undefined}>
        <House aria-hidden="true" />
        <span className="dm-wt-name">Your network</span>
      </div>
    </div>
  );
}

// ─── Errors ───────────────────────────────────────────────────────────────────────────────────

function LaneError({
  lane,
  retrying,
  onRetry,
}: {
  lane: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="dm-lane-error" role="alert">
      <p className="dm-lane-error-title">
        <StatusIcon status="unknown" />
        Could not read {lane}
      </p>
      {/* The backend's message, as text (UI-2, UI-9). */}
      <p className="dm-lane-error-message">{LANE_ERROR}</p>
      <Button variant="neutral" size="sm" disabled={retrying} onClick={onRetry}>
        <RotateCw aria-hidden="true" />
        {retrying ? "Reading…" : "Try again"}
      </Button>
    </div>
  );
}

// ─── The map ──────────────────────────────────────────────────────────────────────────────────

export interface SystemMapProps {
  nas: Nas;
  view: MapView;
  layout: Layout;
  loading: boolean;
  accent: AccentAt;
  assemble: Assemble;
  /** The columns that show their one-line caption: a newcomer's visit, a new NAS, an empty column. */
  captions: readonly LaneId[];
  /**
   * Whether a new NAS shows its example row (P.3 G1). Newcomer guidance, so it follows tips, not
   * density: compact hides the captions only (owner decision 11). By default, with the captions.
   */
  example?: boolean;
  /** A problem that just arrived: its row's connectors draw again in its tone (7.6). */
  arrival: { node: string; n: number } | null;
  showTraceTip: boolean;
  /** A tip for the map's header in place of the built-in trace tip (the guidance prototype's own). */
  tip?: ReactNode;
  /** The start of the map's element ids, for a page with two maps; "dm" by default. */
  idPrefix?: string;
  onTraced: () => void;
  onDismissTip: () => void;
  /** What the first steps already offer on this screen, so the map does not offer it again. */
  stepActions: readonly string[];
  retrying: readonly LaneId[];
  onRetry: (lane: LaneId) => void;
  onNote: (text: string) => void;
}

export function SystemMap(props: SystemMapProps) {
  const {
    nas,
    view,
    layout,
    loading,
    accent,
    assemble,
    captions,
    example = captions.length > 0,
    arrival,
    showTraceTip,
    onTraced,
    onDismissTip,
    stepActions,
    onNote,
    idPrefix: ids = "dm",
  } = props;
  const [hot, setHot] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const elementsRef = useRef(new Map<string, HTMLElement>());
  // The rows there when the map was first drawn: one that appears later (storage just added)
  // solidifies in (7.2).
  const [firstRows] = useState(() => new Set(view.rows.map((r) => r.id)));

  // While loading there is no unused row yet, so the footer keeps "Add storage".
  const { footer, ghostAdds } = mapActions(
    loading ? { ...view, rows: [] } : view,
    stepActions,
  );
  const storageFailed = nas.failed.includes("storage");
  const grid = useMemo(
    () =>
      loading || storageFailed
        ? []
        : view.rows.map((r) => rowKeys(r, ghostAdds)),
    [view.rows, loading, storageFailed, ghostAdds],
  );
  const flat = grid.flat(2);
  const current =
    active !== null && flat.includes(active) ? active : (flat[0] ?? null);
  const trace = useMemo(
    () => (hot === null ? null : traceOf(view, hot)),
    [hot, view],
  );
  const arrivalRow =
    arrival === null
      ? undefined
      : view.rows.find(
          (r) =>
            r.kind === "storage" &&
            (r.storage.id === arrival.node ||
              r.disks.some((d) => d.id === arrival.node)),
        )?.id;

  const register = useCallback((key: string, el: HTMLElement | null) => {
    if (el) {
      elementsRef.current.set(key, el);
    } else {
      elementsRef.current.delete(key);
    }
  }, []);
  const onTrace = useCallback(
    (key: string | null) => {
      setHot(key);
      if (key !== null) {
        if (flat.includes(key)) {
          setActive(key);
        }
        onTraced();
      }
    },
    [flat, onTraced],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
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

  const ctx: MapCtx = { trace, current, onTrace, register, onNote, ids };

  const columns = (["disks", "storage", "folders"] as const).map((lane) => {
    const meta = LANES.find((l) => l.id === lane);
    return (
      <span key={lane} className="dm-col" data-col={lane}>
        <h3 className="dm-col-title">{meta?.title}</h3>
        {captions.includes(lane) ? (
          <span className="dm-caption">{meta?.caption}</span>
        ) : null}
      </span>
    );
  });

  const failedLanes = nas.failed.filter(
    (l) => l === "disks" || l === "folders",
  );

  return (
    <MapContext value={ctx}>
      <section
        className="dm-map"
        data-layout={layout}
        data-assemble={assemble}
        data-tracing={trace ? "" : undefined}
        aria-labelledby={`${ids}-map-title`}
        aria-busy={loading || undefined}
        style={{ "--rows": view.rows.length } as CSSProperties}
      >
        <header className="dm-map-head">
          <h2 id={`${ids}-map-title`} className="dm-region-title">
            Your NAS
          </h2>
          {props.tip ??
            (showTraceTip && layout !== "narrow" ? (
              <Tip onDismiss={onDismissTip}>
                Point at a shared folder or a way in to see what it reaches.
              </Tip>
            ) : null)}
        </header>

        {failedLanes.map((lane) => (
          <LaneError
            key={lane}
            lane={lane === "disks" ? "disks" : "shared folders"}
            retrying={props.retrying.includes(lane)}
            onRetry={() => {
              props.onRetry(lane);
            }}
          />
        ))}

        <div className="dm-body">
          <div className="dm-grid">
            <div
              className="dm-cols"
              data-captions={
                captions.some(
                  (l) => l === "disks" || l === "storage" || l === "folders",
                ) || undefined
              }
            >
              <span className="dm-edge" />
              {columns}
            </div>
            {storageFailed ? (
              <LaneError
                lane="storage"
                retrying={props.retrying.includes("storage")}
                onRetry={() => {
                  props.onRetry("storage");
                }}
              />
            ) : (
              <ul
                id={`${ids}-rows`}
                tabIndex={-1}
                className="dm-rows"
                aria-label="Your storage, a row each"
                aria-describedby={`${ids}-map-keys`}
                onKeyDown={onKeyDown}
              >
                {loading ? (
                  <SkeletonRows />
                ) : (
                  view.rows.map((row, index) => {
                    const common = {
                      index,
                      fresh: !firstRows.has(row.id),
                      arrival: row.id === arrivalRow ? arrival?.n : undefined,
                    };
                    switch (row.kind) {
                      case "storage":
                        return (
                          <StorageRowView
                            key={row.id}
                            row={row}
                            failed={nas.failed}
                            {...common}
                          />
                        );
                      case "unused":
                        return (
                          <UnusedRowView
                            key={row.id}
                            row={row}
                            ghostAdds={ghostAdds}
                            accent={accent === "add-storage"}
                            failed={nas.failed.includes("disks")}
                            captions={captions.includes("folders")}
                            {...common}
                          />
                        );
                      case "more":
                        return (
                          <MoreRowView key={row.id} row={row} {...common} />
                        );
                    }
                  })
                )}
                {!loading && nas.newNas && example ? <ExampleRow /> : null}
              </ul>
            )}
            <p id={`${ids}-map-keys`} className="sr-only">
              Use the arrow keys to move along a row and between rows.
            </p>
          </div>

          {loading ? null : (
            <Band
              view={view}
              failed={nas.failed}
              captions={captions}
              retrying={props.retrying}
              onRetry={props.onRetry}
            />
          )}
        </div>

        {footer.length > 0 ? (
          <footer className="dm-map-foot">
            {footer.map((action) => {
              const filled =
                action === "Add a shared folder" && accent === "folders-lane";
              return (
                <Button
                  key={action}
                  variant={filled ? "primary" : "ghost"}
                  size="sm"
                  className={filled ? undefined : "dm-map-action"}
                  onClick={() => {
                    onNote(`${action} opens its page.`);
                  }}
                >
                  {ACTION_ICON[action] ?? null}
                  {action}
                </Button>
              );
            })}
          </footer>
        ) : null}
      </section>
    </MapContext>
  );
}
