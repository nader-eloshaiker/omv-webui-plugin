// SPDX-License-Identifier: GPL-3.0-or-later
// Region C, "Your NAS" (rethink spec 6.8): the NAS read by rows, not lines. Each storage is one row,
// left to right its disks, a short straight connector, the storage with its usage bar, another
// connector and its shared folders as wrapping chips that carry the ways they are reached by. What
// hangs together sits on one row, so a problem flows right along its row and nowhere else; a 3px
// tone bar at the row's start finds it from across the room. Unused disks end in "Add storage".
// Under the rows, one band: the ways in that are on, fanning into the network through one bus.
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
import { ArrowRight, House, RotateCw } from "lucide-react";
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
  rowKeys,
  rowName,
  stripKey,
  traceOf,
  wayKey,
  wayName,
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

function Slot({ rowId, disk }: { rowId: string; disk: RowDisk }) {
  const ctx = useMapCtx();
  const item = useItem(diskKey(rowId, disk.id), rowId);
  return (
    <SlotTile
      disk={disk}
      alsoIn={disk.alsoIn}
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

/** The row's disks: full slots, then the strip when there are more than six. */
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
        Not read
      </span>
    );
  }
  if (row.disks.length === 0) {
    return <span className="dm-bay dm-bay-none">No disk</span>;
  }
  return (
    <span className="dm-bay" data-strip={row.bay.strip.length > 0 || undefined}>
      {row.bay.full.map((d, i) => (
        <span
          key={d.id}
          className="dm-slot-wrap"
          style={{ "--i": i } as CSSProperties}
        >
          <Slot rowId={row.id} disk={d} />
        </span>
      ))}
      {row.bay.strip.length > 0 ? <Strip rowId={row.id} row={row} /> : null}
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
  // A disk in trouble puts the storage at risk; its own problem is said by the meter's pill.
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
        valueText={`${percent(s.used)} · ${s.free} free`}
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
  return (
    <button
      {...item}
      type="button"
      className="dm-folder"
      data-health={state?.health}
      style={{ "--i": index } as CSSProperties}
      aria-label={`${folder.name}: ${via.length > 0 ? listWords(via) : "not shared"}${state ? `, ${state.word.toLowerCase()}` : ""}`}
      onClick={() => {
        ctx.onNote(`Opens the shared folder ${folder.name}.`);
      }}
    >
      <Icon name="shared-folder" size={16} motion="none" />
      <span className="dm-folder-name">
        <bdi>{folder.name}</bdi>
      </span>
      {folder.via.length === 0 ? (
        <span className="dm-folder-none">Not shared</span>
      ) : (
        <span className="dm-folder-via">
          {folder.via.map((w) => (
            <span key={w} title={WAY_SHORT[w]} className="dm-folder-way">
              <Icon name={WAY_ICON[w]} size={16} motion="none" />
            </span>
          ))}
        </span>
      )}
      {state ? (
        <span className="dm-state" data-health={state.health}>
          <StatusIcon status={state.health} />
          {state.word}
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
      +{moreWords(row.folders.hidden)}
      <ArrowRight aria-hidden="true" />
    </button>
  );
}

function Folders({ row, failed }: { row: StorageRow; failed: boolean }) {
  if (failed) {
    return (
      <span className="dm-quiet-line">
        <StatusIcon status="unknown" />
        Not read
      </span>
    );
  }
  if (row.folders.shown.length === 0) {
    return (
      <span className="dm-quiet-line">
        {row.system ? "Holds the system" : "No shared folders"}
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
      <span className="dm-edge" aria-hidden="true" />
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
  const devices = listWords(row.disks.map((d) => d.device));
  const verb = row.disks.length === 1 ? "is" : "are";
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
          <span className="dm-ghost-words">
            <span className="dm-ghost-title">
              {ghostAdds ? "Not in use yet" : "New storage goes here"}
            </span>
            <span className="dm-ghost-line">
              {devices} {verb} ready to become storage
            </span>
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
          <span className="dm-quiet-line">Shared folders live on storage.</span>
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
  const allOk = row.hidden.every((r) => r.tone === null);
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
        <span className="dm-quiet-line">{plural(disks, "disk", "disks")}</span>
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
          {allOk ? <StatusIcon status="ok" /> : null}+
          {moreWords(row.hidden.map((r) => ({ health: r.tone ?? "ok" })))}
          <ArrowRight aria-hidden="true" />
        </button>
      </span>
      <span className="dm-cell dm-cell-folders">
        <span className="dm-quiet-line">
          {listWords(names)} ·{" "}
          {plural(folders, "shared folder", "shared folders")}
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

function wayLine(w: MapWay): string {
  if (!w.running) {
    return "On · Not running";
  }
  return w.connections
    ? `On · ${plural(w.connections, "computer", "computers")} connected`
    : "On · Running";
}

function WayTile({
  way,
  ifaces,
}: {
  way: MapWay;
  ifaces: readonly MapIface[];
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
        <span className="dm-wt-words">
          <span className="dm-wt-name">
            {way.name} <span className="dm-wt-tech">{way.tech}</span>
          </span>
          <span className="dm-wt-line">
            {way.running ? null : <StatusIcon status="warning" />}
            {wayLine(way)}
          </span>
        </span>
      </button>
    </li>
  );
}

function IfaceTile({ iface, rate }: { iface: MapIface; rate: string | null }) {
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
        <span className="dm-wt-words">
          <span className="dm-wt-name">
            <span className="dm-mono">{iface.name}</span>{" "}
            <span className="dm-wt-tech">{iface.speed}</span>
          </span>
          <span className="dm-wt-line">
            {iface.up ? (
              <span className="dm-mono">{iface.address}</span>
            ) : (
              <>
                <StatusIcon status="critical" />
                No link
              </>
            )}
          </span>
          {rate ? <span className="dm-wt-line dm-num">{rate}</span> : null}
        </span>
      </button>
    </li>
  );
}

function Band({
  view,
  failed,
  rate,
  captions,
  retrying,
  onRetry,
}: {
  view: MapView;
  failed: readonly LaneId[];
  rate: string | null;
  captions: readonly LaneId[];
  retrying: readonly LaneId[];
  onRetry: (lane: LaneId) => void;
}) {
  const ctx = useMapCtx();
  const lit = ctx.trace !== null && ctx.trace.ways.size > 0;
  const waysFailed = failed.includes("ways");
  const netFailed = failed.includes("network");
  return (
    <div
      className="dm-band"
      data-tracing={ctx.trace ? "" : undefined}
      data-lit={lit || undefined}
    >
      <div className="dm-band-head" data-part="ways">
        <h3 id="dm-band-ways-title" className="dm-col-title">
          Ways in
        </h3>
        {captions.includes("ways") ? (
          <p className="dm-caption">{LANES[3]?.caption}</p>
        ) : null}
      </div>
      <div className="dm-band-head" data-part="net">
        <h3 id="dm-band-net-title" className="dm-col-title">
          Network
        </h3>
        {captions.includes("network") ? (
          <p className="dm-caption">{LANES[4]?.caption}</p>
        ) : null}
      </div>
      <div
        id="dm-band-ways"
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
          <ul className="dm-ways" aria-labelledby="dm-band-ways-title">
            {view.ways.on.map((w) => (
              <WayTile key={w.id} way={w} ifaces={view.ifaces} />
            ))}
          </ul>
        ) : (
          <p className="dm-quiet-line">No way in is on yet.</p>
        )}
      </div>
      {view.ways.off && !waysFailed ? (
        <p className="dm-off">{view.ways.off}</p>
      ) : null}
      <span className="dm-bus" data-part="in" aria-hidden="true" />
      <div
        id="dm-band-net"
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
          <ul className="dm-ifaces" aria-labelledby="dm-band-net-title">
            {view.ifaces.map((n, i) => (
              <IfaceTile key={n.id} iface={n} rate={i === 0 ? rate : null} />
            ))}
          </ul>
        )}
      </div>
      <span className="dm-bus" data-part="out" aria-hidden="true" />
      <div className="dm-world" data-trace={lit ? "lit" : undefined}>
        <House aria-hidden="true" />
        <span className="dm-wt-words">
          <span className="dm-wt-name">Your network</span>
          <span className="dm-wt-line">Computers, phones and TVs</span>
        </span>
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
  /** A problem that just arrived: its row's connectors draw again in its tone (7.6). */
  arrival: { node: string; n: number } | null;
  showTraceTip: boolean;
  onTraced: () => void;
  onDismissTip: () => void;
  /** What the first steps already offer on this screen, so the map does not offer it again. */
  stepActions: readonly string[];
  retrying: readonly LaneId[];
  onRetry: (lane: LaneId) => void;
  onNote: (text: string) => void;
  /** The first interface's live rate, in words. */
  rate: string | null;
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
    arrival,
    showTraceTip,
    onTraced,
    onDismissTip,
    stepActions,
    onNote,
  } = props;
  const [hot, setHot] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const elementsRef = useRef(new Map<string, HTMLElement>());
  // The rows there when the map was first drawn: one that appears later (a ghost becoming real)
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

  const ctx: MapCtx = { trace, current, onTrace, register, onNote };

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
        aria-labelledby="dm-map-title"
        aria-busy={loading || undefined}
        style={{ "--rows": view.rows.length } as CSSProperties}
      >
        <header className="dm-map-head">
          <h2 id="dm-map-title" className="dm-region-title">
            <Icon name="nas" size={24} motion="none" />
            Your NAS
          </h2>
          {loading ? null : (
            <p className="dm-map-meta">
              <span className="dm-mono">{nas.facts.name}</span>
              {" · "}
              {plural(nas.disks.length, "disk", "disks")}
              {" · "}
              {plural(nas.storage.length, "storage", "storage")}
              {" · "}
              {plural(nas.folders.length, "shared folder", "shared folders")}
            </p>
          )}
          {showTraceTip && layout !== "narrow" ? (
            <Tip onDismiss={onDismissTip}>
              Point at a shared folder or a way in to see what it reaches.
            </Tip>
          ) : null}
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
                id="dm-rows"
                tabIndex={-1}
                className="dm-rows"
                aria-label="Your storage, a row each"
                aria-describedby="dm-map-keys"
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
                {!loading && nas.newNas && captions.length > 0 ? (
                  <ExampleRow />
                ) : null}
              </ul>
            )}
            <p id="dm-map-keys" className="sr-only">
              Use the arrow keys to move along a row and between rows.
            </p>
          </div>

          {loading ? null : (
            <Band
              view={view}
              failed={nas.failed}
              rate={props.rate}
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
                  {ACTION_ICON[action] ? null : (
                    <ArrowRight aria-hidden="true" />
                  )}
                </Button>
              );
            })}
          </footer>
        ) : null}
      </section>
    </MapContext>
  );
}
