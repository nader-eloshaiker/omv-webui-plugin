// SPDX-License-Identifier: GPL-3.0-or-later
// The Processes page (phase 5 design 3): System.getTopInfo's strings read as numbers, and the process
// table searched, sorted and paged in the browser. Every value arrives as a string (observed); one
// that does not parse is "Not reported" for that fact or cell only. Pure, so each rule is tested.
import type { TopInfo, TopProcess } from "@omv-webui/react-api-omv/generated";
import { naturalCompare, parseDecimal, percentOf } from "../format/format.ts";

const MIB = 1024 * 1024;

/** A count `top` gives as text, as a whole number; null when it does not parse. */
const count = (value: string | undefined): number | null => {
  const n = parseDecimal(value);
  return n === null || n < 0 ? null : Math.round(n);
};

/** A size `top` gives in MiB ("3914.0"), in bytes, so it matches the dashboard's units. */
export const mibToBytes = (value: string | undefined): number | null => {
  const n = parseDecimal(value);
  return n === null || n < 0 ? null : n * MIB;
};

export interface ProcessCounts {
  total: number;
  running: number;
  sleeping: number;
  stopped: number;
  zombie: number;
}

export function processCounts(top: TopInfo): ProcessCounts | null {
  const total = count(top.tasks_total);
  const running = count(top.tasks_running);
  const sleeping = count(top.tasks_sleeping);
  if (total === null || running === null || sleeping === null) {
    return null;
  }
  return {
    total,
    running,
    sleeping,
    stopped: count(top.tasks_stopped) ?? 0,
    zombie: count(top.tasks_zombie) ?? 0,
  };
}

export interface MemoryFigures {
  used: number;
  total: number;
  percent: number;
}

/** Memory in use, and what the page cache holds besides; null when the figures do not parse. */
export function memoryFigures(
  top: TopInfo,
): (MemoryFigures & { cache: number | null }) | null {
  const used = mibToBytes(top.mem_used);
  const total = mibToBytes(top.mem_total);
  if (used === null || total === null) {
    return null;
  }
  const percent = percentOf(used, total);
  return percent === null
    ? null
    : { used, total, percent, cache: mibToBytes(top.mem_buff_cache) };
}

/** Swap: `none` when there is no swap space (the VM sends "0.0"), null when the figures do not parse. */
export function swapFigures(top: TopInfo): MemoryFigures | "none" | null {
  const total = mibToBytes(top.swap_total);
  const used = mibToBytes(top.swap_used);
  if (total === 0) {
    return "none";
  }
  if (total === null || used === null) {
    return null;
  }
  const percent = percentOf(used, total);
  return percent === null ? null : { used, total, percent };
}

/** The three load averages as `top` printed them, or null when one does not parse. */
export function loadAverages(
  top: TopInfo,
): { one: string; five: string; fifteen: string } | null {
  const values = [top.load_1m, top.load_5m, top.load_15m].map(parseDecimal);
  if (values.some((v) => v === null)) {
    return null;
  }
  const [one, five, fifteen] = values.map((v) => (v ?? 0).toFixed(2));
  return { one: one ?? "", five: five ?? "", fifteen: fifteen ?? "" };
}

/** `TIME+` ("1:06.40", minutes:seconds.hundredths) in seconds, for sorting; null when it does not parse. */
export function cpuTimeSeconds(value: string): number | null {
  const parts = value.trim().split(":");
  if (
    parts.length === 0 ||
    parts.some((p) => p === "" || !/^\d+(\.\d+)?$/.test(p))
  ) {
    return null;
  }
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/** One row of the table: the strings `top` sent, and what the page sorts by. */
export interface ProcessRow {
  key: string;
  pid: number | null;
  pidText: string;
  user: string;
  command: string;
  cpu: number | null;
  memory: number | null;
  state: string;
  cpuTime: number | null;
  cpuTimeText: string;
}

export function processRows(processes: readonly TopProcess[]): ProcessRow[] {
  return processes.map((p, index) => ({
    key: `${p.PID}:${String(index)}`,
    pid: count(p.PID),
    pidText: p.PID,
    user: p.USER,
    command: p.COMMAND,
    cpu: parseDecimal(p["%CPU"]),
    memory: parseDecimal(p.RES),
    state: p.S,
    cpuTime: cpuTimeSeconds(p["TIME+"]),
    cpuTimeText: p["TIME+"],
  }));
}

/** The state letters `top` uses, each with its word in the catalogue (design 3.4.1). */
export const STATE_LETTERS = ["R", "S", "I", "D", "T", "t", "Z"] as const;
export type StateLetter = (typeof STATE_LETTERS)[number];
export const isStateLetter = (value: string): value is StateLetter =>
  (STATE_LETTERS as readonly string[]).includes(value);

export type ProcessSortField =
  "command" | "cpu" | "memory" | "state" | "user" | "cpuTime" | "pid";
export interface ProcessSort {
  field: ProcessSortField;
  direction: "asc" | "desc";
}

/** The busiest first. */
export const DEFAULT_PROCESS_SORT: ProcessSort = {
  field: "cpu",
  direction: "desc",
};

/** Pressing a header: that column, numbers from the largest, text from A; again reverses it. */
export function nextProcessSort(
  current: ProcessSort,
  field: ProcessSortField,
): ProcessSort {
  if (current.field === field) {
    return { field, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  const numeric = field === "cpu" || field === "memory" || field === "cpuTime";
  return { field, direction: numeric ? "desc" : "asc" };
}

const byNumber = (a: number | null, b: number | null) =>
  (a ?? Number.NEGATIVE_INFINITY) - (b ?? Number.NEGATIVE_INFINITY);

/** Numbers numerically (a value that did not parse sorts as the smallest), text naturally; ties by ID. */
export function sortProcesses(
  rows: readonly ProcessRow[],
  sort: ProcessSort,
): ProcessRow[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  const compare = (a: ProcessRow, b: ProcessRow): number => {
    switch (sort.field) {
      case "cpu":
        return byNumber(a.cpu, b.cpu);
      case "memory":
        return byNumber(a.memory, b.memory);
      case "cpuTime":
        return byNumber(a.cpuTime, b.cpuTime);
      case "pid":
        return byNumber(a.pid, b.pid);
      case "command":
        return naturalCompare(a.command, b.command);
      case "user":
        return naturalCompare(a.user, b.user);
      case "state":
        return naturalCompare(a.state, b.state);
    }
  };
  return [...rows].sort(
    (a, b) => sign * compare(a, b) || byNumber(a.pid, b.pid),
  );
}

/** "Program or user": a case-insensitive substring of either. */
export function searchProcesses(
  rows: readonly ProcessRow[],
  search: string,
): readonly ProcessRow[] {
  const needle = search.trim().toLocaleLowerCase();
  if (needle === "") {
    return rows;
  }
  return rows.filter(
    (row) =>
      row.command.toLocaleLowerCase().includes(needle) ||
      row.user.toLocaleLowerCase().includes(needle),
  );
}

export const PROCESS_PAGE_SIZES = [25, 50, 100] as const;
export const PROCESSES_POLL_MS = 5_000;
