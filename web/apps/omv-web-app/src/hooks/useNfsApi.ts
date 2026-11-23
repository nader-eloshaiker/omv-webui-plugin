// SPDX-License-Identifier: GPL-3.0-or-later
// The NFS writes (phase 5 services design 0.11), from the generated hooks, with the re-reads they are
// made after. Every write here is marked x-omv-dirty in the contract, so the pending-changes reads are
// refreshed centrally (react-api-omv/query.ts), never here. Nothing retries (UI-14).
import {
  useNfsDeleteShare,
  useNfsSetSettings,
  useNfsSetShare,
  type NfsSetSettingsRequest,
  type NfsSetShareRequest,
  type NfsSettingsSaved,
  type NfsShare,
} from "@omv-webui/react-api-omv/generated";
import { useQueryClient } from "@tanstack/react-query";
import { nfsRereads, type NfsRereads } from "./useNfsReads.ts";

export interface NfsApi extends NfsRereads {
  /** NFS.setSettings: `enable` and the versions as read (nfsModel.settingsRequest). Its reply is not read. */
  setSettings(request: NfsSetSettingsRequest): Promise<NfsSettingsSaved>;
  /** NFS.setShare: a new entry or a changed one (nfsModel's builders). */
  setShare(request: NfsSetShareRequest): Promise<NfsShare>;
  /** NFS.deleteShare: removes the entry; no file is touched. */
  deleteShare(uuid: string): Promise<unknown>;
}

export function useNfsApi(): NfsApi {
  const queryClient = useQueryClient();
  const setSettings = useNfsSetSettings();
  const setShare = useNfsSetShare();
  const deleteShare = useNfsDeleteShare();
  return {
    ...nfsRereads(queryClient),
    setSettings: (request) => setSettings.mutateAsync({ data: request }),
    setShare: (request) => setShare.mutateAsync({ data: request }),
    deleteShare: (uuid) => deleteShare.mutateAsync({ data: { uuid } }),
  };
}
