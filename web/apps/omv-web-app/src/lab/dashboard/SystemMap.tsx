// SPDX-License-Identifier: GPL-3.0-or-later
// Region C, "Your NAS" (rethink spec 6.2 C, 6.3, 6.4, 7.6): the map in five lanes, Disks to
// Storage to Shared folders to Ways in to Network, with lines for what feeds what. A problem lights
// what it puts at risk; pointing at or focusing a node traces its lineage (the library's `lineage`)
// and dims the rest. Each lane ends in its action on a shared baseline (a subgrid row), so lanes of
// different heights end together. At 900 three lanes keep their lines and Ways in becomes a row of
// tiles; at 390 each lane is a disclosure row that says in words what it feeds.
//
// Lab-local until the owner has seen it: the candidate *SystemMap of spec 8 row 1, an extension of
// ConnectionMap (its model is reused as is). Development only (UI-11). Lines are SVG paths measured
// from the DOM; motion runs through CSS keyframes and the Web Animations API, never a style
// attribute in markup (UI-1).
import type { IconName } from "@omv-webui/react-ui-components";
import {
  Button,
  CapacityMeter,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  Icon,
  lineage,
  mapEdges,
  moveOnMap,
  Skeleton,
  StatusIcon,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { ArrowRight, RotateCw } from "lucide-react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Tip } from "../forms/parts.tsx";
import { reducedMotion, token } from "../tables/grid.ts";
import { BayStrip, SlotTile } from "./Bay.tsx";
import type {
  AccentAt,
  AreaState,
  Health,
  LaneId,
  Layout,
  MapFolder,
  MapIface,
  MapStorage,
  MapView,
  MapWay,
  Nas,
} from "./model.ts";
import {
  feedsWords,
  HEALTH_WORD,
  laneOfId,
  LANES,
  laneSummary,
  MORE_ID,
  moreWords,
  percent,
  plural,
  riskDepth,
  riskTones,
  wayNode,
} from "./model.ts";

export type Assemble = "full" | "fade" | "none";

const LANE_ICON: Record<LaneId, IconName> = {
  disks: "disk",
  storage: "file-system",
  folders: "shared-folder",
  ways: "service-smb",
  network: "net-ethernet",
};

const WAY_ICON: Record<MapWay["id"], IconName> = {
  smb: "service-smb",
  nfs: "service-nfs",
  rsync: "service-rsync",
  ssh: "service-ssh",
};

const STORAGE_ICON: Record<MapStorage["kind"], IconName> = {
  fs: "file-system",
  raid: "raid-array",
  zfs: "zfs-pool",
};

interface MapCtx {
  traced: Set<string> | null;
  risk: Map<string, "warning" | "critical">;
  current: string | null;
  /** Nodes that were not on the map when it was first drawn: a ghost that became real (7.2). */
  fresh: (id: string) => boolean;
  onTrace: (id: string | null) => void;
  register: (id: string, el: HTMLElement | null) => void;
  onNote: (text: string) => void;
}

const MapContext = createContext<MapCtx | null>(null);

function useMap(): MapCtx {
  const ctx = use(MapContext);
  if (!ctx) {
    throw new Error("A map node outside the map.");
  }
  return ctx;
}

function traceOf(ctx: MapCtx, id: string): "lit" | "dim" | undefined {
  if (!ctx.traced) {
    return undefined;
  }
  return ctx.traced.has(id) ? "lit" : "dim";
}

// ─── Nodes ────────────────────────────────────────────────────────────────────────────────────

/** A node of the map: a box whose name is its one tab stop; what it holds sits under the name. */
function MapNode({
  id,
  icon,
  name,
  tech,
  health = "ok",
  word,
  stateBelow = false,
  onOpen,
  children,
  index,
}: {
  id: string;
  icon: IconName;
  name: string;
  tech?: string;
  health?: Health;
  word?: string;
  /** The state is said in the node's body (a meter's pill), so the name line leaves it out. */
  stateBelow?: boolean;
  onOpen: string;
  children?: ReactNode;
  index: number;
}) {
  const ctx = useMap();
  const risk = ctx.risk.get(id);
  const own = health === "warning" || health === "critical";
  return (
    <div
      ref={(el) => {
        ctx.register(id, el);
      }}
      className="dm-node"
      data-node={id}
      data-health={health}
      data-risk={risk}
      data-trace={traceOf(ctx, id)}
      data-arrived={ctx.fresh(id) || undefined}
      style={{ "--i": index } as CSSProperties}
      onPointerEnter={() => {
        ctx.onTrace(id);
      }}
      onPointerLeave={() => {
        ctx.onTrace(null);
      }}
    >
      <button
        type="button"
        className="dm-node-main"
        data-focus-node={id}
        tabIndex={ctx.current === id ? 0 : -1}
        onFocus={() => {
          ctx.onTrace(id);
        }}
        onBlur={() => {
          ctx.onTrace(null);
        }}
        onClick={() => {
          ctx.onNote(onOpen);
        }}
      >
        <Icon name={icon} size={20} motion="none" className="dm-node-icon" />
        <span className="dm-node-words">
          <span className="dm-node-name">
            <bdi>{name}</bdi>
          </span>
          {tech ? <span className="dm-node-tech">{tech}</span> : null}
        </span>
        {stateBelow && own ? null : health !== "ok" ? (
          <span key={health} className="dm-node-state" data-health={health}>
            <StatusIcon status={health} />
            {word ?? HEALTH_WORD[health]}
          </span>
        ) : risk && !own ? (
          <span className="dm-node-state" data-health={risk}>
            <StatusIcon status={risk} />
            At risk
          </span>
        ) : null}
      </button>
      {children ? <div className="dm-node-body">{children}</div> : null}
    </div>
  );
}

/** "+3 more, all OK": the rest of a capped lane, a link to the full page, filtered (6.4). */
function MoreNode({
  id,
  hidden,
  page,
  index,
}: {
  id: string;
  hidden: readonly { health: Health }[];
  page: string;
  index: number;
}) {
  const ctx = useMap();
  const allOk = hidden.every((h) => h.health === "ok");
  return (
    <div
      ref={(el) => {
        ctx.register(id, el);
      }}
      className="dm-more"
      data-node={id}
      data-trace={traceOf(ctx, id)}
      style={{ "--i": index } as CSSProperties}
      onPointerEnter={() => {
        ctx.onTrace(id);
      }}
      onPointerLeave={() => {
        ctx.onTrace(null);
      }}
    >
      <button
        type="button"
        className="dm-more-main"
        data-focus-node={id}
        tabIndex={ctx.current === id ? 0 : -1}
        onFocus={() => {
          ctx.onTrace(id);
        }}
        onBlur={() => {
          ctx.onTrace(null);
        }}
        onClick={() => {
          ctx.onNote(`Opens ${page}.`);
        }}
      >
        {allOk ? <StatusIcon status="ok" /> : null}+{moreWords(hidden)}
      </button>
    </div>
  );
}

/** A ghost of what will appear here (7.3): dashed, "Example", hidden from assistive technology. */
function Ghost({ icon, words }: { icon: IconName; words: string }) {
  return (
    <div className="dm-ghost" aria-hidden="true">
      <Icon name={icon} size={20} motion="none" />
      <span className="dm-ghost-words">{words}</span>
      <span className="dm-ghost-tag">Example</span>
    </div>
  );
}

function StorageNode({ s, index }: { s: MapStorage; index: number }) {
  const threshold =
    s.health === "warning" || s.health === "critical"
      ? { status: s.health, label: s.word }
      : undefined;
  return (
    <MapNode
      id={s.id}
      icon={STORAGE_ICON[s.kind]}
      name={s.name}
      tech={s.tech}
      health={s.health}
      word={s.word}
      stateBelow
      onOpen={`Opens ${s.name}.`}
      index={index}
    >
      <CapacityMeter
        variant="compact"
        label={`${s.name}: space used`}
        value={s.used}
        max={1}
        valueText={`${percent(s.used)} · ${s.free} free`}
        threshold={threshold}
        className="dm-usage"
      />
    </MapNode>
  );
}

function FolderNode({ f, index }: { f: MapFolder; index: number }) {
  return (
    <MapNode
      id={f.id}
      icon="shared-folder"
      name={f.name}
      health={f.health}
      word={f.word}
      onOpen={`Opens the shared folder ${f.name}.`}
      index={index}
    >
      <span className="dm-via">
        {f.via.length === 0 ? (
          <span className="dm-quiet">Not shared</span>
        ) : (
          f.via.map((w) => (
            <span key={w} className="dm-via-item">
              <Icon name={WAY_ICON[w]} size={16} motion="none" />
              {w === "smb" ? "Windows and Mac" : w === "nfs" ? "Linux" : w}
            </span>
          ))
        )}
      </span>
    </MapNode>
  );
}

function wayLine(w: MapWay): string {
  if (!w.running) {
    return "On · Not running";
  }
  return w.connections === null || w.connections === 0
    ? "On · Running"
    : `On · ${plural(w.connections, "computer", "computers")} connected`;
}

function WayNode({ w, index }: { w: MapWay; index: number }) {
  return (
    <MapNode
      id={wayNode(w.id)}
      icon={WAY_ICON[w.id]}
      name={w.name}
      tech={w.tech}
      health={w.running ? "ok" : "warning"}
      word={w.running ? undefined : "Not running"}
      onOpen={`Opens ${w.name} sharing (${w.tech}).`}
      index={index}
    >
      <span className="dm-line2">{wayLine(w)}</span>
    </MapNode>
  );
}

function IfaceNode({
  n,
  index,
  rate,
}: {
  n: MapIface;
  index: number;
  rate: string | null;
}) {
  return (
    <MapNode
      id={n.id}
      icon={n.kind}
      name={n.name}
      health={n.up ? "ok" : "critical"}
      word={n.up ? undefined : "No link"}
      onOpen={`Opens interface ${n.name}.`}
      index={index}
    >
      <span className="dm-line2">
        {n.speed} · <span className="dm-mono">{n.address}</span>
      </span>
      {rate ? <span className="dm-line2 dm-num">{rate}</span> : null}
    </MapNode>
  );
}

// ─── Lane contents ────────────────────────────────────────────────────────────────────────────

function LaneError({
  lane,
  message,
  retrying,
  onRetry,
}: {
  lane: string;
  message: string;
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
      <p className="dm-lane-error-message">{message}</p>
      <Button variant="neutral" size="sm" disabled={retrying} onClick={onRetry}>
        <RotateCw aria-hidden="true" />
        {retrying ? "Reading…" : "Try again"}
      </Button>
    </div>
  );
}

function LaneSkeleton({ lane }: { lane: LaneId }) {
  if (lane === "disks") {
    return (
      <div className="dm-bay" aria-hidden="true">
        <div className="dm-slots">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="dm-slot-skeleton" />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="dm-lane-skeleton" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} shape="block" className="dm-node-skeleton" />
      ))}
    </div>
  );
}

