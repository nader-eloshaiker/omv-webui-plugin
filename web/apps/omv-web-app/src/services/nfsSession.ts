// SPDX-License-Identifier: GPL-3.0-or-later
// What the NFS pages keep in memory for the session (phase 5 services design 0.3, 0.9, 0.10): whether
// the NFS page saved the on or off switch, the folders whose entries this session saved (the pending
// mark: "Not applied yet." beside a folder's NFS section and its rows on the NFS page, while `nfs` is
// pending), and the NFS action running on each folder (one at a time, 0.10's last row). In memory
// only (UI-13); emptied when the session ends (app.ts). Folders are kept by their `uuid`.
import { createMemoryStore } from "../shell/memoryStore.ts";
import { NFS_MODULE } from "./nfsModel.ts";

/** What this session may be doing to a folder's NFS entries. */
export type NfsAction = "letIn" | "change" | "stop";

export interface NfsSessionState {
  /** The NFS page, or a save that turned NFS on, saved the switch since the last apply. */
  switchSaved: boolean;
  /** The folders whose entries were saved since the last apply, by `uuid`. */
  saved: readonly string[];
  /** The action running on a folder's entries, by folder `uuid`. */
  running: Readonly<Record<string, NfsAction>>;
}

const INITIAL: NfsSessionState = { switchSaved: false, saved: [], running: {} };

export const nfsSession = createMemoryStore<NfsSessionState>(INITIAL);

/** The switch was saved (on or off). */
export const recordNfsSwitch = (): void =>
  nfsSession.set((s) => (s.switchSaved ? {} : { switchSaved: true }));

/** A folder's entries were saved (let in, changed, stopped). */
export const recordNfsSaved = (folderUuid: string): void =>
  nfsSession.set((s) =>
    s.saved.includes(folderUuid) ? {} : { saved: [...s.saved, folderUuid] },
  );

/** Once `nfs` is not pending any more (an apply or an undo ran), the marks are forgotten. */
export function forgetNfsPending(pending: readonly string[]): void {
  if (pending.includes(NFS_MODULE)) {
    return;
  }
  nfsSession.set((s) =>
    s.saved.length === 0 && !s.switchSaved
      ? {}
      : { saved: [], switchSaved: false },
  );
}

/** The switch's pending mark (1.2 item 3). */
export const nfsSwitchPending = (
  state: Pick<NfsSessionState, "switchSaved">,
  pending: readonly string[],
): boolean => state.switchSaved && pending.includes(NFS_MODULE);

/** A folder's pending mark (0.9). */
export const nfsFolderPending = (
  state: Pick<NfsSessionState, "saved">,
  folderUuid: string,
  pending: readonly string[],
): boolean => state.saved.includes(folderUuid) && pending.includes(NFS_MODULE);

/** Mark a folder's entries as being changed; false when an NFS action on it already runs. */
export function beginNfsAction(folderUuid: string, action: NfsAction): boolean {
  if (nfsSession.getState().running[folderUuid] !== undefined) {
    return false;
  }
  nfsSession.set((s) => ({ running: { ...s.running, [folderUuid]: action } }));
  return true;
}

export const endNfsAction = (folderUuid: string): void =>
  nfsSession.set((s) => {
    if (s.running[folderUuid] === undefined) {
      return {};
    }
    const { [folderUuid]: _done, ...running } = s.running;
    return { running };
  });
