// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  ConfiguredFilesystem,
  MountedFilesystem,
  NetworkDevice,
  ServiceStatus,
  SmartDevice,
  SmartDeviceList,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  addressWithPrefix,
  addSample,
  attentionRows,
  CHART_MAX_SAMPLES,
  CHART_WINDOW_MS,
  clockDifferenceSeconds,
  diskState,
  diskTemperature,
  emailAlerts,
  fileSystemName,
  fileSystemState,
  httpsState,
  interfaceKind,
  memoryUsage,
  missingFileSystems,
  readingRows,
  serviceState,
  serviceSummary,
  sortDisks,
  storageItems,
  usageSample,
  visibleInterfaces,
} from "./dashboard.ts";

describe("memoryUsage", () => {
  it("computes the share from used and total, not from memUtilization", () => {
    expect(
      memoryUsage({ memUsed: "1073741824", memTotal: "4294967296" }),
    ).toEqual({
      used: 1_073_741_824,
      total: 4_294_967_296,
      percent: 25,
    });
  });

  it("gives nothing when a figure is missing or the total is zero", () => {
    expect(memoryUsage({ memUsed: "1", memTotal: undefined })).toBeNull();
    expect(memoryUsage({ memUsed: "1", memTotal: "0" })).toBeNull();
  });
});

describe("attentionRows: restart and clock", () => {
  const now = 1_795_089_029_000;
  const rows = (info: { ts: number; rebootRequired?: boolean }) =>
    attentionRows({ info, receivedAtMs: now });

  it("is empty when nothing needs attention", () => {
    expect(rows({ ts: now / 1000, rebootRequired: false })).toEqual([]);
  });

  it("lists a restart first, then a clock difference over five minutes", () => {
    expect(rows({ ts: now / 1000 - 3600, rebootRequired: true })).toEqual([
      { kind: "restart", key: "restart" },
      { kind: "clock", key: "clock", seconds: 3600 },
    ]);
  });

  it("allows five minutes either way", () => {
    expect(rows({ ts: now / 1000 + 300 })).toEqual([]);
    expect(rows({ ts: now / 1000 + 301 })).toEqual([
      { kind: "clock", key: "clock", seconds: 301 },
    ]);
    expect(clockDifferenceSeconds(100, 160_000)).toBe(60);
  });
});

describe("emailAlerts", () => {
  const complete = {
    enable: true,
    server: "smtp.example.com",
    port: 587,
    sender: "nas@example.com",
    primaryemail: "admin@example.com",
  };

  it("is done only when enabled with server, port, sender and primary address", () => {
    expect(emailAlerts(complete)).toBe("done");
    expect(emailAlerts({ ...complete, server: " " })).toBe("incomplete");
    expect(emailAlerts({ ...complete, sender: "" })).toBe("incomplete");
    expect(emailAlerts({ ...complete, primaryemail: "" })).toBe("incomplete");
    expect(emailAlerts({ ...complete, port: 0 })).toBe("incomplete");
    expect(emailAlerts({ ...complete, enable: false })).toBe("off");
  });
});

describe("httpsState", () => {
  it("tells the setting from the connection", () => {
    expect(httpsState(false, "https:")).toBe("off");
    expect(httpsState(true, "https:")).toBe("on");
    expect(httpsState(true, "http:")).toBe("onButNotUsed");
  });
});

// The captured examples, as the server sent them.
const MOUNTED = CONTRACT_EXAMPLES.fileSystemMgmtEnumerateMountedFilesystems
  .withRoot.value as unknown as MountedFilesystem[];
const DATA_FS = MOUNTED[0]!;
const ROOT_FS = MOUNTED[1]!;
const fs = (change: Partial<MountedFilesystem>): MountedFilesystem => ({
  ...DATA_FS,
  ...change,
});
const DISKS = (
  JSON.parse(
    CONTRACT_EXAMPLES.execGetOutput.smartDevicesFinished.value.output,
  ) as SmartDeviceList
).data;
const disk = (change: Partial<SmartDevice>): SmartDevice => ({
  ...DISKS[0]!,
  ...change,
});
const SERVICES = CONTRACT_EXAMPLES.servicesGetStatus.sshOnly.value
  .data as unknown as ServiceStatus[];