interface LaneProps {
  nas: Nas;
  view: MapView;
  tips: boolean;
  rate: string | null;
}

function DisksBody({ view }: LaneProps) {
  const ctx = useMap();
  const { full, strip } = view.bay;
  return (
    <div className="dm-bay" data-line-edge="">
      {full.length > 0 ? (
        <div className="dm-slots">
          {full.map((d, i) => (
            <span
              key={d.id}
              className="dm-slot-wrap"
              style={{ "--i": i } as CSSProperties}
            >
              <SlotTile
                disk={d}
                risk={ctx.risk.get(d.id)}
                trace={traceOf(ctx, d.id)}
                tabbable={ctx.current === d.id}
                onTrace={ctx.onTrace}
                onOpen={ctx.onNote}
                register={ctx.register}
              />
            </span>
          ))}
        </div>
      ) : null}
      {strip.length > 0 ? (
        <BayStrip
          disks={strip}
          hasFull={full.length > 0}
          trace={traceOf(ctx, "strip:disks")}
          tabbable={ctx.current === "strip:disks"}
          onTrace={ctx.onTrace}
          onOpen={ctx.onNote}
          register={ctx.register}
        />
      ) : null}
    </div>
  );
}

function StorageBody({ nas, view, tips }: LaneProps) {
  // Only the system drive: nothing is ready to keep files yet.
  const empty = !nas.storage.some((s) => s.id !== "s:system");
  return (
    <>
      {view.storage.shown.map((s, i) => (
        <StorageNode key={s.id} s={s} index={i} />
      ))}
      {view.storage.hidden.length > 0 ? (
        <MoreNode
          id={MORE_ID.storage}
          hidden={view.storage.hidden}
          page="File systems, every drive"
          index={view.storage.shown.length}
        />
      ) : null}
      {empty ? (
        tips ? (
          <>
            <Ghost icon="file-system" words="Your storage will appear here" />
            <p className="sr-only">No storage for files yet.</p>
          </>
        ) : (
          <p className="dm-empty">No storage for files yet.</p>
        )
      ) : null}
    </>
  );
}

