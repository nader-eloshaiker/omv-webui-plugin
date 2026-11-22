// SPDX-License-Identifier: GPL-3.0-or-later
// The calls the users pages and flows make, from the generated hooks, gathered for the runs that
// outlive a page (adding and deleting a person; pattern useSharesApi.ts) and for the sections' saves.
// A run keeps the functions it started with; a mutation started after its page went still runs. Every
// write here is marked x-omv-dirty in the contract, so the pending-changes reads are refreshed
// centrally (react-api-omv/query.ts), never per page. Nothing here retries (UI-14).
//
// The password goes only into setUser's request, through the transport; its reply has no password
// (x-omv-omit). The caller clears its own copy as soon as the request returns (0.7, UI-6).
import {
  useShareMgmtSetPrivileges,
  useUserMgmtDeleteUser,
  useUserMgmtSetUser,
  type SharedFolderPrivilegeEntry,
  type SharedFolderSaved,
  type UserAccount,
  type UserMgmtSetUserRequest,
  type UserSaved,
} from "@omv-webui/react-api-omv/generated";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { usersRereads, type UsersRereads } from "./useUsersReads.ts";

export interface UsersApi extends UsersRereads {
  /** UserMgmt.setUser: makes the account when no account has the name, else changes it (0.11). */
  setUser(request: UserMgmtSetUserRequest): Promise<UserSaved>;
  /** UserMgmt.deleteUser: the account, OMV's record and the SMB entry; no file (7). */
  deleteUser(name: string): Promise<UserAccount>;
  /** ShareMgmt.setPrivileges: the whole list, which replaces the stored one. */
  setPrivileges(
    uuid: string,
    privileges: SharedFolderPrivilegeEntry[],
  ): Promise<SharedFolderSaved>;
}

export function useUsersApi(): UsersApi {
  const queryClient = useQueryClient();
  const setUser = useUserMgmtSetUser();
  const deleteUser = useUserMgmtDeleteUser();
  const setPrivileges = useShareMgmtSetPrivileges();
  const rereads = useMemo(() => usersRereads(queryClient), [queryClient]);
  return {
    ...rereads,
    setUser: (request) => setUser.mutateAsync({ data: request }),
    deleteUser: (name) => deleteUser.mutateAsync({ data: { name } }),
    setPrivileges: (uuid, privileges) =>
      setPrivileges.mutateAsync({ data: { uuid, privileges } }),
  };
}
