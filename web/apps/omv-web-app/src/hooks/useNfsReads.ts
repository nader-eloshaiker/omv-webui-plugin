// SPDX-License-Identifier: GPL-3.0-or-later
// The NFS reads (phase 5 services design 1.1, 2, 12.1), one set of parameters each, so the NFS page, a
// shared folder's page and the Shared folders list share one cache entry per read. Read on opening, on
// Refresh, after a save and, where asked, on window focus; nothing polls. Administrator-only, like
// every method here: a normal user's page makes none of these calls.
//
// The re-reads (nfsRereads) are fresh foreground reads landing in the same entries: the design's
// "read immediately before the write" (0.11, R4).
import {
  getNfsGetSettingsQueryOptions,
  getNfsGetShareListQueryOptions,
  getNfsGetShareQueryOptions,
  useNfsGetSettings,
  useNfsGetShareList,
  type NfsSettings,
  type NfsShare,
  type NfsShareRow,
} from "@omv-webui/react-api-omv/generated";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  freshRead,
  SHARES_ALL,
  sharesRereads,
  type SharesReadOptions,
  type SharesRereads,
} from "./useSharesReads.ts";

/** Read on opening a page, on Refresh and after an action; on focus only when asked. */
function onOpen({ enabled = true, focus = false }: SharesReadOptions) {
  return {
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: focus ? "always" : false,
    refetchOnReconnect: false,
    staleTime: Number.POSITIVE_INFINITY,
  } as const;
}

/** Whether Linux and Unix sharing is on, and its versions (0.3). */
export const useNfsSettings = (options: SharesReadOptions = {}) =>
  useNfsGetSettings({ query: onOpen(options) });

/**
 * Every NFS entry, with its shared folder's name (1.1). Fails as a whole when an entry names a shared
 * folder whose record is gone (read from source).
 */
export const useNfsShares = (options: SharesReadOptions = {}) =>
  useNfsGetShareList(SHARES_ALL, { query: onOpen(options) });

export interface NfsRereads extends Pick<
  SharesRereads,
  "folders" | "services" | "pending"
> {
  settings(): Promise<NfsSettings>;
  shares(): Promise<NfsShareRow[]>;
  /** One entry as stored, read just before it is changed (0.11). */
  share(uuid: string): Promise<NfsShare>;
}

const FRESH = { staleTime: 0, retry: false } as const;

export function nfsRereads(queryClient: QueryClient): NfsRereads {
  const shares = sharesRereads(queryClient);
  return {
    folders: shares.folders,
    services: shares.services,
    pending: shares.pending,
    settings: () =>
      freshRead(queryClient, getNfsGetSettingsQueryOptions().queryKey, () =>
        queryClient.fetchQuery({
          ...getNfsGetSettingsQueryOptions(),
          ...FRESH,
        }),
      ),
    shares: () =>
      freshRead(
        queryClient,
        getNfsGetShareListQueryOptions(SHARES_ALL).queryKey,
        () =>
          queryClient
            .fetchQuery({
              ...getNfsGetShareListQueryOptions(SHARES_ALL),
              ...FRESH,
            })
            .then((l) => l.data),
      ),
    share: (uuid) =>
      queryClient.fetchQuery({
        ...getNfsGetShareQueryOptions({ uuid }),
        ...FRESH,
        // Read for one write and not kept: nothing renders it.
        gcTime: 0,
      }),
  };
}

export function useNfsRereads(): NfsRereads {
  const queryClient = useQueryClient();
  return useMemo(() => nfsRereads(queryClient), [queryClient]);
}
