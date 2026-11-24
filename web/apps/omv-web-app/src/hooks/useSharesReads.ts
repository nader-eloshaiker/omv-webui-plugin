// SPDX-License-Identifier: GPL-3.0-or-later
// The shares pages' reads (phase 5 shares design 1.1, 2.1, 5.1, 6.1), one set of parameters each, so
// the list, a folder's page, the add flow and the SMB page share one cache entry per read. Nothing
// polls: each is read when a page opens, on Refresh, after an action, and on window focus where the
// design says so (a change made in the classic tab shows on return), which a page turns off while it
// holds unsaved changes (2.1). Every read here is administrator-only; a normal user's page makes none.
//
// Paging reads send all five fields with `limit` null for the whole list (design 11.2); the file
// systems use the dashboard's whole-list parameters so that entry is shared too.
//
// The re-reads (sharesRereads) are fresh foreground reads whose replies land in the same cache
// entries: the design's "read immediately before the write" (0.10, R4), and Refresh.
import {
  getFileSystemMgmtGetListQueryOptions,
  getServicesGetStatusQueryOptions,
  getShareMgmtGetCandidatesQueryOptions,
  getShareMgmtGetListQueryOptions,
  getSmbGetSettingsQueryOptions,
  getSmbGetShareListQueryOptions,
  getSmbGetShareQueryOptions,
  getSystemGetInformationQueryOptions,
  getUserMgmtGetGroupListQueryOptions,
  getUserMgmtGetUserListQueryOptions,
  useFileSystemMgmtGetList,
  useServicesGetStatus,
  useShareMgmtGetCandidates,
  useShareMgmtGetList,
  useSmbGetSettings,
  useSmbGetShareList,
  useUserMgmtGetGroupList,
  useUserMgmtGetUserList,
  type ConfiguredFilesystem,
  type GetListRequest,
  type ServiceStatus,
  type ShareCandidate,
  type SharedFolder,
  type SmbSettings,
  type SmbShare,
  type SmbShareRow,
  type UserAccount,
  type UserGroup,
  type UserMgmtGetUserListRequest,
} from "@omv-webui/react-api-omv/generated";
import {
  CancelledError,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { pendingModules } from "../pending/modules.ts";
import { ALL_ROWS } from "../sharedFolders/table.ts";
import { ALL_CONFIGURED } from "./useMonitoringReads.ts";
import { useSystemInformation } from "./useSystemInformation.ts";

/** Every row of a list, in the server's order: the five paging fields, `limit` null (11.2). */
export const SHARES_ALL: GetListRequest = ALL_ROWS;
/** Every person; `detail` left to OMV's default, "basic" (the contract allows only that). */
export const ALL_USERS: UserMgmtGetUserListRequest = { ...ALL_ROWS };

export interface SharesReadOptions {
  /** False keeps the read from starting (a normal user, a folder address that failed its check). */
  enabled?: boolean;
  /** Read again when the window regains focus (1.1, 2.1, 5.1); off while the page holds unsaved work. */
  focus?: boolean;
}

/** Read on opening a page, on Refresh and after an action; on focus only when asked. */
function onOpen({ enabled = true, focus = false }: SharesReadOptions) {
  return {
    enabled,
    refetchOnMount: "always",
    // Infinity keeps a read from going stale by time; "always" reads again on focus all the same.
    refetchOnWindowFocus: focus ? "always" : false,
    refetchOnReconnect: false,
    staleTime: Number.POSITIVE_INFINITY,
  } as const;
}

/** Every shared folder (the Shared folders page's whole-list entry, the roll-up's). */
export const useSharedFoldersAll = (options: SharesReadOptions = {}) =>
  useShareMgmtGetList(SHARES_ALL, { query: onOpen(options) });

/** Every SMB share, with its shared folder's name (1.1). Fails outright when a share's folder is gone. */
export const useSmbShares = (options: SharesReadOptions = {}) =>
  useSmbGetShareList(SHARES_ALL, { query: onOpen(options) });

/** The SMB settings, for whether Windows and Mac sharing is on (0.3). */
export const useSmbSettings = (options: SharesReadOptions = {}) =>
  useSmbGetSettings({ query: onOpen(options) });

/** The file systems that can hold a new shared folder, by mount entry (0.6). */
export const useShareCandidates = (options: SharesReadOptions = {}) =>
  useShareMgmtGetCandidates({ query: onOpen(options) });

/** Every person OMV lists (not system accounts; observed: not the web administrator account). */
export const useUserAccounts = (options: SharesReadOptions = {}) =>
  useUserMgmtGetUserList(ALL_USERS, { query: onOpen(options) });

/** Every group OMV lists (not system groups; observed: not `users`; empty on a stock NAS). */
export const useUserGroups = (options: SharesReadOptions = {}) =>
  useUserMgmtGetGroupList(SHARES_ALL, { query: onOpen(options) });

/** Every configured file system: the dashboard's and the file-systems pages' entry (0.3, 0.6). */
export const useShareFileSystems = (options: SharesReadOptions = {}) =>
  useFileSystemMgmtGetList(ALL_CONFIGURED, { query: onOpen(options) });

/** Which services are on and running, for the `samba` row (0.3). */
export const useShareServices = (options: SharesReadOptions = {}) =>
  useServicesGetStatus({ query: onOpen(options) });

/**
 * The pending modules and the NAS's name, from the shell's System.getInformation (its poll, shared):
 * `pending` undefined until read.
 */
export function useSharesSystem() {
  const info = useSystemInformation();
  const dirty = info.data?.dirtyModules;
  const pending = useMemo(
    () => (info.data === undefined ? undefined : pendingModules(dirty)),
    [info.data, dirty],
  );
  return {
    hostname: info.data?.hostname,
    pending,
    /** When the pending modules were read (the query's dataUpdatedAt). */
    readAt: info.dataUpdatedAt,
    failed: info.isError && info.data === undefined,
    error: info.error,
  };
}

/** Fresh reads, each landing in its shared cache entry (0.10's read before the write; Refresh). */
export interface SharesRereads {
  folders(): Promise<SharedFolder[]>;
  shares(): Promise<SmbShareRow[]>;
  settings(): Promise<SmbSettings>;
  /**
   * One SMB share as stored, read just before it is changed (services design 0.11, D12): narrower
   * than the list, and it does not fail when another share's folder is gone.
   */
  share(uuid: string): Promise<SmbShare>;
  candidates(): Promise<ShareCandidate[]>;
  users(): Promise<UserAccount[]>;
  groups(): Promise<UserGroup[]>;
  fileSystems(): Promise<ConfiguredFilesystem[]>;
  services(): Promise<ServiceStatus[]>;
  /** The pending modules, from System.getInformation. */
  pending(): Promise<string[]>;
  /** The NAS's name as System.getInformation reports it. */
  hostname(): Promise<string>;
}

/**
 * A read cancelled by the query client (a finished task refreshes every read, which cancels one in
 * flight) is read again: it says nothing about the server. A real failure is passed on.
 */
async function uncancelled<T>(read: () => Promise<T>, tries = 3): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof CancelledError && tries > 1) {
      return uncancelled(read, tries - 1);
    }
    throw error;
  }
}

