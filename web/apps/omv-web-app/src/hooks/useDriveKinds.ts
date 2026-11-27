// SPDX-License-Identifier: GPL-3.0-or-later
// Each disk's kind for the dashboard (journal 2026-11-27, item 1): Smart.getInformation, which can
// wake a sleeping disk, read once and only for the disks DiskMgmt.getList reports awake. NVMe disks
// are known by their name and need no read; a sleeping disk has no kind.
//
// The read shares the generated cache entry of a disk's details, so a disk page opened later shows
// what was read here, and its own press reads it again. It starts by itself only while the entry has
// never been read: `enabled` is false from the moment it holds a reply or a failure, so nothing
// starts it again (not focus, reconnect, a finished task's refresh of every query, or coming back).
// It is never retried and kept for the session (gcTime Infinity; emptied at sign-out), because a
// kind never changes. The same rule as the waking reads of useDiskReads.ts. Once asked it is never
// cancelled: the disk is awake by then whatever happens, so a page that unmounts mid-read (leaving
// it, or React's development double mount) keeps the answer instead of asking the disk again.
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import {
  getSmartGetInformationQueryKey,
  smartGetInformation,
} from "@omv-webui/react-api-omv/generated";
import {
  driveKindOf,
  type DrivePictureKind,
} from "@omv-webui/react-ui-components";
import { useQueries } from "@tanstack/react-query";
import { isAwake } from "../dashboard/nasModel.ts";

const ONCE = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  retry: false,
} as const;

/** Whether a disk is known by its name, so it needs no read. */
const byName = (disk: Pick<DiskDevice, "devicename">) =>
  driveKindOf(disk) !== null;

/**
 * The kinds read so far, by `devicename`. A disk not in the map has no kind yet: it is asleep, its
 * read failed or has not come back. `enabled` false keeps every read off (a normal user).
 */
export function useDriveKinds(
  disks: readonly DiskDevice[] | undefined,
  enabled: boolean,
): ReadonlyMap<string, DrivePictureKind | null> {
  const list = disks ?? [];
  const asked = list.filter((d) => !byName(d) && isAwake(d));
  const reads = useQueries({
    queries: asked.map((disk) => ({
      queryKey: getSmartGetInformationQueryKey({ devicefile: disk.devicefile }),
      // No abort signal: an unmount does not cancel it (see above).
      queryFn: () => smartGetInformation({ devicefile: disk.devicefile }),
      ...ONCE,
      // Only while the entry has never answered: once it holds a reply or a failure, never again.
      enabled: (query: { state: { status: string } }) =>
        enabled && query.state.status === "pending",
    })),
  });
  const kinds = new Map<string, DrivePictureKind | null>();
  for (const disk of list) {
    if (byName(disk)) {
      kinds.set(disk.devicename, driveKindOf(disk));
    }
  }
  asked.forEach((disk, i) => {
    const data = reads[i]?.data;
    if (data !== undefined) {
      kinds.set(
        disk.devicename,
        driveKindOf(disk, { rotationrate: data.rotationrate }),
      );
    }
  });
  return kinds;
}
