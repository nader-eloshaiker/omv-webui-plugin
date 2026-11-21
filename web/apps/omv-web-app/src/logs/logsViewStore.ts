// SPDX-License-Identifier: GPL-3.0-or-later
// The System logs page's view for the session (phase 5 design 2.1): which log, the search, the sort,
// the page and its size. In memory, never in the address (UI-4: an address that reads a log on load
// is a step towards a URL that makes a call) and never in browser storage (UI-13).
import { createMemoryStore } from "../shell/memoryStore.ts";
import type { LogId, LogSort } from "./logView.ts";

export interface LogsViewState {
  logId: LogId | undefined;
  searchInput: string;
  search: string;
  sort: LogSort;
  page: number;
  pageSize: number;
}

export const logsView = createMemoryStore<LogsViewState>({
  logId: undefined,
  searchInput: "",
  search: "",
  sort: { field: "ts", direction: "desc" },
  page: 0,
  pageSize: 50,
});
