// SPDX-License-Identifier: GPL-3.0-or-later
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import { ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { useElementSize } from "../chart-model/use-element-width";
import { StatusIcon } from "../status/status";
import { STATUS_DRAWING, type HealthStatus } from "../status/status-kinds";
import {
  edgeInLineage,
  lineage,
  mapEdges,
  moveOnMap,
  type MapEdge,
} from "./connection-map-model";

interface ConnectionMapNode {
  /** Unique on the map; what `feeds` refers to. */
  id: string;
  /** Its name, as text: "sdb", "data", "Photos", "Windows and Mac". */
  label: string;
  /** One line under the name: "3.6 TiB · 41 °C", "62% full · ext4". */
  detail?: React.ReactNode;
  /** Its state. A node that is not OK shows its icon and word, and its lines take the status colour. */
  status?: HealthStatus;
  /** The state in words: "Warning". Shown for a node that is not OK; read by screen readers for every node. */
  statusLabel?: React.ReactNode;
  /** The ids of the nodes it feeds, in a later column. */
  feeds?: readonly string[];
  /** Not in use (a share that is off): drawn dashed, with dashed lines. */
  off?: boolean;
  /**
   * The node acts: it opens the thing. Only a node with `onSelect`, `href` or `render` looks
   * clickable, with a chevron and a hover state; every other node is plain (it can still be focused
   * to trace it).
   */
  onSelect?: () => void;
  /** The node is a link. */
  href?: string;
  /** The node is the router's link: `<Link to="/storage/shared-folders/$id" params={...} />`. */
  render?: React.ReactElement;
}

interface ConnectionMapColumn {
  id: string;
  /** The column's title: "Disks", "File systems", "Shared folders", "Shared with". */
  title: React.ReactNode;
  nodes: readonly ConnectionMapNode[];
}

interface ConnectionMapProps extends Omit<
  React.ComponentProps<"div">,
  "children" | "aria-label"
> {
  /** What the map shows: "How storage is shared". */
  "aria-label": string;
  /** Columns of things, left to right in the direction things feed one another. */
  columns: readonly ConnectionMapColumn[];
  /**
   * What a node feeds, in words: `(names) => \`Feeds ${names.join(", ")}\``. Shown under each node
   * when the map is narrow and its lines are dropped; read by screen readers at every width.
   */
  feedsLabel: (names: readonly string[]) => string;
  /** How to move, for screen readers: "Use the arrow keys to move between items." */
  keyboardHint?: string;
}

/** Where lines are drawn: a map narrower than this (42rem, the `@2xl` container) stacks its columns. */
const WIDE_PX = 672;

interface DrawnEdge extends MapEdge {
  d: string;
}

const lineClass = cva(
  "fill-none transition-[stroke,stroke-width,opacity] duration-base",
  {
    variants: {
      tone: {
        ok: "stroke-art-line",
        warning: "stroke-warning-stroke",
        critical: "stroke-critical-stroke",
        unknown: "stroke-unknown-stroke",
      },
      trace: {
        none: "",
        // The lineage lights in the brand's path blue; a line in trouble keeps its status colour.
        lit: "stroke-[2.5]",
        dim: "opacity-15",
      },
    },
    compoundVariants: [
      { tone: "ok", trace: "lit", className: "stroke-art-path" },
    ],
    defaultVariants: { trace: "none" },
  },
);

const nodeClass = cva(
  "relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 " +
    "rounded-control border px-3 py-2 text-start text-sm " +
    "transition-[opacity,border-color,background-color,translate] duration-base ease-standard " +
    "data-[trace=dim]:opacity-40 data-[trace=lit]:border-art-path " +
    "motion-safe:data-[trace=lit]:translate-x-0.5",
  {
    variants: {
      tone: {
        ok: "border-border bg-surface",
        warning: "border-warning-stroke bg-warning-wash",
        critical: "border-critical-stroke bg-critical-wash",
        unknown: "border-unknown-stroke bg-unknown-wash",
      },
      acting: {
        // Something that opens looks it at rest: a resting shadow and a chevron; its hover answers.
        true: "cursor-pointer shadow-control hover:border-border-control hover:bg-muted-strong",
        false: "cursor-default",
      },
      off: { true: "border-dashed bg-transparent", false: "" },
    },
    defaultVariants: { acting: false, off: false },
  },
);

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

type Tone = "ok" | "warning" | "critical" | "unknown";
const toneOf = (status: HealthStatus | undefined): Tone =>
  STATUS_DRAWING[status ?? "ok"].tone as Tone;

interface NodeItemProps {
  node: ConnectionMapNode;
  feeds: string;
  trace: "lit" | "dim" | undefined;
  tabbable: boolean;
  register: (id: string, element: HTMLElement | null) => void;
  onTrace: (id: string | null) => void;
  index: number;
}

function MapNodeItem({
  node,
  feeds,
  trace,
  tabbable,
  register,
  onTrace,
  index,
}: NodeItemProps) {
  const tone = toneOf(node.status);
  const acting = Boolean(node.onSelect ?? node.href ?? node.render);
  const children = (
    <>
      <StatusIcon
        status={node.status ?? "ok"}
        className={wordClass({ tone })}
      />
      <span
        className={cn(
          "min-w-0 truncate font-semibold",
          node.off ? "font-medium text-muted-foreground" : "text-foreground",
        )}
      >
        {node.label}
      </span>
      {acting ? (
        <ChevronRight
          aria-hidden="true"
          className="size-4 text-tertiary-foreground rtl:-scale-x-100"
        />
      ) : (
        <span />
      )}
      <span className="col-start-2 col-end-4 flex min-w-0 flex-wrap gap-x-1.5 text-caption text-tertiary-foreground">
        {node.statusLabel ? (
          <span className={cn(tone === "ok" && "sr-only", wordClass({ tone }))}>
            {node.statusLabel}
          </span>
        ) : null}
        {node.detail ? (
          <span className="min-w-0 truncate">{node.detail}</span>
        ) : null}
      </span>
      {feeds ? (
        // In words when the lines are dropped; for screen readers at every width.
        <span className="col-start-2 col-end-4 text-caption text-tertiary-foreground @2xl:sr-only">
          {feeds}
        </span>
      ) : null}
    </>
  );
  const shared = {
    "data-node-id": node.id,
    "data-trace": trace,
    "data-status": node.status ?? "ok",
    tabIndex: tabbable ? 0 : -1,
    className: nodeClass({ tone, acting, off: Boolean(node.off) }),
    onPointerEnter: () => {
      onTrace(node.id);
    },
    onPointerLeave: () => {
      onTrace(null);
    },
    onFocus: () => {
      onTrace(node.id);
    },
    onBlur: () => {
      onTrace(null);
    },
    children,
  };
  const element = useRender({
    defaultTagName: node.href ? "a" : node.onSelect ? "button" : "div",
    render: node.render,
    ref: (element: HTMLElement | null) => {
      register(node.id, element);
    },
    props: mergeProps<"button">(
      shared as React.ComponentProps<"button">,
      node.href ? ({ href: node.href } as React.ComponentProps<"button">) : {},
      node.onSelect && !node.href && !node.render
        ? { type: "button", onClick: node.onSelect }
        : {},
    ),
  });
  return (
    <li
      className="animate-slot-in stagger"
      style={{ "--stagger-index": index } as React.CSSProperties}
    >
      {element}
    </li>
  );
}

/**
 * The connection map, the diagram language everywhere (foundation 9, Atlas): columns of things, each
 * linked to what it feeds (disks to file systems to shared folders to ways of sharing to people, but
 * nothing here knows that). Pointing at or focusing a node traces its whole lineage and dims the
 * rest, which answers "what depends on this?" before anyone acts. Lines draw on entrance; a line to a
 * node that is not OK takes its status colour, with the node's icon and word.
 *
 * Only nodes that act (`onSelect`, `href`, `render`) look clickable. It is a list of lists with the
 * full text: each node says its state and, in words, what it feeds. One tab stop: the arrow keys move
 * between nodes, Home and End to the ends. Narrower than 42rem the lines drop, the columns stack and
 * each node says what it feeds on screen.
 */
function ConnectionMap({
  columns,
  feedsLabel,
  keyboardHint,
  "aria-label": ariaLabel,
  className,
  ...props
}: ConnectionMapProps) {
  const hintId = React.useId();
  const nodes = React.useMemo(() => columns.flatMap((c) => c.nodes), [columns]);
  const [hot, setHot] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<string | null>(null);
  const [edges, setEdges] = React.useState<DrawnEdge[]>([]);
  const elementsRef = React.useRef(new Map<string, HTMLElement>());
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const [measureRef, { width, height }] = useElementSize<HTMLDivElement>();
  const setGrid = React.useCallback(
    (node: HTMLDivElement | null) => {
      gridRef.current = node;
      return measureRef(node);
    },
    [measureRef],
  );

  const traced = React.useMemo(
    () => (hot === null ? null : lineage(nodes, hot)),
    [hot, nodes],
  );
  const names = React.useMemo(
    () => new Map(nodes.map((n) => [n.id, n.label])),
    [nodes],
  );
  const order = React.useMemo(
    () => columns.map((c) => c.nodes.map((n) => n.id)),
    [columns],
  );
  const current =
    active !== null && names.has(active) ? active : (order.flat()[0] ?? null);

  React.useLayoutEffect(() => {
    const box = gridRef.current;
    if (!box || width < WIDE_PX) {
      setEdges([]);
      return;
    }
    const origin = box.getBoundingClientRect();
    const drawn: DrawnEdge[] = [];
    for (const edge of mapEdges(nodes)) {
      const a = elementsRef.current.get(edge.from)?.getBoundingClientRect();
      const b = elementsRef.current.get(edge.to)?.getBoundingClientRect();
      if (!a || !b || b.left <= a.right) {
        continue;
      }
      const x0 = a.right - origin.left;
      const y0 = a.top + a.height / 2 - origin.top;
      const x1 = b.left - origin.left;
      const y1 = b.top + b.height / 2 - origin.top;
      const mx = (x0 + x1) / 2;
      drawn.push({
        ...edge,
        d: `M${x0.toFixed(1)} ${y0.toFixed(1)}C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`,
      });
    }
    setEdges(drawn);
    // Measured again when the nodes change or the map changes size (a wider card, a node that
    // grew taller as a font arrived).
  }, [nodes, width, height]);

  const register = React.useCallback(
    (id: string, element: HTMLElement | null) => {
      if (element) {
        elementsRef.current.set(id, element);
      } else {
        elementsRef.current.delete(id);
      }
    },
    [],
  );
  const onTrace = React.useCallback((id: string | null) => {
    setHot(id);
    if (id !== null) {
      setActive(id);
    }
  }, []);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (current === null) {
      return;
    }
    const target = moveOnMap(order, current, event.key);
    if (target === null) {
      return;
    }
    event.preventDefault();
    setActive(target);
    elementsRef.current.get(target)?.focus();
  };

  return (
    <div
      data-slot="connection-map"
      data-tracing={traced ? "" : undefined}
      className={cn("@container", className)}
      {...props}
    >
      <div
        ref={setGrid}
        role="group"
        aria-label={ariaLabel}
        aria-describedby={keyboardHint ? hintId : undefined}
        onKeyDown={onKeyDown}
        className="relative grid gap-y-5 @2xl:auto-cols-fr @2xl:grid-flow-col @2xl:gap-x-16"
      >
        {keyboardHint ? (
          <p id={hintId} className="sr-only">
            {keyboardHint}
          </p>
        ) : null}
        <svg
          aria-hidden="true"
          data-slot="connection-map-lines"
          className="pointer-events-none absolute inset-0 hidden size-full overflow-visible @2xl:block"
        >
          {edges.map((edge, i) => {
            const dashed = edge.off || edge.tone === "unknown";
            const trace = traced
              ? edgeInLineage(edge, traced)
                ? "lit"
                : "dim"
              : "none";
            return (
              <path
                key={`${edge.from}>${edge.to}`}
                data-from={edge.from}
                data-to={edge.to}
                data-tone={edge.tone}
                data-trace={trace === "none" ? undefined : trace}
                d={edge.d}
                strokeWidth={1.5}
                strokeLinecap="round"
                // A solid line draws along its length on entrance (pathLength 1); a dashed one, for
                // something unknown or not in use, keeps its pattern and is simply there.
                pathLength={dashed ? undefined : 1}
                strokeDasharray={edge.off ? "4 4" : dashed ? "2 4" : undefined}
                style={{ "--stagger-index": i } as React.CSSProperties}
                className={cn(
                  lineClass({ tone: edge.off ? "ok" : edge.tone, trace }),
                  edge.off && trace === "none" && "stroke-art-faint",
                  !dashed && "line-draw",
                )}
              />
            );
          })}
        </svg>
        {columns.map((column, ci) => {
          const titleId = `${hintId}-${column.id}`;
          return (
            <div key={column.id} className="flex min-w-0 flex-col gap-2">
              <p
                id={titleId}
                className="text-caption font-semibold text-tertiary-foreground"
              >
                {column.title}
              </p>
              <ul
                aria-labelledby={titleId}
                className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2 @2xl:grid-cols-1"
              >
                {column.nodes.map((node, ni) => {
                  const fed = (node.feeds ?? [])
                    .map((id) => names.get(id))
                    .filter((n): n is string => n !== undefined);
                  return (
                    <MapNodeItem
                      key={node.id}
                      node={node}
                      feeds={fed.length > 0 ? feedsLabel(fed) : ""}
                      trace={
                        traced
                          ? traced.has(node.id)
                            ? "lit"
                            : "dim"
                          : undefined
                      }
                      tabbable={node.id === current}
                      register={register}
                      onTrace={onTrace}
                      index={ci * 2 + ni}
                    />
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { ConnectionMap };
export type { ConnectionMapColumn, ConnectionMapNode, ConnectionMapProps };
