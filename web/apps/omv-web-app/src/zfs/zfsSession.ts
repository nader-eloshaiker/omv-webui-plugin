// SPDX-License-Identifier: GPL-3.0-or-later
// What the ZFS pages keep in memory for the session (phase 5 ZFS design 13.3): the pools this session
// created and whether their create flow chose a first file system (1.6), the file systems whose
// settings it saved since the last apply (0.9's pending mark), the disk handed to the replace flow
// (7.2: in memory, never in the address), how many snapshots a file system's page last counted (2.6),
// and the pools an action of this session is changing now (0.10, one action at a time). In memory only
// (UI-13); emptied when the session ends (app.ts).
import { createMemoryStore } from "../shell/memoryStore.ts";

export interface CreatedPool {
  pool: string;
  /** The create flow chose "Make a first file system" (1.6). */
  withFs: boolean;
}

export interface ZfsSessionState {
  created: readonly CreatedPool[];
  /** Pools on which this session created or deleted something since the last apply (1.6). */
  touched: readonly string[];
  /** File systems whose settings this session saved since the last apply (0.9). */
  saved: readonly string[];
  /** The disk to replace, by its pool and its path from getPoolDevices. */
  handoff: { pool: string; path: string } | null;
  /** Snapshot counts last read on a file system's page, by its full name. */
  snapshotCounts: Readonly<Record<string, number>>;
  /** Pools an action of this session is changing. */
  changing: readonly string[];
}

const INITIAL: ZfsSessionState = {
  created: [],
  touched: [],
  saved: [],
  handoff: null,
  snapshotCounts: {},
  changing: [],
};

export const zfsSession = createMemoryStore<ZfsSessionState>(INITIAL);

export const recordCreatedPool = (pool: CreatedPool): void =>
  zfsSession.set((s) => ({
    created: [...s.created.filter((p) => p.pool !== pool.pool), pool],
  }));

export const recordTouched = (pool: string): void =>
  zfsSession.set((s) =>
    s.touched.includes(pool) ? {} : { touched: [...s.touched, pool] },
  );

export const recordSaved = (fs: string): void =>
  zfsSession.set((s) =>
    s.saved.includes(fs) ? {} : { saved: [...s.saved, fs] },
  );

/** Once nothing of ZFS's is pending any more, the marks are forgotten. */
export const forgetPending = (): void =>
  zfsSession.set((s) =>
    s.touched.length === 0 && s.saved.length === 0
      ? {}
      : { touched: [], saved: [] },
  );

export const handOffReplace = (pool: string, path: string): void =>
  zfsSession.set({ handoff: { pool, path } });

export const takeHandoff = (pool: string): string | null => {
  const handoff = zfsSession.getState().handoff;
  return handoff !== null && handoff.pool === pool ? handoff.path : null;
};

export const recordSnapshotCount = (fs: string, count: number): void =>
  zfsSession.set((s) =>
    s.snapshotCounts[fs] === count
      ? {}
      : { snapshotCounts: { ...s.snapshotCounts, [fs]: count } },
  );

/** Mark a pool as being changed by this session; false when it already is (one at a time). */
export function beginChanging(pool: string): boolean {
  if (zfsSession.getState().changing.includes(pool)) {
    return false;
  }
  zfsSession.set((s) => ({ changing: [...s.changing, pool] }));
  return true;
}

export const endChanging = (pool: string): void =>
  zfsSession.set((s) => ({ changing: s.changing.filter((p) => p !== pool) }));
