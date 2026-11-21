// SPDX-License-Identifier: GPL-3.0-or-later
// The ZFS plugin's (openmediavault-zfs) answers in the mock (phase 5 ZFS design 14), from the
// contract's examples as captured on the test VM. Development and test code only (UI-11).
//
// ZFS is absent by default: in every scenario but the ones below, each Zfs method answers OMV's
// 404 for a service it does not know, as on a NAS without the plugin, so the default stories are
// unchanged. Each scenario below answers one captured state of the VM's pool "tank" and holds no
// state: a write answers its example (null, or a task's handle) and changes nothing a later read
// returns. The remembering ZFS mock of design 14 is built with the ZFS pages.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { ExampleName, FixedAnswer } from "@omv-webui/react-api-omv/mocks";

export const ZFS_SCENARIOS = [
  "zfsNone",
  "zfsMirror",
  "zfsChecking",
  "zfsDegraded",
  "zfsRebuilding",
  "zfsRaidz1",
  "zfsRaidz2",
  "zfsStripe",
  "zfsSingle",
] as const;
export type ZfsScenarioName = (typeof ZFS_SCENARIOS)[number];

export const ZFS_SCENARIO_LABELS: Record<ZfsScenarioName, string> = {
  zfsNone: "ZFS: the plugin installed, no pool",
  zfsMirror: "ZFS: a healthy mirror of sdb and sdc with tank/media",
  zfsChecking: "ZFS: the mirror being checked",
  zfsDegraded: "ZFS: the mirror with sdc taken offline (degraded)",
  zfsRebuilding: "ZFS: sdc being replaced by sdd, rebuilding",
  zfsRaidz1: "ZFS: a RAID-Z1 of sdb, sdc and sdd",
  zfsRaidz2: "ZFS: a RAID-Z2 of sdb to sde",
  zfsStripe: "ZFS: a stripe of sdb and sdc (no protection)",
  zfsSingle: "ZFS: a pool of the single disk sdb (no protection)",
};

export const isZfsScenario = (name: string): name is ZfsScenarioName =>
  (ZFS_SCENARIOS as readonly string[]).includes(name);

/** The captured state each scenario shows: its pool reads, its list and its free disks. */
interface ZfsState {
  pool: ExampleName<"zfsGetObjectDetails"> & ExampleName<"zfsGetPoolDevices">;
  list: ExampleName<"zfsListPools">;
  status: ExampleName<"zfsGetPoolStatus">;
  candidates: ExampleName<"zfsGetEmptyCandidates">;
}

const STATES: Record<Exclude<ZfsScenarioName, "zfsNone">, ZfsState> = {
  zfsMirror: {
    pool: "mirror",
    list: "mirrorWithFs",
    status: "mirror",
    candidates: "afterMirror",
  },
  zfsChecking: {
    pool: "mirrorChecking",
    list: "mirrorChecking",
    status: "mirrorChecking",
    candidates: "afterMirror",
  },
  zfsDegraded: {
    pool: "mirrorDegraded",
    list: "mirrorDegraded",
    status: "mirrorDegraded",
    candidates: "afterMirror",
  },
  zfsRebuilding: {
    pool: "mirrorReplacing",
    list: "mirrorReplacing",
    status: "mirrorReplacing",
    candidates: "afterPoolDeleted",
  },
  zfsRaidz1: {
    pool: "raidz1",
    list: "raidz1",
    status: "raidz1",
    candidates: "afterPoolDeleted",
  },
  zfsRaidz2: {
    pool: "raidz2",
    list: "raidz2",
    status: "raidz2",
    candidates: "afterPoolDeleted",
  },
  zfsStripe: {
    pool: "stripe",
    list: "stripe",
    status: "stripe",
    candidates: "afterMirror",
  },
  zfsSingle: {
    pool: "single",
    list: "single",
    status: "single",
    candidates: "afterMirror",
  },
};

/** OMV's reply to every method of a service it does not know: the plugin is not installed. */
export const ZFS_NOT_INSTALLED: FixedAnswer = {
  status: 404,
  message: "RPC service 'Zfs' not found.",
  code: 0,
};

/** The modules the plugin marks dirty (observed on the test VM). */
export const ZFS_DIRTY = {
  zfsAddPool: ["fstab", "collectd", "monit", "quota"],
  zfsAddObject: ["fstab", "collectd", "monit", "quota"],
  zfsDeleteObjectBg: ["fstab", "collectd", "monit", "quota"],
  zfsSetProperties: ["collectd", "monit", "quota"],
} as const;

interface Call {
  params: unknown;
}
type Reply<Op extends keyof typeof CONTRACT_EXAMPLES> = (
  call: Call,
) => ExampleName<Op> | FixedAnswer;