const service = (
  name: string,
  enabled: boolean,
  running: boolean,
  title = name.toUpperCase(),
): ServiceStatus => ({ name, title, enabled, running });

describe("fileSystemName", () => {
  it("calls the root row the system drive, whatever its label", () => {
    expect(fileSystemName(ROOT_FS)).toEqual({ kind: "systemDrive" });
    expect(fileSystemName({ ...ROOT_FS, label: "root" })).toEqual({
      kind: "systemDrive",
    });
  });

  it("takes the label, else the device under /dev, else the configured device file", () => {
    expect(fileSystemName(fs({ label: "media" }))).toEqual({
      kind: "label",
      text: "media",
    });
    expect(fileSystemName(DATA_FS)).toEqual({
      kind: "device",
      text: "/dev/sda1",
    });
    expect(fileSystemName(fs({ canonicaldevicefile: "" }))).toEqual({
      kind: "device",
      text: DATA_FS.devicefile,
    });
  });

  it("names one being created, whose label is null, by its device", () => {
    const creating =
      CONTRACT_EXAMPLES.fileSystemMgmtGetList.creating.value.data[0];
    expect(creating.label).toBeNull();
    expect(fileSystemName(creating)).toEqual({
      kind: "device",
      text: "/dev/sdd1",
    });
  });
});

describe("fileSystemState", () => {
  it.each([
    ["below its level", { percentage: 50, usagewarnthreshold: 85 }, "below"],
    ["at its level", { percentage: 85, usagewarnthreshold: 85 }, "warning"],
    ["over its level", { percentage: 91, usagewarnthreshold: 85 }, "warning"],
    [
      "with no level, nearly full",
      { percentage: 99, usagewarnthreshold: 0 },
      "below",
    ],
    [
      "full, with no level",
      { percentage: 100, usagewarnthreshold: 0 },
      "critical",
    ],
    ["with nothing free", { percentage: 99, available: "0" }, "critical"],
    ["with no reading", { percentage: -1 }, "unknown"],
    ["with no size", { size: "-1" }, "unknown"],
    ["with no free figure", { available: "-1" }, "unknown"],
  ] as const)("%s is %s", (_, change, state) => {
    expect(fileSystemState(fs(change))).toBe(state);
  });
});

describe("storageItems", () => {
  it("puts problems first, the fullest first within a state, then by name", () => {
    const items = storageItems([
      fs({ uuid: "a", label: "a-low", percentage: 10 }),
      fs({
        uuid: "b",
        label: "b-warn",
        percentage: 86,
        usagewarnthreshold: 85,
      }),
      fs({ uuid: "c", label: "c-full", percentage: 100 }),
      fs({ uuid: "d", label: "d-unknown", percentage: -1 }),
      fs({
        uuid: "e",
        label: "e-warn",
        percentage: 95,
        usagewarnthreshold: 85,
      }),
      fs({ uuid: "f", label: "disk10", percentage: 10 }),
      fs({ uuid: "g", label: "disk2", percentage: 10 }),
    ]);
    expect(
      items.map((i) => (i.name.kind === "systemDrive" ? "/" : i.name.text)),
    ).toEqual([
      "c-full",
      "e-warn",
      "b-warn",
      "d-unknown",
      "a-low",
      "disk2",
      "disk10",
    ]);
  });

  it("lists a missing file system as Critical, after a full one", () => {
    const configured = CONTRACT_EXAMPLES.fileSystemMgmtGetList.missing.value
      .data as unknown as ConfiguredFilesystem[];
    const missing = missingFileSystems(configured);
    expect(missing).toHaveLength(1);
    const items = storageItems(
      [fs({ uuid: "x", label: "full", percentage: 100 }), DATA_FS],
      missing,
    );
    expect(items.map((i) => i.kind)).toEqual(["mounted", "missing", "mounted"]);
    expect(items[1]?.name).toEqual({
      kind: "device",
      text: missing[0]?.devicefile,
    });
  });

  it("finds nothing missing in a set-up where every file system is there", () => {
    const configured = CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value
      .data as unknown as ConfiguredFilesystem[];
    expect(missingFileSystems(configured)).toEqual([]);
  });
});