function FoldersBody({ nas, view, tips }: LaneProps) {
  if (nas.folders.length === 0) {
    return tips ? (
      <>
        <Ghost
          icon="shared-folder"
          words="Your first shared folder will appear here"
        />
        <p className="dm-empty">
          No shared folders yet. A shared folder is a folder your computers open
          over the network, for example Photos for the whole family.
        </p>
      </>
    ) : (
      <p className="dm-empty">No shared folders yet.</p>
    );
  }
  return (
    <>
      {view.folders.shown.map((f, i) => (
        <FolderNode key={f.id} f={f} index={i} />
      ))}
      {view.folders.hidden.length > 0 ? (
        <MoreNode
          id={MORE_ID.folders}
          hidden={view.folders.hidden}
          page="Shared folders, all of them"
          index={view.folders.shown.length}
        />
      ) : null}
    </>
  );
}

function WaysBody({ view }: LaneProps) {
  return (
    <>
      {view.ways.on.map((w, i) => (
        <WayNode key={w.id} w={w} index={i} />
      ))}
      {view.ways.off ? <p className="dm-off">{view.ways.off}</p> : null}
    </>
  );
}

function NetworkBody({ view, rate }: LaneProps) {
  return (
    <>
      {view.ifaces.shown.map((n, i) => (
        <IfaceNode key={n.id} n={n} index={i} rate={i === 0 ? rate : null} />
      ))}
    </>
  );
}

