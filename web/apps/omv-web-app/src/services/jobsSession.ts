// SPDX-License-Identifier: GPL-3.0-or-later
// What the copy-job pages keep in memory for the session (phase 5 services design 0.3, 0.9, 5, 7):
// the folder a shared folder's page hands to "Add a copy job" (in memory, never in the address,
// 13.2, UI-4), the jobs this session saved since the last apply (the pending mark), each job's run
// started here (the registry's id only: the handle stays in the task helper, UI-5), the trial runs
// seen here (what a deleting job is turned on against, 0.10) and, for a job saved for trial runs,
// whether the reader chose a schedule for it. In memory only (UI-13); emptied when the session ends
// (app.ts). Jobs are kept by the UUID the server gave, never by text typed or taken from the address.
import { createMemoryStore } from "../shell/memoryStore.ts";

/** A trial run seen in this session: what it was of (jobModel.trialKey) and what it listed. */
export interface SeenTrial {
  key: string;
  /** Files it would delete (folders not counted). */
  deleteCount: number;
}

export interface JobsSessionState {
  /** A shared folder's UUID, chosen as the source on "Keep a copy of this folder…" (12.1). */
  handover: string | null;
  /** Jobs saved (added, changed, deleted) since the last apply, by UUID. */
  saved: readonly string[];
  /** The latest run of each job started in this session: the registry's task id. */
  runs: Readonly<Record<string, number>>;
  trials: Readonly<Record<string, SeenTrial>>;
  /** A job saved for trial runs: on a schedule (true) or only when started (false) once turned on. */
  intended: Readonly<Record<string, boolean>>;
  /** "Change…" in the list's menu: the job whose page opens with its form (in memory, UI-4). */
  changeRequest: string | null;
}

const INITIAL: JobsSessionState = {
  handover: null,
  saved: [],
  runs: {},
  trials: {},
  intended: {},
  changeRequest: null,
};

export const jobsSession = createMemoryStore<JobsSessionState>(INITIAL);

/** The folder page hands its folder to the add flow (12.1). */
export const handOverSource = (uuid: string): void =>
  jobsSession.set({ handover: uuid });

/** The folder handed over to the add form, read without taking it (a render may run twice). */
export const handedOverSource = (): string | null =>
  jobsSession.getState().handover;

/** The add form has taken the handed-over folder: it is not offered again. */
export const clearHandover = (): void =>
  jobsSession.set((s) => (s.handover === null ? {} : { handover: null }));

export const recordJobSaved = (uuid: string): void =>
  jobsSession.set((s) =>
    s.saved.includes(uuid) ? {} : { saved: [...s.saved, uuid] },
  );

/** Once `rsync` is no longer pending (applied or undone), the marks go. */
export function forgetJobsPending(pending: readonly string[]): void {
  if (pending.includes("rsync")) {
    return;
  }
  jobsSession.set((s) => (s.saved.length === 0 ? {} : { saved: [] }));
}

/** The pending mark beside a job: this session saved it and `rsync` is pending (0.3). */
export const jobPending = (
  state: Pick<JobsSessionState, "saved">,
  uuid: string,
  pending: readonly string[],
): boolean => state.saved.includes(uuid) && pending.includes("rsync");

export const recordRun = (uuid: string, taskId: number): void =>
  jobsSession.set((s) => ({ runs: { ...s.runs, [uuid]: taskId } }));

export const recordTrial = (uuid: string, trial: SeenTrial): void =>
  jobsSession.set((s) => ({ trials: { ...s.trials, [uuid]: trial } }));

export const recordIntended = (uuid: string, onSchedule: boolean): void =>
  jobsSession.set((s) => ({ intended: { ...s.intended, [uuid]: onSchedule } }));

/** The list's "Change…" opens the job's page with its form open. */
export const requestChange = (uuid: string): void =>
  jobsSession.set({ changeRequest: uuid });

/** Whether the list asked for this job's form to open (read without taking it). */
export const changeRequested = (uuid: string): boolean =>
  jobsSession.getState().changeRequest === uuid;

/** The job's page has opened its form: the request is not acted on again. */
export const clearChangeRequest = (): void =>
  jobsSession.set((s) =>
    s.changeRequest === null ? {} : { changeRequest: null },
  );
