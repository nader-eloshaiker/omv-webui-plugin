// SPDX-License-Identifier: GPL-3.0-or-later
// Where the shared-folders table keeps its page, page size, sort and search (phase 3 design 4): in
// memory for the session, so leaving the page and coming back keeps them and a reload resets them.
// Never in the address, which only selects a view (UI-4), and never in browser storage (UI-13). It is
// emptied when the session ends (app.ts), so the next account starts afresh.
//
// Not a zustand store: zustand is for preferences. A small external store, as the session is.
import { useSyncExternalStore } from "react";
import { INITIAL_TABLE_STATE, type TableState } from "./table.ts";

export interface TableStore {
  getState(): TableState;
  set(change: Partial<TableState>): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

export function createTableStore(
  initial: TableState = INITIAL_TABLE_STATE,
): TableStore {
  let state = initial;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) {
      listener();
    }
  };
  return {
    getState: () => state,
    set(change) {
      state = { ...state, ...change };
      emit();
    },
    reset() {
      if (state !== initial) {
        state = initial;
        emit();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The one table of shared folders. */
export const sharedFoldersTable = createTableStore();

export function useTableState(
  store: TableStore = sharedFoldersTable,
): TableState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
