// SPDX-License-Identifier: GPL-3.0-or-later
// What the file-system pages keep in memory for the session (phase 5 file-systems design 13.3): the
// disk handed to Flow A from a disk's page (never in the address, D17), the file systems this session
// created (1.6, 2.4), and the file systems whose settings this session saved since the last apply
// (0.7). In memory only (UI-13); emptied when the session ends (app.ts). The technical details live in
// the query cache instead (useFsReads.ts), as the disks slice keeps its health details.
import { createMemoryStore } from "../shell/memoryStore.ts";

export interface FsSessionState {
  /** The stable device file of the disk a disk's page handed to Flow A; taken once by the flow. */
  handoff: string | null;
  /** The devices this session created a file system on (stable device files of the disks). */
  createdOn: readonly string[];
  /** The UUIDs of the file systems this session created, once found. */
  created: readonly string[];
  /** The UUIDs of the file systems whose warning level or tags this session saved. */
  settingsSaved: readonly string[];
}

const INITIAL: FsSessionState = {
  handoff: null,
  createdOn: [],
  created: [],
  settingsSaved: [],
};

export const fsSession = createMemoryStore<FsSessionState>(INITIAL);

/** A disk's page hands its disk to Flow A ("Add storage on this disk"). */
export const handOffDisk = (devicefile: string): void =>
  fsSession.set({ handoff: devicefile });

/** Flow A takes the handed disk once; opened again, or by its address, it starts with none. */
export function takeHandoff(): string | null {
  const { handoff } = fsSession.getState();
  if (handoff !== null) {
    fsSession.set({ handoff: null });
  }
  return handoff;
}

export const recordCreatedOn = (devicefiles: readonly string[]): void =>
  fsSession.set((s) => ({
    createdOn: [...new Set([...s.createdOn, ...devicefiles])],
  }));

export const recordCreated = (uuid: string): void =>
  fsSession.set((s) =>
    s.created.includes(uuid) ? {} : { created: [...s.created, uuid] },
  );

export const recordSettingsSaved = (uuid: string): void =>
  fsSession.set((s) =>
    s.settingsSaved.includes(uuid)
      ? {}
      : { settingsSaved: [...s.settingsSaved, uuid] },
  );

/** Once nothing of the settings is pending any more, the marks are forgotten. */
export const forgetSettingsSaved = (): void =>
  fsSession.set((s) =>
    s.settingsSaved.length === 0 ? {} : { settingsSaved: [] },
  );