/**
 * A fresh read whose reply is the server's now. Besides a cancelled read (uncancelled), a fetch the
 * query client cancels and reverts, because the page's last reader of that entry went away while it
 * ran (a flow's form giving way to its run), resolves with the data from before: that says nothing
 * about the server either, so the read is made again, at most twice more.
 */
export async function freshRead<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  read: () => Promise<T>,
  tries = 3,
): Promise<T> {
  const started = Date.now();
  const value = await uncancelled(read);
  const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
  if (updatedAt < started && tries > 1) {
    return freshRead(queryClient, queryKey, read, tries - 1);
  }
  return value;
}

/** The re-reads on a given query client, for the runs that outlive a page (useSharesApi). */
export function sharesRereads(queryClient: QueryClient): SharesRereads {
  const fresh = { staleTime: 0, retry: false } as const;
  const information = () =>
    freshRead(queryClient, getSystemGetInformationQueryOptions().queryKey, () =>
      queryClient.fetchQuery({
        ...getSystemGetInformationQueryOptions(),
        ...fresh,
      }),
    );
  return {
    folders: () =>
      freshRead(
        queryClient,
        getShareMgmtGetListQueryOptions(SHARES_ALL).queryKey,
        () =>
          queryClient
            .fetchQuery({
              ...getShareMgmtGetListQueryOptions(SHARES_ALL),
              ...fresh,
            })
            .then((l) => l.data),
      ),
    shares: () =>
      freshRead(
        queryClient,
        getSmbGetShareListQueryOptions(SHARES_ALL).queryKey,
        () =>
          queryClient
            .fetchQuery({
              ...getSmbGetShareListQueryOptions(SHARES_ALL),
              ...fresh,
            })
            .then((l) => l.data),
      ),
    settings: () =>
      freshRead(queryClient, getSmbGetSettingsQueryOptions().queryKey, () =>
        queryClient.fetchQuery({
          ...getSmbGetSettingsQueryOptions(),
          ...fresh,
        }),
      ),
    share: (uuid) =>
      queryClient.fetchQuery({
        ...getSmbGetShareQueryOptions({ uuid }),
        ...fresh,
        // Read for one write and not kept: nothing renders it.
        gcTime: 0,
      }),
    candidates: () =>
      freshRead(
        queryClient,
        getShareMgmtGetCandidatesQueryOptions().queryKey,
        () =>
          queryClient.fetchQuery({
            ...getShareMgmtGetCandidatesQueryOptions(),
            ...fresh,
          }),
      ),
    users: () =>
      freshRead(
        queryClient,
        getUserMgmtGetUserListQueryOptions(ALL_USERS).queryKey,
        () =>
          queryClient
            .fetchQuery({
              ...getUserMgmtGetUserListQueryOptions(ALL_USERS),
              ...fresh,
            })
            .then((l) => l.data),
      ),
    groups: () =>
      freshRead(
        queryClient,
        getUserMgmtGetGroupListQueryOptions(SHARES_ALL).queryKey,
        () =>
          queryClient
            .fetchQuery({
              ...getUserMgmtGetGroupListQueryOptions(SHARES_ALL),
              ...fresh,
            })
            .then((l) => l.data),
      ),
    fileSystems: () =>
      freshRead(
        queryClient,
        getFileSystemMgmtGetListQueryOptions(ALL_CONFIGURED).queryKey,
        () =>
          queryClient
            .fetchQuery({
              ...getFileSystemMgmtGetListQueryOptions(ALL_CONFIGURED),
              ...fresh,
            })
            .then((l) => l.data),
      ),
    services: () =>
      freshRead(queryClient, getServicesGetStatusQueryOptions().queryKey, () =>
        queryClient
          .fetchQuery({ ...getServicesGetStatusQueryOptions(), ...fresh })
          .then((l) => l.data),
      ),
    pending: () =>
      information().then((info) => pendingModules(info.dirtyModules)),
    hostname: () => information().then((info) => info.hostname),
  };
}

/** The re-reads for a page or a dialog's check. */
export function useSharesRereads(): SharesRereads {
  const queryClient = useQueryClient();
  return useMemo(() => sharesRereads(queryClient), [queryClient]);
}