describe("diskState", () => {
  it.each([
    ["GOOD", "ok", null],
    ["BAD_SECTOR", "warning", "BAD_SECTOR"],
    ["BAD_ATTRIBUTE_IN_THE_PAST", "warning", "BAD_ATTRIBUTE_IN_THE_PAST"],
    ["BAD_SECTOR_MANY", "critical", "BAD_SECTOR_MANY"],
    ["BAD_ATTRIBUTE_NOW", "critical", "BAD_ATTRIBUTE_NOW"],
    ["BAD_STATUS", "unknown", "BAD_STATUS"],
    ["SOMETHING_NEW", "unknown", "other"],
  ])("%s is %s", (code, status, reason) => {
    expect(diskState(code)).toEqual({ status, reason });
  });

  it("sorts disks worst first, then by device in natural order", () => {
    const sorted = sortDisks([
      disk({ canonicaldevicefile: "/dev/sdb", overallstatus: "GOOD" }),
      disk({ canonicaldevicefile: "/dev/sda", overallstatus: "GOOD" }),
      disk({ canonicaldevicefile: "/dev/sdc", overallstatus: "BAD_STATUS" }),
      disk({
        canonicaldevicefile: "/dev/sdd",
        overallstatus: "BAD_SECTOR_MANY",
      }),
      disk({ canonicaldevicefile: "/dev/sde", overallstatus: "BAD_SECTOR" }),
    ]);
    expect(sorted.map((d) => d.canonicaldevicefile)).toEqual([
      "/dev/sdd",
      "/dev/sde",
      "/dev/sdc",
      "/dev/sda",
      "/dev/sdb",
    ]);
  });

  it("reads a temperature sent as text or as a number, and none from the empty string", () => {
    expect(diskTemperature("30")).toBe(30);
    expect(diskTemperature(41)).toBe(41);
    expect(diskTemperature("")).toBeNull();
  });
});

describe("serviceState", () => {
  it("checks for pending changes before calling an enabled service down", () => {
    expect(serviceState(service("samba", true, false), ["samba"])).toBe(
      "pending",
    );
    expect(serviceState(service("samba", true, false), [])).toBe("critical");
    expect(serviceState(service("samba", true, true), [])).toBe("ok");
  });

  it("summarises the services that are off, noting one still running", () => {
    expect(serviceState(service("nfs", false, false), [])).toBe("off");
    expect(serviceState(service("nfs", false, true), ["nfs"])).toBe(
      "offRunning",
    );
  });

  it("splits the captured list into on and off, worst first and by title", () => {
    const { on, off } = serviceSummary(
      [
        ...SERVICES,
        service("zfs", true, false, "ZFS"),
        service("ftp", true, true, "FTP"),
      ],
      [],
    );
    expect(on.map((s) => [s.service.title, s.state])).toEqual([
      ["ZFS", "critical"],
      ["FTP", "ok"],
      ["SSH", "ok"],
    ]);
    expect(off.map((s) => s.service.title)).toEqual([
      "NFS",
      "RSync server",
      "SMB/CIFS",
    ]);
  });
});

describe("visibleInterfaces", () => {
  const LIST = CONTRACT_EXAMPLES.networkEnumerateDevicesList.ethernetAndLoopback
    .value.data as unknown as NetworkDevice[];
  const ETH = LIST[0]!;
  it("leaves out the loopback interface and counts the virtual ones", () => {
    const veth = (n: number): NetworkDevice => ({
      ...ETH,
      devicename: `veth${String(n)}`,
      type: "virtual",
    });
    const { shown, virtualCount } = visibleInterfaces([
      ...LIST,
      ...Array.from({ length: 12 }, (_, i) => veth(i)),
    ]);
    expect(shown.map((d) => d.devicename)).toEqual(["enp2s0"]);
    expect(virtualCount).toBe(12);
  });

  it("names the kinds it knows and nothing else", () => {
    expect(interfaceKind("wifi")).toBe("wifi");
    expect(interfaceKind("unknown")).toBeNull();
    expect(interfaceKind(undefined)).toBeNull();
  });

  it("writes an address with its prefix, and nothing when there is none", () => {
    expect(addressWithPrefix("192.0.2.10", 24)).toBe("192.0.2.10/24");
    expect(addressWithPrefix("", -1)).toBeNull();
  });
});

