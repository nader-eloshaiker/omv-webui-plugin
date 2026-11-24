// SPDX-License-Identifier: GPL-3.0-or-later
// What each disk holds, for the dashboard's drive bay (dashboard spec 9.1), from the reads the
// dashboard may make. The Disks page's inventory (useDiskReads.ts, useDiskInventory) also reads the
// RAID arrays (MdMgmt.enumerateDevices) and each ZFS pool's devices (Zfs.getPoolDevices), and both
// read a member disk and can wake one that has spun down; the RAID and ZFS designs keep them off the
// dashboard (phase-5-raid 0.5, phase-5-zfs 10). So the bay reads only the disks, the configured and
// the detected file systems, none of which wakes a disk, and takes RAID and ZFS as "none" only when
// the shell's one probe of each plugin found it is not installed.
//
// Fail closed: with either plugin installed or not yet known, what the disks hold is not known
// here, and the bay leaves every role out rather than call a member disk "Empty".
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import { useTasks } from "@omv-webui/react-api-omv/tasks";
import { diskSession } from "../disks/diskSession.ts";
import {
  byDeviceOrder,
  diskUse,
  type DiskUseResult,
  type UseInputs,
} from "../disks/diskUse.ts";
import { useMemoryStore } from "../shell/memoryStore.ts";
import { useConfiguredFs, useDetectedFs, useDiskList } from "./useDiskReads.ts";
import { useRaidPlugin } from "./useRaidReads.ts";
import { useZfsPlugin } from "./useZfsReads.ts";

export interface BayUses {
  /** DiskMgmt.getList's rows in device order, once read. */
  disks: DiskDevice[] | undefined;
  diskList: ReturnType<typeof useDiskList>;
  /** What each disk holds, by `devicename`. */
  uses: ReadonlyMap<string, DiskUseResult>;
  /** Whether every input is known, so the roles may be said. */
  known: boolean;
}

export function useBayUses(): BayUses {
  const diskList = useDiskList();
  const configured = useConfiguredFs();
  const detected = useDetectedFs();
  const raid = useRaidPlugin(true);
  const zfs = useZfsPlugin(true);
  const session = useMemoryStore(diskSession);
  const tasks = useTasks();

  const inputs: UseInputs = {
    configured: configured.isError ? undefined : configured.data?.data,
    detected: detected.isError ? undefined : detected.data,
    // Not read here; known to be empty only when the plugin is not installed.
    arrays: raid === "missing" ? null : undefined,
    zfs: zfs === "missing" ? null : undefined,
  };
  const known =
    inputs.configured !== undefined &&
    inputs.detected !== undefined &&
    inputs.arrays !== undefined &&
    inputs.zfs !== undefined;

  const rows = diskList.data?.data;
  const disks = rows === undefined ? undefined : byDeviceOrder(rows);
  const running = new Set(
    tasks.filter((t) => t.state === "running").map((t) => t.id),
  );
  const uses = new Map<string, DiskUseResult>();
  for (const disk of disks ?? []) {
    const wipe = session.wipes[disk.devicefile];
    uses.set(
      disk.devicename,
      diskUse(disk, inputs, {
        wiping: wipe !== undefined && running.has(wipe.taskId),
        wipedAt: session.wipedAt[disk.devicefile],
      }),
    );
  }
  return { disks, diskList, uses, known };
}
