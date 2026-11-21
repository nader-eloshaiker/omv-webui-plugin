// SPDX-License-Identifier: GPL-3.0-or-later
// The System logs page (phase 5 design 2): the logs offered, how each is laid out, and how the rows
// of one read are searched, sorted and paged in the browser. LogFile.getList re-reads and re-parses
// the whole log on every call, so the page reads a log once, its newest 5,000 entries, and does the
// rest here (owner). Pure, so each rule is tested by itself.
import type {
  LogFileGetListRequest,
  LogRow,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { stripControl } from "@omv-webui/react-ui-components";
import { naturalCompare } from "../format/format.ts";

/** The stock logs, in the picker's two groups (design 2.3). No id ever comes from anywhere else. */
export const LOG_GROUPS = [
  {
    group: "system",
    ids: ["syslog", "messages", "daemon", "auth", "boot", "dmesg"],
  },
  {
    group: "storage",
    ids: ["smartd", "smbdaudit", "rsync", "rsyncd", "apt_term"],
  },
] as const;

export type LogId = (typeof LOG_GROUPS)[number]["ids"][number];
export const LOG_IDS: readonly LogId[] = LOG_GROUPS.flatMap((g) => [...g.ids]);
export const isLogId = (value: unknown): value is LogId =>
  typeof value === "string" && (LOG_IDS as readonly string[]).includes(value);

/** journal: time and message. timeMessage: the same two columns. message: no times. audit: SMB audit. */
export type LogLayout = "journal" | "timeMessage" | "message" | "audit";

export function logLayout(id: LogId): LogLayout {
  switch (id) {
    case "smartd":
    case "rsync":
      return "timeMessage";
    case "apt_term":
      return "message";
    case "smbdaudit":
      return "audit";
    default:
      return "journal";
  }
}

/**
 * How many entries one read asks for. rpc.php holds every row it sends in PHP's 128 MB of memory, and
 * a whole journal near OMV's 100,000-line cap runs it out (journal, 2026-11-22); 5,000 entries are
 * about 1 MB and read in under a second (design 2.1).
 */
export const LOG_READ_LIMIT = 5000;

/**
 * The one read of a log: the newest 5,000 entries, by their line in the log (`rownum`, which counts
 * up through the file), so the updates log, which has no times, is cut the same way. The page sorts
 * the rows itself (sortRows), whatever order they arrive in.
 */
export function logRequest(id: LogId): LogFileGetListRequest {
  return {
    id,
    start: 0,
    limit: LOG_READ_LIMIT,
    sortfield: "rownum",
    sortdir: "desc",
  };
}

/** Whether the log has more entries than were read: then the page says only the newest are shown. */
export const isPartialRead = (received: number, total: unknown): boolean =>
  typeof total === "number" && Number.isFinite(total) && total > received;

/** PHP's words when a script needs more memory than it is allowed. */
const MEMORY_EXHAUSTED = /\ballowed memory size\b.*\bexhausted\b/i;

/**
 * Whether a failed read of a log is the server giving up on a long log: the fallback state, should a
 * read of LOG_READ_LIMIT entries still be too much. Past its memory limit PHP stops rpc.php, which
 * answers 500 with an empty body (the transport marks it unreadable). A 500 whose message says the
 * memory was exhausted is the same limit. Any other failure is an ordinary one.
 */
export function isLogTooLong(error: unknown): boolean {
  return (
    isRpcError(error) &&
    error.status === 500 &&
    (error.unreadable || MEMORY_EXHAUSTED.test(error.message))
  );
}

export type LogSortField =
  | "ts"
  | "rownum"
  | "username"
  | "clientipaddr"
  | "servicename"
  | "operation"
  | "result";

/** The sortable columns of a layout. The message is never sortable: alphabetical log lines answer nothing. */
export function sortableFields(layout: LogLayout): readonly LogSortField[] {
  switch (layout) {
    case "audit":
      return [
        "ts",
        "username",
        "clientipaddr",
        "servicename",
        "operation",
        "result",
      ];
    case "message":
      return ["rownum"];
    default:
      return ["ts"];
  }
}

export type SortDirection = "asc" | "desc";
export interface LogSort {
  field: LogSortField;
  direction: SortDirection;
}

/** Newest first: by time, or by line where there are no times. */
export const defaultSort = (layout: LogLayout): LogSort =>
  layout === "message"
    ? { field: "rownum", direction: "desc" }
    : { field: "ts", direction: "desc" };

/** Pressing a header: that column ascending, or the sorted one reversed. */
export function nextSort(current: LogSort, field: LogSortField): LogSort {
  return current.field === field
    ? { field, direction: current.direction === "asc" ? "desc" : "asc" }
    : { field, direction: "asc" };
}

/**
 * A field of a log line as it is shown and searched: terminal escape sequences, other control
 * characters and the bidirectional embeddings, overrides, isolates and marks removed (as the service
 * output is, style guide 5.7), so a line cannot reverse or hide part of itself. Line breaks inside a
 * message stay; a carriage return at the end of a line (the updates log has them) is dropped, and one
 * inside keeps what was written last, as a terminal would.
 */
export function cleanLogText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .split("\n")
    .map((line) => stripControl(line.replace(/\r+$/, "")))
    .join("\n");
}

const text = cleanLogText;
const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.NEGATIVE_INFINITY;

/** The rows in the chosen order; ties by line, in the same direction, so a second keeps its order. */
export function sortRows(rows: readonly LogRow[], sort: LogSort): LogRow[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  const compare = (a: LogRow, b: LogRow): number => {
    switch (sort.field) {
      case "ts":
        return num(a.ts) - num(b.ts);
      case "rownum":
        return a.rownum - b.rownum;
      default:
        return naturalCompare(text(a[sort.field]), text(b[sort.field]));
    }
  };
  return [...rows].sort(
    (a, b) => sign * (compare(a, b) || a.rownum - b.rownum),
  );
}

/** What a search looks at: only the columns shown for the log, the time as it is displayed. */
export function searchText(
  row: LogRow,
  layout: LogLayout,
  formatTime: (ts: number) => string,
): string {
  const time = typeof row.ts === "number" ? formatTime(row.ts) : "";
  switch (layout) {
    case "audit":
      return [
        time,
        text(row.username),
        text(row.clientipaddr),
        text(row.servicename),
        text(row.filename),
        text(row.filepath),
        text(row.operation),
        text(row.result),
      ].join("\n");
    case "message":
      return text(row.message);
    default:
      return `${time}\n${text(row.message)}`;
  }
}

/** Case-insensitive substring search over the shown columns. An empty search keeps every row. */
export function searchRows(
  rows: readonly LogRow[],
  search: string,
  layout: LogLayout,
  formatTime: (ts: number) => string,
): readonly LogRow[] {
  const needle = search.trim().toLocaleLowerCase();
  if (needle === "") {
    return rows;
  }
  return rows.filter((row) =>
    searchText(row, layout, formatTime).toLocaleLowerCase().includes(needle),
  );
}

export const LOG_PAGE_SIZES = [25, 50, 100, 200] as const;

/** One page of rows, counted from 0, and the range it shows (1-based, for the words). */
export function pageOf<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): {
  rows: readonly T[];
  page: number;
  pageCount: number;
  from: number;
  to: number;
} {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(0, page), pageCount - 1);
  const start = current * pageSize;
  const slice = rows.slice(start, start + pageSize);
  return {
    rows: slice,
    page: current,
    pageCount,
    from: slice.length === 0 ? 0 : start + 1,
    to: start + slice.length,
  };
}
