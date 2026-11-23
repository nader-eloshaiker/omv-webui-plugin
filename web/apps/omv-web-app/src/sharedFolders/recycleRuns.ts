// SPDX-License-Identifier: GPL-3.0-or-later
// The recycle bins being emptied in this session (phase 5 services design 11.4): the task helper's id
// for each SMB share's emptying, so a folder's page shows its output and result while the session
// lasts, and refuses a second emptying of the same bin. The task handle itself never leaves the task
// helper (UI-5): only the registry's id is kept here, in memory (UI-13), emptied when the session ends
// (app.ts).
import { createMemoryStore } from "../shell/memoryStore.ts";

export interface RecycleRun {
  /** The task registry's id. */
  taskId: number;
  /** The shared folder's name when it started, for the result's words. */
  folder: string;
}

export interface RecycleRunsState {
  /** By SMB share `uuid`. */
  runs: Readonly<Record<string, RecycleRun>>;
}

export const recycleRuns = createMemoryStore<RecycleRunsState>({ runs: {} });

export const recordRecycleRun = (shareUuid: string, run: RecycleRun): void =>
  recycleRuns.set((s) => ({ runs: { ...s.runs, [shareUuid]: run } }));

export const forgetRecycleRun = (shareUuid: string): void =>
  recycleRuns.set((s) => {
    if (s.runs[shareUuid] === undefined) {
      return {};
    }
    const { [shareUuid]: _done, ...runs } = s.runs;
    return { runs };
  });
