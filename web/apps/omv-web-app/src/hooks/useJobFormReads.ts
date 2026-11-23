// SPDX-License-Identifier: GPL-3.0-or-later
// The reads the copy-job form needs (phase 5 services design 5.2, 5.3), shared by adding a job and
// changing one: the shared folders and file systems (which folders can be chosen), the NAS's SSH keys
// (5.3; when the read fails, "Over SSH" is unavailable), whether email is set up, the NAS's time zone,
// and which folders are shared over SMB or NFS or offered to the rsync server (5.3's line).
import { useMemo } from "react";
import type { JobFormReads } from "../components/organisms/CopyJobForm.tsx";
import { useEmailSetUp, useNasTime, useSshKeys } from "./useJobsReads.ts";
import { useNfsShares } from "./useNfsReads.ts";
import { useRsyncdModules } from "./useRsyncdReads.ts";
import {
  useShareFileSystems,
  useSharedFoldersAll,
  useSmbShares,
} from "./useSharesReads.ts";

/** The reads the job form needs, shared by adding and changing a job. */
export function useJobFormReads(): JobFormReads {
  const folders = useSharedFoldersAll({ focus: true });
  const fileSystems = useShareFileSystems();
  const keys = useSshKeys();
  const email = useEmailSetUp();
  const time = useNasTime();
  const smb = useSmbShares();
  const nfs = useNfsShares();
  const rsyncd = useRsyncdModules();
  const shared = useMemo(
    () =>
      new Set([
        ...(smb.data?.data ?? []).map((s) => s.sharedfolderref),
        ...(nfs.data?.data ?? []).map((s) => s.sharedfolderref),
        ...(rsyncd.data?.data ?? []).map((m) => m.sharedfolderref),
      ]),
    [smb.data, nfs.data, rsyncd.data],
  );
  return {
    folders: folders.data?.data,
    foldersFailed: folders.isError,
    fileSystems: fileSystems.data?.data,
    keys: keys.data?.data,
    keysFailed: keys.isError && keys.data === undefined,
    emailSetUp: email.data === undefined ? undefined : email.data.enable,
    isShared: (uuid) => shared.has(uuid),
    nasZone: time.data?.timezone,
  };
}
