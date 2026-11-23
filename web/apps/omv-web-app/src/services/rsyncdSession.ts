// SPDX-License-Identifier: GPL-3.0-or-later
// What the rsync server tab keeps in memory for the session (phase 5 services design 0.9, 0.10): whether
// it saved the on or off switch, the folders whose offer it saved since the last apply (the pending
// mark beside their row), and the action running on each folder (one at a time). In memory only
// (UI-13); emptied when the session ends (app.ts). Folders are kept by their `uuid`, an identifier the
// server gave.
import { createMemoryStore } from "../shell/memoryStore.ts";
import { RSYNCD_MODULE } from "./rsyncdModel.ts";

export type RsyncdAction = "offer" | "change" | "stop";

export interface RsyncdSessionState {
  /** The tab saved the switch since the last apply. */
  switchSaved: boolean;
  /** Folders whose offer was saved (offered, changed) since the last apply, by folder `uuid`. */
  saved: readonly string[];
  /** The action this session is running on a folder's offer, by folder `uuid`. */
  running: Readonly<Record<string, RsyncdAction>>;
}

const INITIAL: RsyncdSessionState = {
  switchSaved: false,
  saved: [],
  running: {},
};

export const rsyncdSession = createMemoryStore<RsyncdSessionState>(INITIAL);

export const recordSwitchSaved = (): void =>
  rsyncdSession.set((s) => (s.switchSaved ? {} : { switchSaved: true }));

export const recordModuleSaved = (folderUuid: string): void =>
  rsyncdSession.set((s) =>
    s.saved.includes(folderUuid) ? {} : { saved: [...s.saved, folderUuid] },
  );

/** Once `rsyncd` is not pending any more (an apply or an undo ran), the marks are forgotten. */
export function forgetRsyncdPending(pending: readonly string[]): void {
  if (pending.includes(RSYNCD_MODULE)) {
    return;
  }
  rsyncdSession.set((s) =>
    !s.switchSaved && s.saved.length === 0
      ? {}
      : { switchSaved: false, saved: [] },
  );
}

/** Mark a folder's offer as being changed; false when an action on it already runs (0.10). */
export function beginRsyncdAction(
  folderUuid: string,
  action: RsyncdAction,
): boolean {
  if (rsyncdSession.getState().running[folderUuid] !== undefined) {
    return false;
  }
  rsyncdSession.set((s) => ({
    running: { ...s.running, [folderUuid]: action },
  }));
  return true;
}

export const endRsyncdAction = (folderUuid: string): void =>
  rsyncdSession.set((s) => {
    if (s.running[folderUuid] === undefined) {
      return {};
    }
    const { [folderUuid]: _done, ...running } = s.running;
    return { running };
  });

/** The pending mark beside the switch line (0.9). */
export const rsyncdSwitchPending = (
  state: Pick<RsyncdSessionState, "switchSaved">,
  pending: readonly string[],
): boolean => state.switchSaved && pending.includes(RSYNCD_MODULE);

/** The pending mark beside a folder's row (0.9). */
export const moduleRowPending = (
  state: Pick<RsyncdSessionState, "saved">,
  folderUuid: string,
  pending: readonly string[],
): boolean =>
  state.saved.includes(folderUuid) && pending.includes(RSYNCD_MODULE);
