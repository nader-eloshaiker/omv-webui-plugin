// SPDX-License-Identifier: GPL-3.0-or-later
// What the connection map shows, apart from how it is drawn: which nodes a traced node's lineage
// holds, which colour each line takes, and where the arrow keys move. Free of React and the DOM.
import { STATUS_DRAWING, type HealthStatus } from "../status/status-kinds";

export interface MapNodeShape {
  id: string;
  /** The ids of the nodes this one feeds, in the next columns. */
  feeds?: readonly string[];
  status?: HealthStatus;
  /** Not in use: drawn dashed, and so are its lines. */
  off?: boolean;
}

/** One line of the map, from a node to one it feeds. */
export interface MapEdge {
  from: string;
  to: string;
  /** The worse state of its two ends: a line to a node in trouble takes that node's colour. */
  tone: "ok" | "warning" | "critical" | "unknown";
  /** Either end is not in use. */
  off: boolean;
}

const RANK = { ok: 0, unknown: 1, warning: 2, critical: 3 } as const;
type Tone = keyof typeof RANK;

function toneOf(status: HealthStatus | undefined): Tone {
  return STATUS_DRAWING[status ?? "ok"].tone as Tone;
}

/** Every line, in column order, skipping links to ids that are not on the map. */
export function mapEdges(nodes: readonly MapNodeShape[]): MapEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: MapEdge[] = [];
  for (const node of nodes) {
    for (const id of node.feeds ?? []) {
      const target = byId.get(id);
      if (!target) {
        continue;
      }
      const a = toneOf(node.status);
      const b = toneOf(target.status);
      edges.push({
        from: node.id,
        to: id,
        tone: RANK[a] >= RANK[b] ? a : b,
        off: Boolean(node.off || target.off),
      });
    }
  }
  return edges;
}

/**
 * The lineage of `id`: the node, everything it feeds (and what that feeds, to the end), and
 * everything that feeds it (back to the start). Siblings are not part of it. Safe on a cycle.
 */
export function lineage(
  nodes: readonly MapNodeShape[],
  id: string,
): Set<string> {
  const down = new Map<string, readonly string[]>();
  const up = new Map<string, string[]>();
  for (const node of nodes) {
    down.set(node.id, node.feeds ?? []);
    for (const to of node.feeds ?? []) {
      up.set(to, [...(up.get(to) ?? []), node.id]);
    }
  }
  const out = new Set<string>([id]);
  const walk = (start: string, next: Map<string, readonly string[]>) => {
    const queue = [start];
    const seen = new Set<string>([start]);
    while (queue.length > 0) {
      const at = queue.shift() as string;
      for (const n of next.get(at) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          out.add(n);
          queue.push(n);
        }
      }
    }
  };
  walk(id, down);
  walk(id, up);
  return out;
}

/** Whether a line belongs to a traced lineage: both its ends do. */
export function edgeInLineage(edge: MapEdge, traced: ReadonlySet<string>) {
  return traced.has(edge.from) && traced.has(edge.to);
}

/**
 * Where an arrow key moves focus on the map: up and down within a column, left and right to the
 * neighbouring column at the same row (or its last), Home and End to the first and last node of the
 * whole map. `null` for any other key, or when there is nowhere to go.
 */
export function moveOnMap(
  columns: readonly (readonly string[])[],
  current: string,
  key: string,
): string | null {
  const col = columns.findIndex((c) => c.includes(current));
  if (col < 0) {
    return null;
  }
  const row = columns[col]?.indexOf(current) ?? 0;
  const at = (c: number, r: number) => {
    const column = columns[c];
    if (!column || column.length === 0) {
      return null;
    }
    return column[Math.min(r, column.length - 1)] ?? null;
  };
  const nonEmpty = (from: number, step: number) => {
    for (let c = from; c >= 0 && c < columns.length; c += step) {
      if ((columns[c]?.length ?? 0) > 0) {
        return c;
      }
    }
    return -1;
  };
  switch (key) {
    case "ArrowDown":
      return at(col, row + 1) === current ? null : at(col, row + 1);
    case "ArrowUp":
      return row === 0 ? null : at(col, row - 1);
    case "ArrowRight": {
      const c = nonEmpty(col + 1, 1);
      return c < 0 ? null : at(c, row);
    }
    case "ArrowLeft": {
      const c = nonEmpty(col - 1, -1);
      return c < 0 ? null : at(c, row);
    }
    case "Home": {
      const c = nonEmpty(0, 1);
      return c < 0 ? null : at(c, 0);
    }
    case "End": {
      const c = nonEmpty(columns.length - 1, -1);
      const column = columns[c];
      return c < 0 || !column ? null : (column.at(-1) ?? null);
    }
    default:
      return null;
  }
}
