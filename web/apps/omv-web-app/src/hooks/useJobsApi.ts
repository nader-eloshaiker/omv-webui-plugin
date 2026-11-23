// SPDX-License-Identifier: GPL-3.0-or-later
// The calls the copy-job pages and flows make, from the generated hooks, gathered for the runs that
// outlive a page (the add and change flows, a run; pattern useSharesApi.ts) and for the saves. A run
// keeps the functions it started with. Rsync.set and Rsync.delete are marked x-omv-dirty in the
// contract, so the pending-changes reads are refreshed centrally (react-api-omv/query.ts), never per
// page. Rsync.execute starts a task, followed by the one registry; its handle stays in the task
// helper (UI-5). Nothing here retries (UI-14).
//
// The password for another computer's rsync server goes only into Rsync.set's request; its reply has
// none (x-omv-omit). The caller drops its own copy as soon as the request returns (0.8, UI-6).
import {
  getRsyncGetListQueryKey,
  getRsyncGetQueryKey,
  useRsyncDelete,
  useRsyncExecute,
  useRsyncSet,
  type RsyncJobStored,
  type RsyncSetRequest,
} from "@omv-webui/react-api-omv/generated";
import { useQueryClient } from "@tanstack/react-query";
import type { JobFlowApi } from "../services/addJobFlow.ts";
import { useFsApi } from "./useFsApi.ts";
import { useJobsRereads } from "./useJobsReads.ts";

export interface JobsApi extends JobFlowApi {
  delete(uuid: string): Promise<RsyncJobStored>;
}

export function useJobsApi(): JobsApi {
  const rereads = useJobsRereads();
  const fs = useFsApi();
  const set = useRsyncSet();
  const del = useRsyncDelete();
  const execute = useRsyncExecute();
  const queryClient = useQueryClient();
  /** After a save or a delete the list and the job read again (they are not polled). */
  const reread = (uuid: string) => {
    void queryClient.invalidateQueries({
      queryKey: getRsyncGetListQueryKey().slice(0, 2),
    });
    void queryClient.invalidateQueries({
      queryKey: getRsyncGetQueryKey({ uuid }),
    });
  };
  return {
    ...rereads,
    set: async (request: RsyncSetRequest) => {
      const saved = await set.mutateAsync({ data: request });
      reread(saved.uuid);
      return saved;
    },
    delete: async (uuid) => {
      const deleted = await del.mutateAsync({ data: { uuid } });
      reread(uuid);
      return deleted;
    },
    execute: (uuid) => () => execute.mutateAsync({ data: { uuid } }),
    apply: fs.apply,
  };
}
