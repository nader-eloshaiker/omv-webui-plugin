// SPDX-License-Identifier: GPL-3.0-or-later
// What the RAID pages keep in memory for the session (phase 5 RAID design 13.3): the arrays this
// session created
// (1.6), changed since the last apply (0.8's pending mark) or made bigger (2.6), the checks it started
// (6.1), and the arrays an action of this session is changing now (0.9, "It is being changed now").
// In memory only (UI-13); emptied when the session ends (app.ts). Arrays are known by their UUID, which
// a restart does not change, and by their device file for the words.
import { createMemoryStore } from "../shell/memoryStore.ts";

export interface CreatedArray {
  uuid: string;
  devicefile: string;
  /** The create flow chose "Use it for files" (1.6: an array left without one is not reported). */
  forFiles: boolean;
}

export interface RaidSessionState {
  created: readonly CreatedArray[];
  /** Device files of the arrays this session changed since the last apply. */
  changed: readonly string[];
  /** UUIDs of the arrays this session made bigger. */
  grown: readonly string[];
  /** Checks this session started, by the array's UUID: when, and when it was seen to end. */
  checks: Readonly<Record<string, { startedAt: number; endedAt?: number }>>;
  /** UUIDs (or, for a create, the device files) of arrays an action of this session is changing. */
  changing: readonly string[];
}

const INITIAL: RaidSessionState = {
  created: [],
  changed: [],
  grown: [],
  checks: {},
  changing: [],
};

export const raidSession = createMemoryStore<RaidSessionState>(INITIAL);

export const recordCreatedArray = (array: CreatedArray): void =>
  raidSession.set((s) => ({
    created: [...s.created.filter((a) => a.uuid !== array.uuid), array],
  }));

export const recordChanged = (devicefile: string): void =>
  raidSession.set((s) =>
    s.changed.includes(devicefile)
      ? {}
      : { changed: [...s.changed, devicefile] },
  );

/** Once mdadm is no longer pending, the arrays are written down: the marks are forgotten. */
export const forgetChanged = (): void =>
  raidSession.set((s) => (s.changed.length === 0 ? {} : { changed: [] }));

export const recordGrown = (uuid: string): void =>
  raidSession.set((s) =>
    s.grown.includes(uuid) ? {} : { grown: [...s.grown, uuid] },
  );

export const recordCheckStarted = (uuid: string, at: number): void =>
  raidSession.set((s) => ({
    checks: { ...s.checks, [uuid]: { startedAt: at } },
  }));

export const recordCheckEnded = (uuid: string, at: number): void =>
  raidSession.set((s) => {
    const check = s.checks[uuid];
    return check === undefined || check.endedAt !== undefined
      ? {}
      : { checks: { ...s.checks, [uuid]: { ...check, endedAt: at } } };
  });

/** Mark an array as being changed by this session; returns false when it already is (one at a time). */
export function beginChanging(key: string): boolean {
  if (raidSession.getState().changing.includes(key)) {
    return false;
  }
  raidSession.set((s) => ({ changing: [...s.changing, key] }));
  return true;
}

export const endChanging = (key: string): void =>
  raidSession.set((s) => ({ changing: s.changing.filter((k) => k !== key) }));