const BODY: Record<LaneId, (props: LaneProps) => ReactNode> = {
  disks: DisksBody,
  storage: StorageBody,
  folders: FoldersBody,
  ways: WaysBody,
  network: NetworkBody,
};

function NarrowBody({ lane, ...props }: LaneProps & { lane: LaneId }) {
  const Body = BODY[lane];
  return <Body {...props} />;
}

// ─── The map ──────────────────────────────────────────────────────────────────────────────────

interface DrawnEdge {
  key: string;
  from: string;
  to: string;
  d: string;
  tone: "ok" | "warning" | "critical" | "unknown";
}

export interface SystemMapProps {
  nas: Nas;
  view: MapView;
  areas: readonly AreaState[];
  layout: Layout;
  tips: boolean;
  compact: boolean;
  loading: boolean;
  accent: AccentAt;
  assemble: Assemble;
  /** A problem that just arrived: its lineage lights once from the node outward (7.6). */
  arrival: { node: string; n: number } | null;
  showTraceTip: boolean;
  onTraced: () => void;
  onDismissTip: () => void;
  retrying: readonly LaneId[];
  onRetry: (lane: LaneId) => void;
  onNote: (text: string) => void;
  /** The first interface's live rate, in words, for the Network lane. */
  rate: string | null;
}

const LANE_ERROR: Record<LaneId, string> = {
  disks: "The request timed out after 10 seconds.",
  storage: "",
  folders: "",
  ways: "",
  network: "",
};

