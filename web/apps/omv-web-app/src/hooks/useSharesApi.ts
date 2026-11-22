// SPDX-License-Identifier: GPL-3.0-or-later
// The calls the shares actions make, from the generated hooks, gathered for the runs that outlive a
// page (the add flow, a deletion; pattern useZfsApi.ts) and for the dialogs' re-checks. A run keeps
// the functions it started with; a mutation started after its page went still runs. Every write here
// is marked x-omv-dirty in the contract, so the pending-changes reads are refreshed centrally (the
// query client's wiring, react-api-omv/query.ts), never per page. Nothing here retries (UI-14).
//
// Applying and undoing are the file-systems slice's (useFsApi: apply, revert, pending), which a run
// takes beside this one, as the ZFS deletions do.
import {
  useShareMgmtDelete,
  useShareMgmtSet,
  useShareMgmtSetPrivileges,
  useSmbDeleteShare,
  useSmbSetSettings,
  useSmbSetShare,
  type SharedFolderPrivilegeEntry,
  type SharedFolderSaved,
  type ShareMgmtSetRequest,
  type SmbSetSettingsRequest,
  type SmbSetShareRequest,
  type SmbSettings,
  type SmbShare,
} from "@omv-webui/react-api-omv/generated";
import { useQueryClient } from "@tanstack/react-query";
import { sharesRereads, type SharesRereads } from "./useSharesReads.ts";

export interface SharesApi extends SharesRereads {
  /** ShareMgmt.set: a new folder (the new-object UUID) or a change; makes the folder on the disk. */
  setFolder(request: ShareMgmtSetRequest): Promise<SharedFolderSaved>;
  /** ShareMgmt.setPrivileges: the whole list, which replaces the stored one. */
  setPrivileges(
    uuid: string,
    privileges: SharedFolderPrivilegeEntry[],
  ): Promise<SharedFolderSaved>;
  /**
   * ShareMgmt.delete: `recursive` false removes the record and keeps every file; true deletes the
   * folder and everything in it first, inside the request (it may take long).
   */
  deleteFolder(uuid: string, recursive: boolean): Promise<SharedFolderSaved>;
  /** SMB.setSettings: the whole getSettings reply with only `enable` changed (smbModel). */
  setSmbSettings(request: SmbSetSettingsRequest): Promise<SmbSettings>;
  /** SMB.setShare: a new share or a changed one (smbModel's builders). */
  setShare(request: SmbSetShareRequest): Promise<SmbShare>;
  /** SMB.deleteShare: removes the share's record only. */
  deleteShare(uuid: string): Promise<SmbShare>;
}

export function useSharesApi(): SharesApi {
  const queryClient = useQueryClient();
  const set = useShareMgmtSet();
  const setPrivileges = useShareMgmtSetPrivileges();
  const del = useShareMgmtDelete();
  const setSettings = useSmbSetSettings();
  const setShare = useSmbSetShare();
  const deleteShare = useSmbDeleteShare();
  return {
    ...sharesRereads(queryClient),
    setFolder: (request) => set.mutateAsync({ data: request }),
    setPrivileges: (uuid, privileges) =>
      setPrivileges.mutateAsync({ data: { uuid, privileges } }),
    deleteFolder: (uuid, recursive) =>
      del.mutateAsync({ data: { uuid, recursive } }),
    setSmbSettings: (request) => setSettings.mutateAsync({ data: request }),
    setShare: (request) => setShare.mutateAsync({ data: request }),
    deleteShare: (uuid) => deleteShare.mutateAsync({ data: { uuid } }),
  };
}
