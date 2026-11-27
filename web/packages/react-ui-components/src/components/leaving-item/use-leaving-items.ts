// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";

/** One entry of a list that keeps its leavers for their exit: the item, its key, and whether it is leaving. */
interface LeavingEntry<T> {
  key: string;
  item: T;
  /** True from the render in which the item dropped out of the list until its exit has run. */
  leaving: boolean;
}

interface LeavingState<T> {
  prev: readonly T[];
  /** The items that left, with where they stood, until their exit ends. */
  leavers: ReadonlyMap<string, { item: T; index: number }>;
}

/**
 * Keeps the items that drop out of `items` in the list until their exit has run, in the place they
 * held, so a `LeavingItem` can fade and collapse them instead of the list jumping (foundation 7.2).
 * Returns every entry to render, in order, and `left(key)` to call when one has gone (`LeavingItem`'s
 * `onLeft`). An item that comes back while it is leaving simply stays. Keys come from `keyOf`, the
 * same keys the list renders with.
 */
function useLeavingItems<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): { entries: readonly LeavingEntry<T>[]; left: (key: string) => void } {
  const [state, setState] = React.useState<LeavingState<T>>(() => ({
    prev: items,
    leavers: new Map(),
  }));
  let current = state;
  if (state.prev !== items) {
    // Adjusting state while rendering (react.dev, "storing information from previous renders"):
    // the leavers are known in the same render that loses them, so nothing flashes out and back.
    const now = new Set(items.map(keyOf));
    const leavers = new Map(
      [...state.leavers].filter(([key]) => !now.has(key)),
    );
    state.prev.forEach((item, index) => {
      const key = keyOf(item);
      if (!now.has(key) && !leavers.has(key)) {
        leavers.set(key, { item, index });
      }
    });
    current = { prev: items, leavers };
    setState(current);
  }
  const left = React.useCallback((key: string) => {
    setState((s) => {
      if (!s.leavers.has(key)) {
        return s;
      }
      const leavers = new Map(s.leavers);
      leavers.delete(key);
      return { ...s, leavers };
    });
  }, []);
  const entries: LeavingEntry<T>[] = items.map((item) => ({
    key: keyOf(item),
    item,
    leaving: false,
  }));
  [...current.leavers]
    .sort(([, a], [, b]) => a.index - b.index)
    .forEach(([key, { item, index }]) => {
      entries.splice(Math.min(index, entries.length), 0, {
        key,
        item,
        leaving: true,
      });
    });
  return { entries, left };
}

export { useLeavingItems };
export type { LeavingEntry };
