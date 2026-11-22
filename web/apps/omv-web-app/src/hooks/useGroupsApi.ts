// SPDX-License-Identifier: GPL-3.0-or-later
// The calls of the groups and home-folder pages (phase 5 users design 8 to 12), from the generated
// hooks. The reads are the users slice's shared ones (useUsersReads: the whole lists, the one-name
// reads made immediately before a write, 0.11, and the home-folder setting); this adds the writes. A
// run that outlives a page keeps the functions it started with (pattern useSharesApi.ts). Every write
// here is marked x-omv-dirty in the contract where OMV marks something, so the pending-changes reads
// are refreshed centrally. Nothing retries (UI-14).
import {
  useUserMgmtDeleteGroup,
  useUserMgmtSetGroup,
  useUserMgmtSetSettings,
  type HomeFolderSettings,
  type UserGroupSaved,
  type UserMgmtSetGroupRequest,
  type UserMgmtSetSettingsRequest,
} from "@omv-webui/react-api-omv/generated";
import { useQueryClient } from "@tanstack/react-query";
import { useFsApi } from "./useFsApi.ts";
import {
  usersRereads,
  useUsersRereads,
  type UsersRereads,
} from "./useUsersReads.ts";

/** The home-folder setting (12.2), the users slice's shared entry. */
export { useHomeSettings } from "./useUsersReads.ts";

export type GroupsRereads = UsersRereads;
export const groupsRereads = usersRereads;
export const useGroupsRereads = useUsersRereads;

export interface GroupsApi extends GroupsRereads {
  /** UserMgmt.setGroup: makes the group when no group has that name, else rewrites it (0.11). */
  setGroup(request: UserMgmtSetGroupRequest): Promise<UserGroupSaved>;
  /** UserMgmt.deleteGroup: refused while it has members (11). */
  deleteGroup(name: string): Promise<unknown>;
  /** UserMgmt.setSettings: both fields, inside the request for every person (12.1). */
  setHomeSettings(
    settings: UserMgmtSetSettingsRequest,
  ): Promise<HomeFolderSettings>;
  /** Config.applyChangesBg, as a task start (the runs' checkpoint, R10). */
  apply(): () => Promise<string>;
  /** Config.revertChangesBg, as a task start (the pre-flight's "Undo them"). */
  revert(): () => Promise<string>;
}

export function useGroupsApi(): GroupsApi {
  const queryClient = useQueryClient();
  const fsApi = useFsApi();
  const setGroup = useUserMgmtSetGroup();
  const deleteGroup = useUserMgmtDeleteGroup();
  const setSettings = useUserMgmtSetSettings();
  return {
    ...usersRereads(queryClient),
    setGroup: (request) => setGroup.mutateAsync({ data: request }),
    deleteGroup: (name) => deleteGroup.mutateAsync({ data: { name } }),
    setHomeSettings: (settings) => setSettings.mutateAsync({ data: settings }),
    apply: () => fsApi.apply({ modules: [], force: false }),
    revert: () => fsApi.revert(),
  };
}
