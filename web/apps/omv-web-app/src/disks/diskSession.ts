// SPDX-License-Identifier: GPL-3.0-or-later
// What the disks pages keep in memory for the session (phase 5 disks design 12.3): the wipes started
// here and the self-tests started from "Run now", by the registry's id (never a handle, UI-5), and the
// "wiped at" marks. Keyed by the disk's stable device file from DiskMgmt.getList, because the kernel
// name can change. In memory only (UI-13); emptied when the session ends (app.ts).
//
// The health details a reader asked for live in the query cache instead (useDiskReads.ts): the
// generated query hooks, never enabled, read only by the reader's press, kept for the session.
import { createMemoryStore } from "../shell/memoryStore.ts";

export interface WipeRecord {
  /** The registry's id of the wipe task. */
  taskId: number;
  /** The disk's device name when the wipe started, for the panel's words ("/dev/sdb"). */
  device: string;
  /** The serial number the confirmation named. Shown on screen only. */
  serial: string;
  secure: boolean;
}

export interface TestStart {
  taskId: number;
  /** The canonical device file the test was started on. */
  device: string;
  /** The test's kind letter (S, L, C, O). */
  type: string;
  /** The disk's kernel name, when it passes the address pattern, for "Open the disk". */
  devicename: string | null;
}

export interface DiskSessionState {
  /** The last wipe started here for each disk, by its stable device file. */
  wipes: Readonly<Record<string, WipeRecord>>;
  /** When a wipe of each disk succeeded, by its stable device file. */
  wipedAt: Readonly<Record<string, number>>;
  /** Self-tests started from "Run now", newest last. */
  testStarts: readonly TestStart[];
}

const INITIAL: DiskSessionState = { wipes: {}, wipedAt: {}, testStarts: [] };

export const diskSession = createMemoryStore<DiskSessionState>(INITIAL);

export function recordWipe(devicefile: string, record: WipeRecord): void {
  diskSession.set((s) => ({ wipes: { ...s.wipes, [devicefile]: record } }));
}

export function forgetWipe(devicefile: string): void {
  diskSession.set((s) => {
    const { [devicefile]: _gone, ...rest } = s.wipes;
    return { wipes: rest };
  });
}

export function markWiped(devicefile: string, at: number): void {
  diskSession.set((s) => ({ wipedAt: { ...s.wipedAt, [devicefile]: at } }));
}

export function recordTestStart(start: TestStart): void {
  diskSession.set((s) => ({ testStarts: [...s.testStarts, start] }));
}

export function forgetTestStart(taskId: number): void {
  diskSession.set((s) => ({
    testStarts: s.testStarts.filter((t) => t.taskId !== taskId),
  }));
}
