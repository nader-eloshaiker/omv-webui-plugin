// SPDX-License-Identifier: GPL-3.0-or-later
// The RAID scenarios of the mock (phase 5 RAID design 14). Development and test code only (UI-11).
// These answers REMEMBER what the reader did, as Flow A's do, so the journeys of the design's sections
// 3, 4 and 8 can be walked on `pnpm dev:mock` and in the browser test: creating an array takes its disks
// out of the candidates and offers the array for a file system at once (observed), a mirror then
// synchronises, adding a disk to a degraded array rebuilds onto it and to a healthy one makes a spare,
// growing a RAID5 reshapes it and makes it bigger when the reshape ends (observed), taking a disk out
// leaves it with the array's marks until it is wiped (observed), a check runs and can be stopped, and
// deleting an array frees its disks unless its file system is mounted (observed: HTTP 500, nothing
// pending). Every change marks mdadm and initramfs pending (observed). The kernel's work moves on by a
// tenth at every MdMgmt.enumerateDevices read, so Refresh and the poll show it moving and ending.
//
// The replies have the captured shapes: enumerateDevices' rows, and getDetail's report written line by
// line in mdadm's format, a failed member as a "removed" slot and a "faulty" line as on the VM. The
// states the VM cannot show (not running, a state false or not recognised, twenty arrays, hostile names
// from another computer, a report that cannot be read) are WRITTEN BY HAND and say so in their labels.
// No value comes from a real system: the host is "nas", UUIDs and serial numbers are documentation
// values.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  DiskDevice,
  MdArray,
  MdDisk,
} from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";

export const RAID_SCENARIOS = [
  "raidMirror",
  "raidSyncing",
  "raidSpare",
  "raidFailed",
  "raidRebuilding",
  "raidMissing",
  "raidRaid5",
  "raidReshaping",
  "raidChecking",
  "raidRaid6TwoFailed",
  "raidStripe",
  "raidInUse",
  "raidNotRunning",
  "raidStateFalse",
  "raidUnrecognised",
  "raidDetailFails",
  "raidMany",
  "raidHostile",
  "raidNoPlugin",
  "raidReadFails",
  "raidCreateFails",
] as const;
export type RaidScenarioName = (typeof RAID_SCENARIOS)[number];

export const RAID_SCENARIO_LABELS: Record<RaidScenarioName, string> = {
  raidMirror: "RAID: a healthy mirror of sdb and sdc",
  raidSyncing: "RAID: a new mirror synchronising",
  raidSpare: "RAID: a mirror with sdd as a spare",
  raidFailed: "RAID: a mirror with sdb failed and still listed",
  raidRebuilding: "RAID: sdb failed, rebuilding onto the spare sdd",
  raidMissing: "RAID: a mirror with a disk missing (taken out)",
  raidRaid5: "RAID: a RAID5 of sdb, sdc and sdd",
  raidReshaping: "RAID: a RAID5 being reshaped to four disks",
  raidChecking: "RAID: a mirror being checked",
  raidRaid6TwoFailed: "RAID: a RAID6 with two disks failed",
  raidStripe: "RAID: a stripe of sdb and sdc",
  raidInUse: "RAID: a mirror holding a mounted file system",
  raidNotRunning: "RAID: a RAID5 not running (hand-written)",
  raidStateFalse: "RAID: an array whose state cannot be read (hand-written)",
  raidUnrecognised: "RAID: an unrecognised state (hand-written)",
  raidDetailFails: "RAID: the report cannot be read (hand-written)",
  raidMany: "RAID: twenty arrays (hand-written)",
  raidHostile:
    "RAID: arrays from another computer, hostile names (hand-written)",
  raidNoPlugin: "RAID: the plugin is not installed (404)",
  raidReadFails: "RAID: reading the arrays fails (hand-written)",
  raidCreateFails: "RAID: creating the array fails (hand-written)",
};

