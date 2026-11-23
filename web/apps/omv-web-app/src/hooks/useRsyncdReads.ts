// SPDX-License-Identifier: GPL-3.0-or-later
// The rsync server's reads (phase 5 services design 9.1, 10, 12.1), one set of parameters each, so the
// rsync server tab and a shared folder's page share one cache entry per read. Read on opening, on
// Refresh, after a save and, where asked, on window focus; nothing polls. Administrator-only, like
// every method here: a normal user's page makes none of these calls.
//
// Every sign-in's password in Rsyncd.getModuleList and getModule replies is replaced by the transport
// with whether one is set (x-omv-presence) before the reply is cached, so no entry here holds one.
//
// The re-reads (rsyncdRereads) are fresh foreground reads landing in the same entries: the design's
// "read immediately before the write" (0.11, R4).
import {
  getRsyncdGetModuleListQueryOptions,
  getRsyncdGetModuleQueryOptions,
  getRsyncdGetSettingsQueryOptions,
  useRsyncdGetModuleList,
  useRsyncdGetSettings,
  type RsyncdModule,
  type RsyncdModuleRow,
  type RsyncdSettings,
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

/** Whether the rsync server is on, and its port (0.3, 9.2). */
export const useRsyncdSettings = (options: SharesReadOptions = {}) =>
  useRsyncdGetSettings({ query: onOpen(options) });

/** Every folder offered to the rsync server, with its shared folder's name (9.1, 12.1). */
export const useRsyncdModules = (options: SharesReadOptions = {}) =>
  useRsyncdGetModuleList(SHARES_ALL, { query: onOpen(options) });

export interface RsyncdRereads extends Pick<
  SharesRereads,
  "folders" | "services" | "pending" | "hostname"
> {
  settings(): Promise<RsyncdSettings>;
  modules(): Promise<RsyncdModuleRow[]>;
  /** One module as stored, read when the dialog opens and just before it is changed (0.11). */
  module(uuid: string): Promise<RsyncdModule>;
}

const FRESH = { staleTime: 0, retry: false } as const;

export function rsyncdRereads(queryClient: QueryClient): RsyncdRereads {
  const shares = sharesRereads(queryClient);
  return {
    folders: shares.folders,
    services: shares.services,
    pending: shares.pending,
    hostname: shares.hostname,
    settings: () =>
      freshRead(queryClient, getRsyncdGetSettingsQueryOptions().queryKey, () =>
        queryClient.fetchQuery({
          ...getRsyncdGetSettingsQueryOptions(),
          ...FRESH,
        }),
      ),
    modules: () =>
      freshRead(
        queryClient,
        getRsyncdGetModuleListQueryOptions(SHARES_ALL).queryKey,
        () =>
          queryClient
            .fetchQuery({
              ...getRsyncdGetModuleListQueryOptions(SHARES_ALL),
              ...FRESH,
            })
            .then((l) => l.data),
      ),
    module: (uuid) =>
      queryClient.fetchQuery({
        ...getRsyncdGetModuleQueryOptions({ uuid }),
        ...FRESH,
        // Read for one dialog and not kept beyond it.
        gcTime: 0,
      }),
  };
}

export function useRsyncdRereads(): RsyncdRereads {
  const queryClient = useQueryClient();
  return useMemo(() => rsyncdRereads(queryClient), [queryClient]);
}
