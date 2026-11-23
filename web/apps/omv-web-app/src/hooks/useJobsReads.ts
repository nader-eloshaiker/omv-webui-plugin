// SPDX-License-Identifier: GPL-3.0-or-later
// The copy jobs' reads (phase 5 services design 3.1, 4.1, 5, 12.1), one set of parameters each, so the
// jobs tab, a job's page, the add and change flows and a shared folder's page share one cache entry
// per read. Read on opening, on Refresh, after a save or a run and, where asked, on window focus;
// nothing polls. Administrator-only, like every method here: a normal user's page makes none.
//
// The stored password of a job in Rsync.get and Rsync.getList replies is replaced by the transport
// with whether one is set (x-omv-presence) before the reply is cached, so no entry here holds one.
//
// The re-reads (jobsRereads) are fresh foreground reads landing in the same entries: the design's
// "read immediately before the write" (0.11, R4) and the flows' checks.
import {
  getCertificateMgmtGetSshListQueryOptions,
  getRsyncGetListQueryOptions,
  getRsyncGetQueryOptions,
  useCertificateMgmtGetSshList,
  useEmailNotificationGet,
  useRsyncGet,
  useRsyncGetList,
  useSystemGetTimeSettings,
  type ConfiguredFilesystem,
  type RsyncJob,
  type RsyncJobRow,
  type SharedFolder,
  type SshCertificateListDataItem,
} from "@omv-webui/react-api-omv/generated";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  freshRead,
  SHARES_ALL,
  sharesRereads,
  type SharesReadOptions,
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

/** Every copy job, with its sides' names (3.1). Fails whole when a job's shared folder is gone. */
export const useRsyncJobs = (options: SharesReadOptions = {}) =>
  useRsyncGetList(SHARES_ALL, { query: onOpen(options) });

/** One job as stored, with the flattened side fields (4.1). */
export const useRsyncJob = (uuid: string, options: SharesReadOptions = {}) =>
  useRsyncGet({ uuid }, { query: onOpen(options) });

/** The NAS's SSH keys with their public halves (5.3, 4.2). */
export const useSshKeys = (options: SharesReadOptions = {}) =>
  useCertificateMgmtGetSshList(SHARES_ALL, { query: onOpen(options) });

/** The NAS's time zone, for "(NAS time)" (0.2, D16). */
export const useNasTime = (options: SharesReadOptions = {}) =>
  useSystemGetTimeSettings({ query: onOpen(options) });

/** Whether email notifications are set up (5.2 field 7, 4.2). Its password is removed as before. */
export const useEmailSetUp = (options: SharesReadOptions = {}) =>
  useEmailNotificationGet({ query: onOpen(options) });

export interface JobsRereads {
  folders(): Promise<SharedFolder[]>;
  fileSystems(): Promise<ConfiguredFilesystem[]>;
  pending(): Promise<string[]>;
  jobs(): Promise<RsyncJobRow[]>;
  job(uuid: string): Promise<RsyncJob>;
  sshKeys(): Promise<SshCertificateListDataItem[]>;
}

const FRESH = { staleTime: 0, retry: false } as const;

export function jobsRereads(queryClient: QueryClient): JobsRereads {
  const shares = sharesRereads(queryClient);
  return {
    folders: shares.folders,
    fileSystems: shares.fileSystems,
    pending: shares.pending,
    jobs: () =>
      freshRead(
        queryClient,
        getRsyncGetListQueryOptions(SHARES_ALL).queryKey,
        () =>
          queryClient
            .fetchQuery({
              ...getRsyncGetListQueryOptions(SHARES_ALL),
              ...FRESH,
            })
            .then((l) => l.data),
      ),
    job: (uuid) =>
      freshRead(queryClient, getRsyncGetQueryOptions({ uuid }).queryKey, () =>
        queryClient.fetchQuery({
          ...getRsyncGetQueryOptions({ uuid }),
          ...FRESH,
        }),
      ),
    sshKeys: () =>
      freshRead(
        queryClient,
        getCertificateMgmtGetSshListQueryOptions(SHARES_ALL).queryKey,
        () =>
          queryClient
            .fetchQuery({
              ...getCertificateMgmtGetSshListQueryOptions(SHARES_ALL),
              ...FRESH,
            })
            .then((l) => l.data),
      ),
  };
}

export function useJobsRereads(): JobsRereads {
  const queryClient = useQueryClient();
  return useMemo(() => jobsRereads(queryClient), [queryClient]);
}
