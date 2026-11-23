// SPDX-License-Identifier: GPL-3.0-or-later
// Saving an NFS entry (phase 5 services design 2.3, 2.4, 1.4; 0.10, 0.11): re-read the entries, the
// settings and the folders immediately before the write; check 0.10 again on what was just read; then
// NFS.setShare (a new entry, or the stored one with only who may connect and access changed) and,
// when NFS is off, NFS.setSettings with `enable` true in the same save. When the entry is saved but
// turning NFS on fails, the outcome says so and `turnOn` retries only that second call.
//
// One NFS action per folder at a time in this session (0.10); the session's pending marks are kept in
// nfsSession. The page shows each outcome; nothing here retries by itself (UI-14).
import type { ClientValue } from "../services/clientRules.ts";
import {
  changedShareRequest,
  entryRefusal,
  hasVersions,
  newShareRequest,
  settingsRequest,
  type AccessChoice,
  type EntryRefusal,
} from "../services/nfsModel.ts";
import {
  beginNfsAction,
  endNfsAction,
  recordNfsSaved,
  recordNfsSwitch,
} from "../services/nfsSession.ts";
import { useNfsApi, type NfsApi } from "./useNfsApi.ts";

export type NfsSaveOutcome =
  | { kind: "saved"; uuid: string; client: string; turnedOn: boolean }
  | { kind: "refused"; refusal: EntryRefusal }
  /** Another NFS action on this folder is still running in this session. */
  | { kind: "running" }
  | { kind: "failed"; error: unknown }
  /** The entry is saved; turning NFS on failed. */
  | { kind: "turnOnFailed"; error: unknown; uuid: string; client: string };

export interface NfsSaveInput {
  folderUuid: string;
  /** Whether the folder is OK as its page reads it (its file system too). */
  ok?: boolean;
  /** The entry being changed; none for a new one. */
  entryUuid?: string;
  value: ClientValue;
  access: AccessChoice;
}

/** After a save, the lists read again so the page shows what is stored now. */
const reread = (api: NfsApi) =>
  Promise.all([api.shares(), api.settings()]).catch(() => undefined);

export async function saveNfsEntry(
  api: NfsApi,
  input: NfsSaveInput,
): Promise<NfsSaveOutcome> {
  if (
    !beginNfsAction(
      input.folderUuid,
      input.entryUuid === undefined ? "letIn" : "change",
    )
  ) {
    return { kind: "running" };
  }
  try {
    let folders, shares, settings;
    try {
      [folders, shares, settings] = await Promise.all([
        api.folders(),
        api.shares(),
        api.settings(),
      ]);
    } catch (error) {
      return { kind: "failed", error };
    }
    const checked = entryRefusal({
      folderUuid: input.folderUuid,
      folders,
      ok: input.ok,
      shares,
      settings,
      value: input.value,
      exceptUuid: input.entryUuid,
    });
    if ("refusal" in checked) {
      return { kind: "refused", refusal: checked.refusal };
    }
    let uuid: string;
    try {
      if (input.entryUuid === undefined) {
        const saved = await api.setShare(
          newShareRequest(input.folderUuid, checked.client, input.access),
        );
        uuid = saved.uuid;
      } else {
        const stored = await api.share(input.entryUuid);
        const saved = await api.setShare(
          changedShareRequest(stored, {
            client: checked.client,
            options: input.access,
          }),
        );
        uuid = saved.uuid;
      }
    } catch (error) {
      await reread(api);
      return { kind: "failed", error };
    }
    recordNfsSaved(input.folderUuid);
    if (!settings.enable) {
      try {
        await api.setSettings(settingsRequest(settings, true));
        recordNfsSwitch();
      } catch (error) {
        await reread(api);
        return { kind: "turnOnFailed", error, uuid, client: checked.client };
      }
    }
    await reread(api);
    return {
      kind: "saved",
      uuid,
      client: checked.client,
      turnedOn: !settings.enable,
    };
  } finally {
    endNfsAction(input.folderUuid);
  }
}

/**
 * NFS.setSettings with `enable` true, from the settings read just before: the second call of a save
 * that turns NFS on, tried again on its own (2.3), or the NFS page's Turn on (1.3). Refused without a
 * version chosen.
 */
export async function turnNfsOn(
  api: NfsApi,
): Promise<
  { ok: true } | { ok: false; error: unknown } | { ok: false; noVersions: true }
> {
  try {
    const now = await api.settings();
    if (now.enable) {
      return { ok: true };
    }
    if (!hasVersions(now)) {
      return { ok: false, noVersions: true };
    }
    await api.setSettings(settingsRequest(now, true));
    recordNfsSwitch();
    await reread(api);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export function useNfsEntrySave() {
  const api = useNfsApi();
  return {
    save: (input: NfsSaveInput) => saveNfsEntry(api, input),
    turnOn: () => turnNfsOn(api),
  };
}
