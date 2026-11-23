// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's page's reads of this slice's lists (phase 5 services design 2.7, 12.1): every NFS
// entry, every folder offered to the rsync server and every copy job, whole, in the cache entries the
// NFS page, the rsync server tab and the copy jobs list use. Used by and the delete section rest on
// them; any of them failing makes Used by show its retry form and the delete wait (fail closed). The
// re-check before the delete dialog (`recheck`) reads all three again.
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ListRead, ServiceReads } from "../services/folderUses.ts";
import { jobsRereads, useRsyncJobs } from "./useJobsReads.ts";
import { nfsRereads, useNfsShares } from "./useNfsReads.ts";
import { rsyncdRereads, useRsyncdModules } from "./useRsyncdReads.ts";
import type { SharesReadOptions } from "./useSharesReads.ts";

interface ListQuery<T> {
  data: { data: T[] } | undefined;
  isError: boolean;
  error: unknown;
}

const listRead = <T>(q: ListQuery<T>): ListRead<T> => ({
  data: q.data?.data,
  failed: q.isError && q.data === undefined,
  error: q.error,
});

const settle = <T>(read: Promise<T[]>): Promise<ListRead<T>> =>
  read.then(
    (data) => ({ data, failed: false }),
    (error: unknown) => ({ data: undefined, failed: true, error }),
  );

export function useFolderServiceReads(options: SharesReadOptions = {}) {
  const queryClient = useQueryClient();
  const nfs = useNfsShares(options);
  const modules = useRsyncdModules(options);
  const jobs = useRsyncJobs(options);
  const reads: ServiceReads = {
    nfs: listRead(nfs),
    modules: listRead(modules),
    jobs: listRead(jobs),
  };
  const recheck = useMemo(
    () => async (): Promise<ServiceReads> => {
      const [n, m, j] = await Promise.all([
        settle(nfsRereads(queryClient).shares()),
        settle(rsyncdRereads(queryClient).modules()),
        settle(jobsRereads(queryClient).jobs()),
      ]);
      return { nfs: n, modules: m, jobs: j };
    },
    [queryClient],
  );
  return {
    reads,
    refetch: () =>
      Promise.allSettled([nfs.refetch(), modules.refetch(), jobs.refetch()]),
    recheck,
  };
}
