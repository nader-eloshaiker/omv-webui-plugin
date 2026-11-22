// SPDX-License-Identifier: GPL-3.0-or-later
// The users and groups pages' reads (phase 5 users design 1.1, 2.1, 6.1, 8.1, 9.1, 12.2), one set of
// parameters each, so the lists, a person's or group's page, the add flows, the shares pages and the
// SSH page share one cache entry per read. Nothing polls: each is read when a page opens, on Refresh,
// after an action, and on window focus where the design says so, which a page turns off while it
// holds unsaved changes (2.1). Every read here is administrator-only; a normal user's page makes none.
//
// The people and group lists are the shares slice's entries (useSharesReads: the whole list, the five
// paging fields, `limit` null), so the access grid and these pages never read them twice.
//
// The re-reads (usersRereads) are fresh foreground reads whose replies land in the same cache entries:
// the design's "read immediately before the write" (0.11, R4), the add flows' name check, and Refresh.
import {
  getSshGetQueryOptions,
  getUserMgmtGetGroupQueryOptions,
  getUserMgmtGetSettingsQueryOptions,
  getUserMgmtGetUserQueryOptions,
  useSshGet,
  useUserMgmtGetGroup,
  useUserMgmtGetSettings,
  type HomeFolderSettings,
  type SshSettings,
  type UserAccount,
  type UserGroup,
} from "@omv-webui/react-api-omv/generated";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { isMissing, type GroupCheck } from "../users/personPage.ts";
import {
  sharesRereads,
  useShareServices,
  useUserAccounts,
  useUserGroups,
  type SharesReadOptions,
  type SharesRereads,
} from "./useSharesReads.ts";

export type UsersReadOptions = SharesReadOptions;

/** Read on opening a page, on Refresh and after an action; on focus only when asked. */
function onOpen({ enabled = true, focus = false }: UsersReadOptions) {
  return {
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: focus ? "always" : false,
    refetchOnReconnect: false,
    staleTime: Number.POSITIVE_INFINITY,
  } as const;
}

/** Every person OMV lists (not system accounts, not the built-in admin): the shares slice's entry. */
export const usePeople = (options: UsersReadOptions = {}) =>
  useUserAccounts(options);

/** Every group OMV lists (not system groups): the shares slice's entry. */
export const useGroups = (options: UsersReadOptions = {}) =>
  useUserGroups(options);

/** SSH's settings, for 0.3's SSH words (the SSH page's entry). */
export const useSshSettings = (options: UsersReadOptions = {}) =>
  useSshGet({ query: onOpen(options) });

/** Which services are on and running, for the `ssh` row (0.3): the shares slice's entry. */
export const useUsersServices = (options: UsersReadOptions = {}) =>
  useShareServices(options);

/** The home-folder setting (12.2). */
export const useHomeSettings = (options: UsersReadOptions = {}) =>
  useUserMgmtGetSettings({ query: onOpen(options) });

/**
 * One group by name, system groups included: the two privilege groups of section 3 (`_ssh`,
 * `openmediavault-admin`), read with the section. A missing group answers "does not exist" (an error).
 */
export const useGroupByName = (name: string, options: UsersReadOptions = {}) =>
  useUserMgmtGetGroup(
    { name },
    { query: { ...onOpen(options), retry: false } },
  );

export interface UsersRereads extends SharesRereads {
  /** UserMgmt.getUser, fresh: the row immediately before a write (0.11), the name check (6.4). */
  user(name: string): Promise<UserAccount>;
  /** UserMgmt.getGroup, fresh, system groups included. */
  group(name: string): Promise<UserGroup>;
  /** SSH.get, fresh. */
  ssh(): Promise<SshSettings>;
  /** UserMgmt.getSettings, fresh. */
  homeSettings(): Promise<HomeFolderSettings>;
}

/** The re-reads on a given query client, for the runs that outlive a page (useUsersApi). */
export function usersRereads(queryClient: QueryClient): UsersRereads {
  const fresh = { staleTime: 0, retry: false } as const;
  const shares = sharesRereads(queryClient);
  return {
    ...shares,
    user: (name) =>
      queryClient.fetchQuery({
        ...getUserMgmtGetUserQueryOptions({ name }),
        ...fresh,
      }),
    group: (name) =>
      queryClient.fetchQuery({
        ...getUserMgmtGetGroupQueryOptions({ name }),
        ...fresh,
      }),
    ssh: () => queryClient.fetchQuery({ ...getSshGetQueryOptions(), ...fresh }),
    homeSettings: () =>
      queryClient.fetchQuery({
        ...getUserMgmtGetSettingsQueryOptions(),
        ...fresh,
      }),
  };
}

/** The re-reads for a page or a dialog's check. */
export function useUsersRereads(): UsersRereads {
  const queryClient = useQueryClient();
  return useMemo(() => usersRereads(queryClient), [queryClient]);
}

/**
 * How the read of a privilege group stands for section 3 (3.6): read, missing on the NAS (OMV's
 * "does not exist", 0.10's refusal), or failed otherwise (the server's words and "Try again").
 */
export function useGroupCheck(
  name: string,
  options: UsersReadOptions = {},
): GroupCheck {
  const read = useGroupByName(name, options);
  if (read.data !== undefined) {
    return { kind: "ok" };
  }
  if (read.isError) {
    return isMissing(read.error, "group", name)
      ? { kind: "missing" }
      : {
          kind: "failed",
          error: read.error,
          retry: () => void read.refetch(),
          retrying: read.isFetching,
        };
  }
  return { kind: "loading" };
}