export function SystemMap(props: SystemMapProps) {
  const {
    nas,
    view,
    layout,
    tips,
    loading,
    accent,
    assemble,
    arrival,
    showTraceTip,
    onTraced,
    onDismissTip,
    onNote,
  } = props;
  const [hot, setHot] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [edges, setEdges] = useState<DrawnEdge[]>([]);
  const elementsRef = useRef(new Map<string, HTMLElement>());
  const gridRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const seenEdgesRef = useRef<Set<string> | null>(null);
  const playedRef = useRef(0);
  const [firstIds] = useState(() => new Set(view.nodes.map((n) => n.id)));

  const lanes = useMemo<LaneId[]>(
    () =>
      layout === "wide"
        ? ["disks", "storage", "folders", "ways", "network"]
        : ["disks", "storage", "folders"],
    [layout],
  );

  const traced = useMemo(
    () => (hot === null ? null : lineage(view.nodes, hot)),
    [hot, view.nodes],
  );
  const risk = useMemo(() => riskTones(view.nodes), [view.nodes]);
  const order = useMemo(
    () =>
      lanes.map((lane) =>
        loading || nas.failed.includes(lane)
          ? []
          : view.nodes.map((n) => n.id).filter((id) => laneOfId(id) === lane),
      ),
    [view.nodes, lanes, loading, nas.failed],
  );
  const flat = order.flat();
  const current =
    active !== null && flat.includes(active) ? active : (flat[0] ?? null);

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      elementsRef.current.set(id, el);
    } else {
      elementsRef.current.delete(id);
    }
  }, []);
  const onTrace = useCallback(
    (id: string | null) => {
      setHot(id);
      if (id !== null) {
        setActive(id);
        onTraced();
      }
    },
    [onTraced],
  );

  // The lines, measured from the nodes: from the right edge of a node (or the bay) to the left
  // edge of the node it feeds, through the gutter between the lanes.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || layout === "narrow" || loading) {
      setEdges([]);
      return;
    }
    const measure = () => {
      const origin = grid.getBoundingClientRect();
      const drawn: DrawnEdge[] = [];
      for (const edge of mapEdges(view.nodes)) {
        if (
          !lanes.includes(laneOfId(edge.from)) ||
          !lanes.includes(laneOfId(edge.to))
        ) {
          continue;
        }
        const a = elementsRef.current.get(edge.from);
        const b = elementsRef.current.get(edge.to);
        if (!a || !b) {
          continue;
        }
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const edgeBox = a.closest("[data-line-edge]")?.getBoundingClientRect();
        const x0 = (edgeBox?.right ?? ra.right) - origin.left;
        const x1 = rb.left - origin.left;
        if (x1 <= x0 + 4) {
          continue;
        }
        const y0 = ra.top + ra.height / 2 - origin.top;
        const y1 = rb.top + Math.min(rb.height / 2, 22) - origin.top;
        const mx = (x0 + x1) / 2;
        drawn.push({
          key: `${edge.from}>${edge.to}`,
          from: edge.from,
          to: edge.to,
          tone: edge.tone,
          d: `M${x0.toFixed(1)} ${y0.toFixed(1)}C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`,
        });
      }
      setEdges(drawn);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => {
      observer.disconnect();
    };
  }, [view.nodes, lanes, layout, loading]);

  // Which lines are new since the last drawing: those draw along their length (a ghost becoming
  // real, a new folder). The first drawing is not news; it is the assembling, or nothing.
  const newEdges = useMemo(() => {
    const seen = seenEdgesRef.current;
    return seen === null
      ? new Set<string>()
      : new Set(edges.map((e) => e.key).filter((k) => !seen.has(k)));
  }, [edges]);
  useEffect(() => {
    if (edges.length > 0) {
      seenEdgesRef.current = new Set(edges.map((e) => e.key));
    }
  }, [edges]);

  // A problem arrives: its lineage lights once, from the node outward (7.6). Reduced motion: it is
  // shown lit without travel.
  useEffect(() => {
    const svg = svgRef.current;
    // Once per arrival, when its lines are drawn.
    if (
      !arrival ||
      !svg ||
      playedRef.current === arrival.n ||
      edges.length === 0
    ) {
      return;
    }
    playedRef.current = arrival.n;
    if (reducedMotion()) {
      return;
    }
    const depth = riskDepth(view.nodes, arrival.node);
    const glide = token("--duration-glide", 640);
    const step = token("--duration-fast", 160);
    for (const path of svg.querySelectorAll<SVGPathElement>(
      "path[data-from]",
    )) {
      const from = path.dataset.from ?? "";
      const to = path.dataset.to ?? "";
      const dFrom = depth.get(from);
      const dTo = depth.get(to);
      if (dFrom === undefined || dTo === undefined) {
        continue;
      }
      // Drawn from the end nearer the trouble.
      const outward = dTo > dFrom;
      path.animate(
        [
          {
            strokeDasharray: "1",
            strokeDashoffset: outward ? 1 : -1,
          },
          { strokeDasharray: "1", strokeDashoffset: 0 },
        ],
        {
          duration: glide / 1.6,
          delay: Math.min(dFrom, dTo) * step,
          easing: "ease-out",
          fill: "backwards",
        },
      );
    }
  }, [arrival, edges, view.nodes]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (current === null) {
      return;
    }
    const target = moveOnMap(order, current, event.key);
    if (target === null) {
      return;
    }
    event.preventDefault();
    setActive(target);
    const el = elementsRef.current.get(target);
    const focusable = el?.matches("button") ? el : el?.querySelector("button");
    focusable?.focus();
  };

  const ctx: MapCtx = {
    traced,
    risk,
    current,
    fresh: (id) => !loading && !firstIds.has(id),
    onTrace,
    register,
    onNote,
  };

  const laneProps: LaneProps = { nas, view, tips, rate: props.rate };
  const laneAction = (lane: LaneId) => {
    const meta = LANES.find((l) => l.id === lane);
    const filled = lane === "folders" && accent === "folders-lane";
    return (
      <Button
        variant={filled ? "primary" : "ghost"}
        size="sm"
        className={filled ? undefined : "dm-lane-action"}
        onClick={() => {
          onNote(`${meta?.action ?? ""} opens its page.`);
        }}
      >
        {lane === "folders" ? (
          <Icon name="shared-folder" mark="create" size={16} />
        ) : lane === "storage" ? (
          <Icon name="file-system" mark="create" size={16} />
        ) : lane === "disks" ? (
          <Icon name="check-health" size={16} />
        ) : null}
        {meta?.action}
        {filled || lane === "disks" || lane === "storage" ? null : (
          <ArrowRight aria-hidden="true" />
        )}
      </Button>
    );
  };

  const head = (
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
          {plural(nas.folders.length, "shared folder", "shared folders")}
        </p>
      )}
      {showTraceTip && layout !== "narrow" ? (
        <Tip onDismiss={onDismissTip}>
          Point at a box on the map to see what it feeds.
        </Tip>
      ) : null}
    </header>
  );

  if (layout === "narrow") {
    return (
      <MapContext value={ctx}>
        <section
          className="dm-map"
          data-layout="narrow"
          data-assemble={assemble}
          aria-labelledby="dm-map-title"
          aria-busy={loading || undefined}
        >
          {head}
          <NarrowLanes
            {...props}
            laneProps={laneProps}
            laneAction={laneAction}
          />
        </section>
      </MapContext>
    );
  }

  return (
    <MapContext value={ctx}>
      <section
        className="dm-map"
        data-layout={layout}
        data-assemble={assemble}
        data-tracing={traced ? "" : undefined}
        aria-labelledby="dm-map-title"
        aria-busy={loading || undefined}
      >
        {head}
        <div
          ref={gridRef}
          className="dm-lanes"
          data-count={lanes.length}
          role="group"
          aria-label="What feeds what, from disks to the network"
          aria-describedby="dm-map-keys"
          onKeyDown={onKeyDown}
        >
          <p id="dm-map-keys" className="sr-only">
            Use the arrow keys to move between the boxes. Each box says what it
            feeds.
          </p>
          <svg ref={svgRef} className="dm-lines" aria-hidden="true">
            {edges.map((edge, i) => {
              const r = risk.get(edge.from) && risk.get(edge.to);
              const tone =
                r &&
                (risk.get(edge.from) === "critical" ||
                  risk.get(edge.to) === "critical")
                  ? "critical"
                  : r
                    ? "warning"
                    : undefined;
              const dashed = edge.tone === "unknown" && !tone;
              const trace = traced
                ? traced.has(edge.from) && traced.has(edge.to)
                  ? "lit"
                  : "dim"
                : undefined;
              return (
                <path
                  key={edge.key}
                  d={edge.d}
                  data-from={edge.from}
                  data-to={edge.to}
                  data-risk={tone}
                  data-trace={trace}
                  data-dashed={dashed || undefined}
                  data-new={newEdges.has(edge.key) || undefined}
                  pathLength={dashed ? undefined : 1}
                  className="dm-line"
                  style={{ "--i": i } as CSSProperties}
                />
              );
            })}
          </svg>
          {lanes.map((lane, li) => {
            const meta = LANES.find((l) => l.id === lane);
            const Body = BODY[lane];
            const failed = nas.failed.includes(lane);
            const summary = laneSummary(nas, lane, props.areas);
            const emptyLane =
              (lane === "folders" && nas.folders.length === 0) ||
              (lane === "storage" && nas.newNas);
            return (
              <div
                key={lane}
                id={`dm-lane-${lane}`}
                className="dm-lane"
                data-lane={lane}
                tabIndex={-1}
                aria-labelledby={`dm-lane-${lane}-title`}
                role="group"
                style={{ "--lane": li } as CSSProperties}
              >
                <div className="dm-lane-head">
                  <h3 id={`dm-lane-${lane}-title`} className="dm-lane-title">
                    {meta?.title}
                  </h3>
                  {summary.health === "ok" ? null : (
                    <span
                      className="dm-lane-state"
                      data-health={summary.health}
                    >
                      <StatusIcon status={summary.health} />
                      {summary.word}
                    </span>
                  )}
                  {tips && (nas.newNas || emptyLane) ? (
                    <p className="dm-caption">{meta?.caption}</p>
                  ) : null}
                </div>
                <div className="dm-lane-body">
                  {loading ? (
                    <LaneSkeleton lane={lane} />
                  ) : failed ? (
                    <LaneError
                      lane={meta?.title.toLowerCase() ?? lane}
                      message={LANE_ERROR[lane]}
                      retrying={props.retrying.includes(lane)}
                      onRetry={() => {
                        props.onRetry(lane);
                      }}
                    />
                  ) : (
                    <Body {...laneProps} />
                  )}
                </div>
                <div className="dm-lane-foot">{laneAction(lane)}</div>
              </div>
            );
          })}
        </div>
        {layout === "mid" && !loading ? (
          <div
            className="dm-ways-row"
            role="group"
            aria-labelledby="dm-ways-title"
          >
            <h3 id="dm-ways-title" className="dm-lane-title">
              Ways in
            </h3>
            <div className="dm-ways-tiles">
              {view.ways.on.map((w, i) => (
                <WayNode key={w.id} w={w} index={i} />
              ))}
            </div>
            {view.ways.off ? <p className="dm-off">{view.ways.off}</p> : null}
            {laneAction("ways")}
          </div>
        ) : null}
      </section>
    </MapContext>
  );
}