export const isRaidScenario = (name: string): name is RaidScenarioName =>
  (RAID_SCENARIOS as readonly string[]).includes(name);

const ok = (value: unknown): FixedAnswer => ({ status: 200, value });
const fail = (status: number, message: string): FixedAnswer => ({
  status,
  message,
  code: 0,
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const VM_DISKS = clone(
  CONTRACT_EXAMPLES.diskMgmtGetList.vmDisks.value.data,
) as unknown as DiskDevice[];
const SCRATCH = clone(
  CONTRACT_EXAMPLES.mdMgmtGetCandidates.vmScratch.value,
) as unknown as MdDisk[];
/** What one 8 GiB scratch disk gives an array, as the VM's mirror reported it. */
const UNIT = 8580497408;
const KIB = (bytes: number) => Math.round(bytes / 1024);

export type MemberRole = "working" | "rebuilding" | "spare" | "failed";
export type Work = "resync" | "rebuild" | "reshape" | "check";

export interface MockArray {
  devicefile: string;
  uuid: string;
  /** mdadm's "host:name"; empty for an array made on this NAS (observed). */
  name: string;
  level: string;
  numdevices: number;
  members: { device: string; role: MemberRole }[];
  size: number;
  work: { kind: Work; percent: number } | null;
  /** The size it becomes when its reshape ends. */
  grownSize: number | null;
  /** A hand-written state that replaces the computed one. */
  stateOverride?: string | false;
  used: boolean;
}

export interface RaidMockState {
  arrays: MockArray[];
  /** Kernel names of the disks the plugin offers. */
  free: string[];
  /** How many arrays this mock has made (for the UUIDs). */
  made: number;
}

const uuidOf = (n: number) =>
  `00000000:00000000:00000000:${String(n).padStart(8, "0")}`;

const freeOf = (taken: readonly string[]) =>
  SCRATCH.map((d) => d.devicefile).filter(
    (d) =>
      VM_DISKS.some((v) => v.canonicaldevicefile === d) && !taken.includes(d),
  );

function mirror(over: Partial<MockArray> = {}): MockArray {
  return {
    devicefile: "/dev/md0",
    uuid: uuidOf(1),
    name: "",
    level: "raid1",
    numdevices: 2,
    members: [
      { device: "/dev/sdb", role: "working" },
      { device: "/dev/sdc", role: "working" },
    ],
    size: UNIT,
    work: null,
    grownSize: null,
    used: false,
    ...over,
  };
}

/** What a scenario starts with. */
export function newRaidMockState(name: string): RaidMockState {
  const arrays: MockArray[] = [];
  switch (name) {
    case "raidMirror":
    case "fsRaid":
      arrays.push(mirror());
      break;
    case "raidSyncing":
      arrays.push(mirror({ work: { kind: "resync", percent: 2.4 } }));
      break;
    case "raidSpare":
      arrays.push(
        mirror({
          members: [
            { device: "/dev/sdb", role: "working" },
            { device: "/dev/sdc", role: "working" },
            { device: "/dev/sdd", role: "spare" },
          ],
        }),
      );
      break;
    case "raidFailed":
      arrays.push(
        mirror({
          members: [
            { device: "/dev/sdb", role: "failed" },
            { device: "/dev/sdc", role: "working" },
          ],
        }),
      );
      break;
    case "raidRebuilding":
      arrays.push(
        mirror({
          members: [
            { device: "/dev/sdb", role: "failed" },
            { device: "/dev/sdc", role: "working" },
            { device: "/dev/sdd", role: "rebuilding" },
          ],
          work: { kind: "rebuild", percent: 4.7 },
        }),
      );
      break;
    case "raidMissing":
      arrays.push(
        mirror({ members: [{ device: "/dev/sdc", role: "working" }] }),
      );
      break;
    case "raidRaid5":
      arrays.push(
        mirror({
          uuid: uuidOf(2),
          level: "raid5",
          numdevices: 3,
          members: ["/dev/sdb", "/dev/sdc", "/dev/sdd"].map((device) => ({
            device,
            role: "working" as const,
          })),
          size: 2 * UNIT,
        }),
      );
      break;
    case "raidReshaping":
      arrays.push(
        mirror({
          uuid: uuidOf(2),
          level: "raid5",
          numdevices: 4,
          members: ["/dev/sdb", "/dev/sdc", "/dev/sdd", "/dev/sde"].map(
            (device) => ({
              device,
              role: "working" as const,
            }),
          ),
          size: 2 * UNIT,
          grownSize: 3 * UNIT,
          work: { kind: "reshape", percent: 6 },
        }),
      );
      break;
    case "raidChecking":
      arrays.push(mirror({ work: { kind: "check", percent: 7 } }));
      break;
    case "raidRaid6TwoFailed":
      arrays.push(
        mirror({
          uuid: uuidOf(3),
          level: "raid6",
          numdevices: 4,
          members: [
            { device: "/dev/sdb", role: "failed" },
            { device: "/dev/sdc", role: "failed" },
            { device: "/dev/sdd", role: "working" },
            { device: "/dev/sde", role: "working" },
          ],
          size: 2 * UNIT,
        }),
      );
      break;
    case "raidStripe":
      arrays.push(mirror({ uuid: uuidOf(5), level: "raid0", size: 2 * UNIT }));
      break;
    case "raidInUse":
      arrays.push(mirror({ used: true }));
      break;
    case "raidNotRunning":
      arrays.push(
        mirror({
          uuid: uuidOf(2),
          level: "raid5",
          numdevices: 3,
          members: [{ device: "/dev/sdb", role: "working" }],
          size: 0,
          stateOverride: "inactive",
        }),
      );
      break;
    case "raidStateFalse":
      arrays.push(mirror({ stateOverride: false }));
      break;
    case "raidUnrecognised":
      arrays.push(mirror({ stateOverride: "clean, frobnicating" }));
      break;
    case "raidDetailFails":
      arrays.push(mirror());
      break;
    case "raidMany":
      for (let i = 0; i < 20; i += 1) {
        arrays.push(
          mirror({
            devicefile: `/dev/md${String(i)}`,
            uuid: uuidOf(100 + i),
            members: [
              {
                device: `/dev/sd${String.fromCharCode(102 + i)}`,
                role: "working",
              },
              {
                device: `/dev/sd${String.fromCharCode(103 + i)}1`,
                role: "working",
              },
            ],
            work: i === 3 ? { kind: "resync", percent: 50 } : null,
          }),
        );
      }
      break;
    case "raidHostile":
      // Made on another computer: mdadm names them "host:name", and the host part is never shown.
      arrays.push(
        mirror({ name: `otherpc:${"x".repeat(200)}` }),
        mirror({
          devicefile: "/dev/md1",
          uuid: uuidOf(11),
          name: "otherpc:תמונות-משפחה",
          members: [{ device: "/dev/sdd", role: "working" }],
          numdevices: 1,
        }),
        mirror({
          devicefile: "/dev/md/media",
          uuid: uuidOf(12),
          name: 'otherpc:<img src=x onerror="alert(1)">',
          members: [{ device: "/dev/sdx", role: "working" }],
        }),
      );
      break;
    default:
      break;
  }
  const taken = arrays.flatMap((a) => a.members.map((m) => m.device));
  return { arrays, free: freeOf(taken), made: arrays.length };
}

// ---- What the replies look like -------------------------------------------------------------------

const working = (a: MockArray) =>
  a.members.filter((m) => m.role === "working").length;
const degraded = (a: MockArray) => working(a) < a.numdevices;

function stateOf(a: MockArray): string | false {
  if (a.stateOverride !== undefined) {
    return a.stateOverride;
  }
  const words = ["clean"];
  if (degraded(a)) {
    words.push("degraded");
  }
  const work = a.work;
  if (work?.kind === "rebuild") {
    words.push("recovering");
  } else if (work?.kind === "resync") {
    words.push("resyncing");
  } else if (work?.kind === "reshape") {
    words.push("reshaping");
  } else if (work?.kind === "check") {
    words.push("checking");
  }
  const text = words.join(", ");
  // The kernel's progress for a resync or rebuild only (observed: none for a reshape or a check).
  if (work !== null && (work.kind === "resync" || work.kind === "rebuild")) {
    const total = KIB(UNIT);
    const done = Math.round((total * work.percent) / 100);
    const left = ((100 - work.percent) / 100) * 0.6;
    return `${text} (${work.percent.toFixed(1)}% (${String(done)}/${String(total)}) finish=${left.toFixed(1)}min speed=201728K/sec)`;
  }
  return text;
}

const SYNC: Record<Work, string> = {
  resync: "resync",
  rebuild: "recover",
  reshape: "reshape",
  check: "check",
};

export function rowOf(a: MockArray): MdArray {
  const gib = (a.size / 1024 ** 3).toFixed(2);
  return {
    _used: a.used,
    name: a.name,
    devicefile: a.devicefile,
    uuid: a.uuid,
    level: a.stateOverride === "inactive" ? "" : a.level,
    numdevices: a.numdevices,
    devices: a.members.map((m) => m.device).sort(),
    size: String(a.size),
    state: stateOf(a),
    syncaction:
      a.level === "raid0" ? null : a.work === null ? "idle" : SYNC[a.work.kind],
    description: `Software RAID ${a.name} [${a.devicefile}, ${a.level}, ${gib} GiB]`,
  } as MdArray;
}

const pad = (label: string) => label.padStart(18);

/** mdadm's report, in the captured examples' format. */
export function detailOf(a: MockArray): string {
  const fact = (label: string, value: string) => `${pad(label)} : ${value}`;
  const kib = KIB(a.size);
  const state = stateOf(a);
  const lines = [
    fact("Version", "1.2"),
    fact("Creation Time", "Sat Nov 21 12:00:00 2026"),
    fact("Raid Level", a.level),
    fact(
      "Array Size",
      `${String(kib)} (${(a.size / 1024 ** 3).toFixed(2)} GiB)`,
    ),
    fact("Raid Devices", String(a.numdevices)),
    fact("Total Devices", String(a.members.length)),
    fact("Persistence", "Superblock is persistent"),
    "",
    fact("Update Time", "Sat Nov 21 12:00:00 2026"),
    fact(
      "State",
      typeof state === "string" ? (state.split(" (")[0] ?? "") : "inactive",
    ),
    fact("Active Devices", String(working(a))),
    fact(
      "Working Devices",
      String(a.members.filter((m) => m.role !== "failed").length),
    ),
    fact(
      "Failed Devices",
      String(a.members.filter((m) => m.role === "failed").length),
    ),
    fact(
      "Spare Devices",
      String(
        a.members.filter((m) => m.role === "spare" || m.role === "rebuilding")
          .length,
      ),
    ),
    "",
    fact("Consistency Policy", a.level === "raid0" ? "none" : "resync"),
    "",
  ];
  if (a.work !== null) {
    const label = {
      resync: "Resync",
      rebuild: "Rebuild",
      reshape: "Reshape",
      check: "Check",
    }[a.work.kind];
    lines.push(
      fact(
        `${label} Status`,
        `${String(Math.floor(a.work.percent))}% complete`,
      ),
      "",
    );
  }
  const number = a.devicefile.replace(/\D/g, "") || "0";
  lines.push(
    fact(
      "Name",
      `${a.name === "" ? `nas:${number}` : a.name}  (local to host nas)`,
    ),
    fact("UUID", a.uuid),
    fact("Events", "18"),
    "",
    "    Number   Major   Minor   RaidDevice State",
  );
  // The kernel's minor number of each member: 16 a disk, as the captures show for sdb, sdc, sdd.
  const minor = (device: string) =>
    16 * (a.members.findIndex((m) => m.device === device) + 1);
  let slot = 0;
  for (const m of a.members.filter(
    (x) => x.role === "working" || x.role === "rebuilding",
  )) {
    const words = m.role === "rebuilding" ? "spare rebuilding" : "active sync";
    lines.push(
      `       ${String(slot)}       8       ${String(minor(m.device)).padStart(2)}        ${String(slot)}      ${words}   ${m.device}`,
    );
    slot += 1;
  }
  for (; slot < a.numdevices; slot += 1) {
    lines.push(`       -       0        0        ${String(slot)}      removed`);
  }
  const rest = a.members.filter(
    (x) => x.role === "spare" || x.role === "failed",
  );
  if (rest.length > 0) {
    lines.push("");
    for (const m of rest) {
      lines.push(
        `       ${String(slot)}       8       ${String(minor(m.device)).padStart(2)}        -      ${m.role === "spare" ? "spare" : "faulty"}   ${m.device}`,
      );
    }
  }
  return lines.join("\n");
}

// ---- The answers ---------------------------------------------------------------------------------

const param = (params: unknown, key: string): unknown =>
  typeof params === "object" && params !== null
    ? (params as Record<string, unknown>)[key]
    : undefined;

/** A disk's kernel name from the stable name the interface sends. */
const kernelOf = (devicefile: string): string =>
  VM_DISKS.find(
    (d) =>
      d.devicefile === devicefile ||
      d.canonicaldevicefile === devicefile ||
      d.devicelinks.includes(devicefile),
  )?.canonicaldevicefile ?? devicefile;

const LEVELS: Readonly<Record<string, string>> = {
  mirror: "raid1",
  stripe: "raid0",
  raid5: "raid5",
  raid6: "raid6",
  raid10: "raid10",
};

function usable(level: string, n: number): number {
  switch (level) {
    case "raid1":
      return UNIT;
    case "raid5":
      return (n - 1) * UNIT;
    case "raid6":
      return (n - 2) * UNIT;
    case "raid10":
      return (n * UNIT) / 2;
    default:
      return n * UNIT;
  }
}

const NOT_INSTALLED =
  CONTRACT_EXAMPLES.mdMgmtEnumerateDevices.notInstalled.value;

export interface RaidHooks {
  /** Mark these modules pending, as OMV does for the call. */
  dirty: (modules: readonly string[]) => void;
  /** The array is a file-system candidate now (observed), or no longer. */
  offerForFs: (devicefile: string, size: number, on: boolean) => void;
  /** Whether a mounted file system is on the array (delete is refused by the system then). */
  mounted: (devicefile: string) => boolean;
}

const MD = ["mdadm", "initramfs"];

/** Move every array's work on by a tenth; finished work ends (a rebuild makes its disk a member). */
function advance(state: RaidMockState): void {
  for (const a of state.arrays) {
    if (a.work === null) {
      continue;
    }
    a.work.percent = Math.min(100, a.work.percent + 10);
    if (a.work.percent >= 100) {
      if (a.work.kind === "rebuild") {
        for (const m of a.members) {
          if (m.role === "rebuilding") {
            m.role = "working";
          }
        }
      }
      if (a.work.kind === "reshape" && a.grownSize !== null) {
        a.size = a.grownSize;
        a.grownSize = null;
      }
      a.work = null;
    }
  }
}

export function raidAnswers(
  name: string,
  state: RaidMockState,
  hooks: RaidHooks,
): Record<string, (call: { params: unknown }) => FixedAnswer> {
  const find = (params: unknown) =>
    state.arrays.find((a) => a.devicefile === param(params, "devicefile"));
  const missing = (params: unknown) =>
    fail(
      500,
      `Device '${String(param(params, "devicefile"))}' does not exist.`,
    );
  const change = (a: MockArray, devices: string[]): FixedAnswer =>
    ok({
      name: a.name,
      devicefile: a.devicefile,
      level: a.level,
      numdevices: a.numdevices + devices.length,
      devices: [...a.members.map((m) => m.device), ...devices],
    });
  if (name === "raidNoPlugin") {
    const notInstalled = () => ({ status: 404, ...NOT_INSTALLED });
    return Object.fromEntries(
      [
        "mdMgmtEnumerateDevices",
        "mdMgmtGetCandidates",
        "mdMgmtGetDetail",
        "mdMgmtGetSlaves",
      ].map((op) => [op, notInstalled]),
    );
  }
  return {
    mdMgmtEnumerateDevices: () => {
      if (name === "raidReadFails") {
        return fail(
          500,
          "Failed to execute command 'mdadm --detail --scan': exit code '1'.",
        );
      }
      advance(state);
      return ok(state.arrays.map(rowOf));
    },
    mdMgmtGetDetail: ({ params }) => {
      const a = find(params);
      if (a === undefined) {
        return missing(params);
      }
      return name === "raidDetailFails"
        ? ok(
            "mdadm: this report has a form this page does not know\n  <b>not a table</b>",
          )
        : ok(detailOf(a));
    },
    mdMgmtGetSlaves: ({ params }) => {
      const a = find(params);
      if (a === undefined) {
        return missing(params);
      }
      return ok(
        a.members
          .filter((m) => m.role !== "failed")
          .map((m) => {
            const disk = VM_DISKS.find(
              (d) => d.canonicaldevicefile === m.device,
            );
            return {
              devicefile: m.device,
              size: disk?.size ?? "8589934592",
              vendor: "ATA",
              serialnumber: disk?.serialnumber ?? "",
              description: `${disk?.model ?? "Disk"} [${m.device}, 8.00 GiB]`,
            };
          }),
      );
    },
    mdMgmtGetCandidates: () =>
      ok(
        state.free.map((device) => {
          const disk = VM_DISKS.find((d) => d.canonicaldevicefile === device);
          return {
            devicefile: device,
            size: disk?.size ?? "8589934592",
            vendor: "ATA",
            serialnumber: disk?.serialnumber ?? "",
            description: `${disk?.model ?? "Disk"} [${device}, 8.00 GiB]`,
          };
        }),
      ),
    mdMgmtCreate: ({ params }) => {
      if (name === "raidCreateFails") {
        return fail(
          500,
          "Failed to execute command 'mdadm --create /dev/md0': mdadm: cannot open /dev/sdb: Device or resource busy",
        );
      }
      const sent = (param(params, "devices") as string[] | undefined) ?? [];
      const devices = sent.map(kernelOf);
      const level = LEVELS[String(param(params, "level"))] ?? "raid1";
      let n = 0;
      while (state.arrays.some((a) => a.devicefile === `/dev/md${String(n)}`)) {
        n += 1;
      }
      state.made += 1;
      const a: MockArray = {
        devicefile: `/dev/md${String(n)}`,
        uuid: uuidOf(40 + state.made),
        name: "",
        level,
        numdevices: devices.length,
        members: devices.map((device) => ({ device, role: "working" })),
        size: usable(level, devices.length),
        work: level === "raid0" ? null : { kind: "resync", percent: 0 },
        grownSize: null,
        used: false,
      };
      state.arrays.push(a);
      state.free = state.free.filter((d) => !devices.includes(d));
      hooks.offerForFs(a.devicefile, a.size, true);
      hooks.dirty(MD);
      // The reply says the level as sent ("mirror"), unlike every other reply (observed).
      return ok({
        name: "",
        devicefile: a.devicefile,
        level: String(param(params, "level")),
        numdevices: devices.length,
        devices: sent,
      });
    },
    mdMgmtAdd: ({ params }) => {
      const a = find(params);
      if (a === undefined) {
        return missing(params);
      }
      const devices = (
        (param(params, "devices") as string[] | undefined) ?? []
      ).map(kernelOf);
      const reply = change(a, devices);
      for (const device of devices) {
        const replacing =
          a.members.filter(
            (m) => m.role === "working" || m.role === "rebuilding",
          ).length < a.numdevices;
        a.members.push({ device, role: replacing ? "rebuilding" : "spare" });
        if (replacing) {
          a.work = { kind: "rebuild", percent: 0 };
        }
      }
      state.free = state.free.filter((d) => !devices.includes(d));
      hooks.dirty(MD);
      return reply;
    },
    mdMgmtGrow: ({ params }) => {
      const a = find(params);
      if (a === undefined) {
        return missing(params);
      }
      const devices = (
        (param(params, "devices") as string[] | undefined) ?? []
      ).map(kernelOf);
      const reply = change(a, devices);
      for (const device of devices) {
        a.members.push({ device, role: "working" });
      }
      a.numdevices += devices.length;
      a.grownSize = usable(a.level, a.numdevices);
      a.work = { kind: "reshape", percent: 0 };
      state.free = state.free.filter((d) => !devices.includes(d));
      hooks.dirty(MD);
      return reply;
    },
    mdMgmtRemove: ({ params }) => {
      const a = find(params);
      if (a === undefined) {
        return missing(params);
      }
      const devices = (param(params, "devices") as string[] | undefined) ?? [];
      // The plugin's numdevices adds where it should subtract (observed): not the array's count.
      const reply = ok({
        name: a.name,
        devicefile: a.devicefile,
        level: a.level,
        numdevices: a.numdevices + devices.length,
        devices: a.members
          .map((m) => m.device)
          .filter((d) => !devices.includes(d)),
      });
      a.members = a.members.filter((m) => !devices.includes(m.device));
      // The disk keeps the array's marks: the plugin does not offer it until it is wiped (observed).
      hooks.dirty(MD);
      return reply;
    },
    mdMgmtDelete: ({ params }) => {
      const a = find(params);
      if (a === undefined) {
        return missing(params);
      }
      if (hooks.mounted(a.devicefile)) {
        // Refused by the system; nothing changed and nothing is pending (observed).
        return {
          status: 500,
          code: 0,
          message: CONTRACT_EXAMPLES.mdMgmtDelete.mounted.value.message,
        };
      }
      state.arrays = state.arrays.filter((x) => x !== a);
      // Deleting erases the array's marks: its disks are offered again.
      for (const m of a.members) {
        if (
          !state.free.includes(m.device) &&
          VM_DISKS.some((d) => d.canonicaldevicefile === m.device)
        ) {
          state.free.push(m.device);
        }
      }
      state.free.sort();
      hooks.offerForFs(a.devicefile, a.size, false);
      hooks.dirty(MD);
      return ok({
        name: a.name,
        devicefile: a.devicefile,
        level: a.level,
        numdevices: a.numdevices,
        devices: a.members.map((m) => m.device),
      });
    },
    mdMgmtSetSyncAction: ({ params }) => {
      const a = find(params);
      if (a === undefined || a.level === "raid0") {
        return {
          status: 500,
          code: 0,
          message: CONTRACT_EXAMPLES.mdMgmtSetSyncAction.noCopies.value.message,
        };
      }
      const action = param(params, "action");
      a.work = action === "check" ? { kind: "check", percent: 0 } : null;
      return ok(null);
    },
  };
}

/** A disk was wiped: one that carried an array's marks, and is in no array, is offered again. */
export function raidWiped(state: RaidMockState, device: string): void {
  const inArray = state.arrays.some((a) =>
    a.members.some((m) => m.device === device),
  );
  if (
    !inArray &&
    !state.free.includes(device) &&
    SCRATCH.some((d) => d.devicefile === device)
  ) {
    state.free.push(device);
    state.free.sort();
  }
}
