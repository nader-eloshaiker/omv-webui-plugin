// SPDX-License-Identifier: GPL-3.0-or-later
// What a shared folder's page reads (phase 5 shares design 2.1), in parallel, and what it makes of
// them: the folder's row from the whole-list ShareMgmt.getList, found by the validated address with
// an exact match (every later call uses the row's fields, never the address, UI-4); its file system;
// its SMB share; the state of Windows and Mac sharing; the people and groups for the access grid.
//
// Read on opening, on Refresh, after an action this page started, and on window focus, but never on
// focus while the page holds unsaved changes (`focus` false): the reader's work is not overwritten.
import { useState } from "react";
import {
  folderFs,
  folderState,
  folderTodo,
} from "../sharedFolders/shareActions.ts";
import { shareOf, smbOn, smbState } from "../sharedFolders/smbModel.ts";
import { useHomeSettings } from "./useGroupsApi.ts";
import {
  useSharedFoldersAll,
  useShareFileSystems,
  useShareServices,
  useSharesSystem,
  useSmbSettings,
  useSmbShares,
  useUserAccounts,
  useUserGroups,
} from "./useSharesReads.ts";

export function useSharedFolderView(address: string, focus: boolean) {
  const options = { enabled: true, focus };
  const folders = useSharedFoldersAll(options);
  const shares = useSmbShares(options);
  const settings = useSmbSettings(options);
  const services = useShareServices(options);
  const users = useUserAccounts(options);
  const groups = useUserGroups(options);
  const fileSystems = useShareFileSystems(options);
  // Whether the folder holds the home folders (phase 5 users design 13.1): Used by and the delete.
  const home = useHomeSettings(options);
  const system = useSharesSystem();
  const [refreshing, setRefreshing] = useState(false);

  const pending = system.pending ?? [];
  const row = folders.data?.data.find((f) => f.uuid === address);
  const fs =
    row === undefined || fileSystems.data === undefined
      ? undefined
      : folderFs(row, fileSystems.data.data);
  const share =
    row === undefined || shares.data === undefined
      ? undefined
      : shareOf(shares.data.data, row.uuid);
  const smb = smbState(
    {
      data: settings.data,
      failed: settings.isError && settings.data === undefined,
      error: settings.error,
    },
    {
      data: services.data?.data,
      failed: services.isError && services.data === undefined,
      error: services.error,
    },
    pending,
  );
  const state = row === undefined ? undefined : folderState(row, fs, pending);
  const todo =
    row === undefined
      ? null
      : folderTodo({
          folder: row,
          fs,
          share: shares.data === undefined ? undefined : share,
          smbOn: smbOn(smb),
          smbDown: smb.kind === "down",
          pending,
        });

  /** Every read again, at once; the page stays as it is meanwhile (2.7, "Refreshing"). */
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        folders.refetch(),
        shares.refetch(),
        settings.refetch(),
        services.refetch(),
        users.refetch(),
        groups.refetch(),
        fileSystems.refetch(),
        home.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  return {
    folders,
    shares,
    settings,
    services,
    users,
    groups,
    fileSystems,
    home,
    system,
    pending,
    row,
    fs,
    share,
    smb,
    state,
    todo,
    refresh,
    refreshing,
  };
}

export type SharedFolderView = ReturnType<typeof useSharedFolderView>;