// ─── 390: each lane a disclosure row ──────────────────────────────────────────────────────────

function NarrowLanes({
  nas,
  view,
  areas,
  compact,
  loading,
  laneProps,
  laneAction,
  retrying,
  onRetry,
}: SystemMapProps & {
  laneProps: LaneProps;
  laneAction: (lane: LaneId) => ReactNode;
}) {
  const names = new Map<string, string>([
    ...nas.storage.map((s) => [s.id, s.name] as const),
    ...nas.folders.map((f) => [f.id, f.name] as const),
    ...nas.ways.map((w) => [wayNode(w.id), w.name] as const),
  ]);
  return (
    <ul className="dm-rows">
      {LANES.map((meta) => {
        const summary = laneSummary(nas, meta.id, areas);
        const problem =
          summary.health === "warning" || summary.health === "critical";
        const open = compact
          ? problem
          : problem || meta.id === "disks" || meta.id === "storage";
        const failed = nas.failed.includes(meta.id);
        return (
          <li
            key={meta.id}
            id={`dm-lane-${meta.id}`}
            tabIndex={-1}
            className="dm-row"
            data-health={summary.health}
          >
            <Disclosure defaultOpen={open}>
              <DisclosureTrigger className="dm-row-trigger">
                <Icon name={LANE_ICON[meta.id]} size={20} motion="none" />
                <span className="dm-row-title">{meta.title}</span>
                <span className="dm-row-summary">
                  {summary.count}
                  {" · "}
                  {summary.health === "ok" ? (
                    summary.word
                  ) : (
                    <StatusPill status={summary.health}>
                      {summary.word}
                    </StatusPill>
                  )}
                </span>
              </DisclosureTrigger>
              <DisclosurePanel>
                <div className="dm-row-body">
                  {loading ? (
                    <LaneSkeleton lane={meta.id} />
                  ) : failed ? (
                    <LaneError
                      lane={meta.title.toLowerCase()}
                      message={LANE_ERROR[meta.id]}
                      retrying={retrying.includes(meta.id)}
                      onRetry={() => {
                        onRetry(meta.id);
                      }}
                    />
                  ) : meta.id === "storage" ? (
                    <>
                      <StorageBody {...laneProps} />
                      {view.storage.shown.some((s) => s.feeds.length > 0) ? (
                        <p className="dm-feeds">
                          {feedsWords(
                            view.storage.shown.flatMap((s) =>
                              s.feeds.map((id) => names.get(id) ?? ""),
                            ),
                          )}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <NarrowBody lane={meta.id} {...laneProps} />
                  )}
                  {laneAction(meta.id)}
                </div>
              </DisclosurePanel>
            </Disclosure>
          </li>
        );
      })}
    </ul>
  );
}
