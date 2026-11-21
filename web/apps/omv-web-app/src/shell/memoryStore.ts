// SPDX-License-Identifier: GPL-3.0-or-later
// A small external store for what a page keeps in memory for the session (phase 5 design 8.3): the
// chart's samples, the last disk-health result, the logs and processes pages' view state. Never in the
// address (UI-4) and never in browser storage (UI-13); every store is emptied when the session ends
// (app.ts), so the next account starts afresh. Not zustand: zustand is for preferences.
import { useSyncExternalStore } from "react";

export interface MemoryStore<T> {
  getState(): T;
  set(change: Partial<T> | ((state: T) => Partial<T>)): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

export function createMemoryStore<T extends object>(
  initial: T,
): MemoryStore<T> {
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
      const next = typeof change === "function" ? change(state) : change;
      state = { ...state, ...next };
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

export function useMemoryStore<T>(store: MemoryStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
