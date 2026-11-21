// SPDX-License-Identifier: GPL-3.0-or-later
// The Processes page's view for the session (phase 5 design 3.5): whether updates are paused, and the
// search, sort and page. In memory only (UI-13); leaving the page while paused and coming back shows
// the frozen list, and the poll does not run.
import { createMemoryStore } from "../shell/memoryStore.ts";
import { DEFAULT_PROCESS_SORT, type ProcessSort } from "./processes.ts";

export interface ProcessesViewState {
  paused: boolean;
  searchInput: string;
  search: string;
  sort: ProcessSort;
  page: number;
  pageSize: number;
}

export const processesView = createMemoryStore<ProcessesViewState>({
  paused: false,
  searchInput: "",
  search: "",
  sort: DEFAULT_PROCESS_SORT,
  page: 0,
  pageSize: 50,
});