/** The ZFS answers of a scenario, before the sign-in guard and the pending marks. */
export interface ZfsReplies {
  zfsListCompressionTypes: Reply<"zfsListCompressionTypes">;
  zfsListPools: Reply<"zfsListPools">;
  zfsGetObjectDetails: Reply<"zfsGetObjectDetails">;
  zfsGetPoolDevices: Reply<"zfsGetPoolDevices">;
  zfsGetPoolStatus: Reply<"zfsGetPoolStatus">;
  zfsGetAllSnapshots: Reply<"zfsGetAllSnapshots">;
  zfsGetEmptyCandidates: Reply<"zfsGetEmptyCandidates">;
  zfsAddPool: Reply<"zfsAddPool">;
  zfsAddObject: Reply<"zfsAddObject">;
  zfsSetProperties: Reply<"zfsSetProperties">;
  zfsQuickSnapshot: Reply<"zfsQuickSnapshot">;
  zfsRollbackSnapshot: Reply<"zfsRollbackSnapshot">;
  zfsDeleteObjectBg: Reply<"zfsDeleteObjectBg">;
  zfsScrubPool: Reply<"zfsScrubPool">;
  zfsStopScrub: Reply<"zfsStopScrub">;
  zfsDeviceReplace: Reply<"zfsDeviceReplace">;
  zfsDeviceOffline: Reply<"zfsDeviceOffline">;
  zfsDeviceOnline: Reply<"zfsDeviceOnline">;
  zfsClearPool: Reply<"zfsClearPool">;
}

const typeOf = (params: unknown): unknown =>
  (params as { type?: unknown } | null)?.type;

export function zfsReplies(name: string): ZfsReplies {
  if (!isZfsScenario(name)) {
    const absent = () => ZFS_NOT_INSTALLED;
    return {
      zfsListCompressionTypes: () => "notInstalled",
      zfsListPools: absent,
      zfsGetObjectDetails: absent,
      zfsGetPoolDevices: absent,
      zfsGetPoolStatus: absent,
      zfsGetAllSnapshots: absent,
      zfsGetEmptyCandidates: absent,
      zfsAddPool: absent,
      zfsAddObject: absent,
      zfsSetProperties: absent,
      zfsQuickSnapshot: absent,
      zfsRollbackSnapshot: absent,
      zfsDeleteObjectBg: absent,
      zfsScrubPool: absent,
      zfsStopScrub: absent,
      zfsDeviceReplace: absent,
      zfsDeviceOffline: absent,
      zfsDeviceOnline: absent,
      zfsClearPool: absent,
    };
  }
  const state = name === "zfsNone" ? undefined : STATES[name];
  return {
    zfsListCompressionTypes: () => "list",
    zfsListPools: () => state?.list ?? "none",
    // A pool that is not there fails as on the VM (HTTP 500), and so does any report with no pool.
    zfsGetObjectDetails: ({ params }) =>
      state === undefined
        ? "notFound"
        : typeOf(params) === "Filesystem"
          ? "filesystem"
          : state.pool,
    // The plugin answers an empty list for a pool that does not exist.
    zfsGetPoolDevices: () =>
      state?.pool ?? { status: 200, value: [] satisfies unknown[] },
    zfsGetPoolStatus: () => state?.status ?? "none",
    zfsGetAllSnapshots: () =>
      name === "zfsMirror" || name === "zfsChecking" ? "several" : "none",
    zfsGetEmptyCandidates: () => state?.candidates ?? "vmScratch",
    zfsAddPool: () => "null",
    zfsAddObject: () => "null",
    zfsSetProperties: () => "null",
    zfsQuickSnapshot: () => "null",
    zfsRollbackSnapshot: () => "null",
    zfsDeleteObjectBg: ({ params }) =>
      typeOf(params) === "Snapshot"
        ? "snapshot"
        : typeOf(params) === "Filesystem"
          ? "filesystem"
          : "pool",
    zfsScrubPool: () => "null",
    zfsStopScrub: () => (name === "zfsChecking" ? "null" : "notChecking"),
    zfsDeviceReplace: () => "null",
    zfsDeviceOffline: () => "null",
    zfsDeviceOnline: () => "null",
    zfsClearPool: () => "null",
  };
}

/** The last poll of each delete task, by the handle its start answers. */
export const ZFS_TASK_OUTPUTS: Readonly<
  Record<string, ExampleName<"execGetOutput">>
> = {
  [CONTRACT_EXAMPLES.zfsDeleteObjectBg.snapshot.value]:
    "zfsDeleteSnapshotFinished",
  [CONTRACT_EXAMPLES.zfsDeleteObjectBg.filesystem.value]:
    "zfsDeleteFilesystemFinished",
  [CONTRACT_EXAMPLES.zfsDeleteObjectBg.pool.value]: "zfsDeletePoolFinished",
  [CONTRACT_EXAMPLES.zfsDeleteObjectBg.poolWithFs.value]:
    "zfsDeletePoolWithFsFailed",
};
