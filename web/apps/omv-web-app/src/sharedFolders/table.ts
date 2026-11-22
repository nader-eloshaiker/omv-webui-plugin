// SPDX-License-Identifier: GPL-3.0-or-later
// The shared-folders table's state and how it maps to ShareMgmt.getList (phase 3 design 4): the
// backend pages, sorts and searches the whole list, so the table only says which page, which order and
// which words. Pure, so the mapping is tested by itself.
import type {
  GetListRequest,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";

/** The columns, by the top-level field OMV sorts on. */
export const SORT_FIELDS = [
  "name",
  "status",
  "device",
  "reldirpath",
  "absdirpath",
  "comment",
  "_used",
] as const satisfies readonly (keyof SharedFolder)[];
export type SortField = (typeof SORT_FIELDS)[number];

export type SortDirection = "asc" | "desc";

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export interface TableState {
  /** The page shown, counted from 0. */
  page: number;
  pageSize: number;
  sort: { field: SortField; direction: SortDirection };
  /** What is in the search box now. */
  searchInput: string;
  /** The search the backend was asked for (the box, 300 ms after typing stopped). */
  search: string;
}

/** As the stock page: by name, ascending, 25 rows. */
export const INITIAL_TABLE_STATE: TableState = {
  page: 0,
  pageSize: 25,
  sort: { field: "name", direction: "asc" },
  searchInput: "",
  search: "",
};

/** The request for the page the state shows. An empty search is not sent. */
export function listRequest(state: TableState): GetListRequest {
  const request: GetListRequest = {
    start: state.page * state.pageSize,
    limit: state.pageSize,
    sortfield: state.sort.field,
    sortdir: state.sort.direction,
  };
  const search = state.search.trim();
  if (search !== "") {
    request.search = search;
  }
  return request;
}

/**
 * Every folder: the problem count's second, separate read (owner, 2026-11-20), which a folder's page,
 * the add flow and the SMB page share (phase 5 shares design 2.1). All five paging fields are sent,
 * `limit` null for the whole list (design 11.2).
 */
export const ALL_ROWS: GetListRequest = {
  start: 0,
  limit: null,
  sortfield: null,
  sortdir: null,
  search: null,
};

/** Pressing a header: that column ascending, or the sorted column reversed. Always exactly one sort. */
export function nextSort(
  current: TableState["sort"],
  field: SortField,
): TableState["sort"] {
  if (current.field === field) {
    return { field, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { field, direction: "asc" };
}

export const pageCount = (total: number, pageSize: number): number =>
  Math.max(1, Math.ceil(total / pageSize));

/**
 * The page to show for a total: the same one, or the last that exists when the list shrank below it
 * (folders deleted elsewhere while this page was open).
 */
export function clampPage(
  page: number,
  total: number,
  pageSize: number,
): number {
  return Math.min(page, pageCount(total, pageSize) - 1);
}

/** The rows shown, counted from 1: "1–25 of 132". */
export function rangeOf(
  page: number,
  pageSize: number,
  total: number,
): { from: number; to: number; total: number } {
  if (total === 0) {
    return { from: 0, to: 0, total };
  }
  const from = page * pageSize + 1;
  return { from, to: Math.min(total, from + pageSize - 1), total };
}

export type KnownProblem = "ENOENT" | "ENOTDIR" | "ENOENT_DB_MNTENT";

/**
 * How a folder's status reads (design 4.3): OK; Critical with its reason for the three failures OMV
 * reports; Unknown with the code itself for anything a later OMV may add.
 */
export function statusView(
  status: string,
):
  | { pill: "ok" }
  | { pill: "critical"; reason: KnownProblem }
  | { pill: "unknown"; code: string } {
  switch (status) {
    case "OK":
      return { pill: "ok" };
    case "ENOENT":
    case "ENOTDIR":
    case "ENOENT_DB_MNTENT":
      return { pill: "critical", reason: status };
    default:
      return { pill: "unknown", code: status };
  }
}

/** The folders that are not OK, and the worst pill among them, for the roll-up line. */
export function problems(folders: readonly Pick<SharedFolder, "status">[]): {
  count: number;
  total: number;
  worst: "critical" | "unknown" | null;
} {
  let count = 0;
  let worst: "critical" | "unknown" | null = null;
  for (const folder of folders) {
    const view = statusView(folder.status);
    if (view.pill === "ok") {
      continue;
    }
    count += 1;
    if (view.pill === "critical" || worst === null) {
      worst = view.pill;
    }
  }
  return { count, total: folders.length, worst };
}