describe("the chart's samples", () => {
  const info = CONTRACT_EXAMPLES.systemGetInformation.admin.value;
  const at = (t: number, cpu = 10) => ({ t, cpu, memory: 40 });

  it("takes the processor figure and memory as the meter computes it", () => {
    const sample = usageSample(info, 1000);
    expect(sample.t).toBe(1000);
    expect(sample.cpu).toBe(info.cpuUtilization);
    expect(sample.memory).toBeCloseTo(9, 0);
  });

  it("keeps ten minutes, at most 30, and ignores a reply seen twice", () => {
    let samples = addSample([], at(0));
    samples = addSample(samples, at(0, 99));
    expect(samples).toHaveLength(1);
    for (let i = 1; i <= 40; i += 1) {
      samples = addSample(samples, at(i * 20_000));
    }
    expect(samples).toHaveLength(CHART_MAX_SAMPLES);
    const last = samples.at(-1)!;
    expect(last.t - samples[0]!.t).toBeLessThanOrEqual(CHART_WINDOW_MS);
    samples = addSample(samples, at(last.t + CHART_WINDOW_MS + 1));
    expect(samples).toHaveLength(1);
  });

  it("lists the readings newest first, with a row where the line breaks", () => {
    const rows = readingRows([at(0), at(20_000), at(120_000)]);
    expect(rows.map((r) => r.kind)).toEqual([
      "reading",
      "gap",
      "reading",
      "reading",
    ]);
    expect(rows[1]).toEqual({ kind: "gap", after: 20_000, before: 120_000 });
  });
});

describe("attentionRows: storage, disks and services", () => {
  const now = 1_795_089_029_000;
  const info = { ts: now / 1000 };

  it("orders the rows worst first, then by kind", () => {
    const storage = storageItems(
      [
        fs({
          uuid: "w",
          label: "warn",
          percentage: 90,
          usagewarnthreshold: 85,
        }),
        fs({ uuid: "f", label: "full", percentage: 100 }),
        fs({ uuid: "u", label: "unread", percentage: -1 }),
      ],
      missingFileSystems(
        CONTRACT_EXAMPLES.fileSystemMgmtGetList.missing.value
          .data as unknown as ConfiguredFilesystem[],
      ),
    );
    const rows = attentionRows({
      info: { ...info, rebootRequired: true },
      receivedAtMs: now,
      storage,
      disks: {
        readAt: now,
        devices: [
          disk({
            canonicaldevicefile: "/dev/sdb",
            overallstatus: "BAD_SECTOR",
          }),
          disk({
            canonicaldevicefile: "/dev/sda",
            overallstatus: "BAD_SECTOR_MANY",
            monitor: false,
          }),
          disk({
            canonicaldevicefile: "/dev/sdc",
            overallstatus: "BAD_STATUS",
          }),
        ],
      },
      services: [
        service("samba", true, false, "SMB/CIFS"),
        service("ssh", true, true),
      ],
      pending: [],
    });
    expect(rows.map((r) => r.kind)).toEqual([
      "fsFull",
      "fsMissing",
      "diskCritical",
      "servicesDown",
      "fsWarning",
      "diskWarning",
      "restart",
    ]);
    const failing = rows[2];
    expect(failing).toMatchObject({
      device: "/dev/sda",
      monitored: false,
      readAt: now,
    });
    expect(rows[3]).toMatchObject({
      services: [{ name: "samba", title: "SMB/CIFS" }],
    });
  });

  it("raises no row for a service whose changes are waiting to be applied", () => {
    expect(
      attentionRows({
        info,
        receivedAtMs: now,
        services: [service("samba", true, false)],
        pending: ["samba"],
      }),
    ).toEqual([]);
  });
});
