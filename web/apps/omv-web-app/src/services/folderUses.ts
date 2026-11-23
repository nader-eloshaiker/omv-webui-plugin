// SPDX-License-Identifier: GPL-3.0-or-later
// What uses a shared folder among this slice's settings (phase 5 services design 2.7, 12.1; P19): its
// NFS entries, the rsync server folder that offers it, and the copy jobs that copy from it or into it,
// found by the folder's `uuid` in the whole lists NFS.getShareList, Rsyncd.getModuleList and
// Rsync.getList. A folder's page names each in Used by and its delete refuses while any exists. Pure.
import type {
  NfsShareRow,
  RsyncdModuleRow,
  RsyncJobRow,
} from "@omv-webui/react-api-omv/generated";

/** One named use, in Used by's order: the rsync server folder first, then the jobs as listed. */
export type ServiceUse =
  | { kind: "rsyncModule"; module: RsyncdModuleRow }
  /** `into` false: the job copies from the folder; true: it copies into it. */
  | { kind: "job"; job: RsyncJobRow; into: boolean };

/** A whole-list read as the folder's page holds it. */
export interface ListRead<T> {
  data: readonly T[] | undefined;
  failed: boolean;
  error?: unknown;
}

export interface ServiceReads {
  nfs: ListRead<NfsShareRow>;
  modules: ListRead<RsyncdModuleRow>;
  jobs: ListRead<RsyncJobRow>;
}

export type ServiceUses =
  /** A read failed: the page cannot say what uses the folder (fail closed). */
  | { kind: "unread"; error: unknown }
  /** A read has not arrived. */
  | { kind: "loading" }
  | { kind: "read"; nfs: readonly NfsShareRow[]; uses: readonly ServiceUse[] };

/** The folder's NFS entries, rsync server folder and copy jobs, from the three reads. */
export function serviceUses(
  folderUuid: string,
  reads: ServiceReads,
): ServiceUses {
  const failed = [reads.nfs, reads.modules, reads.jobs].find((r) => r.failed);
  if (failed !== undefined) {
    return { kind: "unread", error: failed.error };
  }
  const { nfs, modules, jobs } = {
    nfs: reads.nfs.data,
    modules: reads.modules.data,
    jobs: reads.jobs.data,
  };
  if (nfs === undefined || modules === undefined || jobs === undefined) {
    return { kind: "loading" };
  }
  const uses: ServiceUse[] = [];
  for (const module of modules) {
    if (module.sharedfolderref === folderUuid) {
      uses.push({ kind: "rsyncModule", module });
    }
  }
  for (const job of jobs) {
    if (job.src.sharedfolderref === folderUuid) {
      uses.push({ kind: "job", job, into: false });
    }
    if (job.dest.sharedfolderref === folderUuid) {
      uses.push({ kind: "job", job, into: true });
    }
  }
  return {
    kind: "read",
    nfs: nfs.filter((e) => e.sharedfolderref === folderUuid),
    uses,
  };
}
