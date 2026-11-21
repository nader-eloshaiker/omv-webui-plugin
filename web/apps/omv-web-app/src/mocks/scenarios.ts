// SPDX-License-Identifier: GPL-3.0-or-later
// The mock's scenarios: which of the contract's examples answer, for `pnpm dev:mock` and the tests.
// Development and test code only (UI-11); a production build never imports this module.
//
// The examples hold no state. The one thing tracked here is whether the mock session is signed in,
// so that a reload starts at sign-in and the screens of signing in can be walked: every operation
// outside Session answers 401 until Session.login (or verify) succeeds, and again after logout.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { Answers, FixedAnswer } from "@omv-webui/react-api-omv/mocks";

export const SCENARIOS = [
  "admin",
  "user",
  "secondFactor",
  "secondFactorOtherKind",
  "wrongPassword",
  "tooManyAttempts",
  "sessionExpired",
  "pendingChanges",
  "applyFails",
  "idleWarning",
  "builtInAdmin",
  "checklistHidden",
  "alertsConfigured",
  "httpsOn",
  "attention",
  "noSharedFolders",
  "folderProblems",
  "readOnlyAccount",
  "storageWarning",
  "storageFull",
  "storageNoReading",
  "storageRootOnly",
  "storageMany",
  "storageMissing",
  "storageEmpty",
  "disksAllGood",
  "disksMixed",
  "disksEmpty",
  "disksFail",
  "disksUnrecognised",
  "serviceDown",
  "servicesNoneOn",
  "servicePlugin",
  "servicePending",
  "networkTwoPorts",
  "networkVirtual",
  "networkNoIpv6",
  "networkWifi",
  "logsLarge",
  "logsHostile",
  "logsFail",
  "processesBusy",
  "serviceOutputs",
  "serviceOutputsEmpty",
] as const;
export type ScenarioName = (typeof SCENARIOS)[number];

export const isScenarioName = (value: unknown): value is ScenarioName =>
  typeof value === "string" && (SCENARIOS as readonly string[]).includes(value);

/** What each scenario shows, for the picker. Development words, not the interface's. */
export const SCENARIO_LABELS: Record<ScenarioName, string> = {
  admin: "Administrator",
  user: "Normal user",
  secondFactor: "Second factor (one-time code)",
  secondFactorOtherKind: "Second factor of another kind",
  wrongPassword: "Wrong password",
  tooManyAttempts: "Too many attempts",
  sessionExpired: "Session ends after loading",
  pendingChanges: "Administrator, changes pending",
  applyFails: "Administrator, applying fails",
  idleWarning: "Idle warning soon (1-minute timeout)",
  builtInAdmin: "Administrator signed in as admin",
  checklistHidden: "Administrator, set-up checklist hidden",
  alertsConfigured: "Administrator, email alerts set up",
  httpsOn: "Administrator, HTTPS on",
  attention: "Administrator, restart needed and clocks differ",
  noSharedFolders: "Administrator, no shared folders",
  folderProblems: "Administrator, shared folders that cannot be reached",
  readOnlyAccount: "Normal user, account locked",
  storageWarning: "Dashboard: a file system past its warning level",
  storageFull: "Dashboard: a file system full",
  storageNoReading: "Dashboard: a file system with no reading",
  storageRootOnly: "Dashboard: only the system drive",
  storageMany: "Dashboard: more than six file systems",
  storageMissing: "Dashboard: a file system missing",
  storageEmpty: "Dashboard: no file systems",
  disksAllGood: "Disk health: all good, all monitored",
  disksMixed: "Disk health: one of each state",
  disksEmpty: "Disk health: no disk reports",
  disksFail: "Disk health: the check fails",
  disksUnrecognised: "Disk health: an unrecognised reading",
  serviceDown: "Services: one on but not running",
  servicesNoneOn: "Services: none on",
  servicePlugin: "Services: a plugin's service",
  servicePending: "Services: SMB/CIFS saved, not applied",
  networkTwoPorts: "Network: two ports, one unplugged",
  networkVirtual: "Network: twelve virtual interfaces",
  networkNoIpv6: "Network: no IPv6, speed not reported",
  networkWifi: "Network: a Wi-Fi interface",
  logsLarge: "System logs: 5,000 entries",
  logsHostile: "System logs: long and markup-looking lines",
  logsFail: "System logs: reading fails",
  processesBusy: "Processes: stopped, zombie, swap, long command",
  serviceOutputs: "Service details: SMB, NFS and SSH in use",
  serviceOutputsEmpty: "Service details: on, nothing to show",
};

/** The scenarios signed in as a normal user. */
const USER_SCENARIOS: readonly ScenarioName[] = ["user", "readOnlyAccount"];

// Session replies with no captured example: written here, in the shape OMV sends (A3, A8).
const NOT_SIGNED_IN: FixedAnswer = {
  status: 401,
  message: "Session not authenticated.",
};
const SESSION_EXPIRED: FixedAnswer = {
  status: 401,
  message: "Session expired.",
};
// A challenge of a kind this interface has no form for (the e-mail code plugin, for one). Not
// captured: no such plugin was installed on the test VM (A10). OMV would also send the stock
// interface's redirect address, which the transport drops; it is left out here.
const OTHER_KIND_CHALLENGE: FixedAnswer = {
  status: 200,
  value: {
    username: "example-2fa",
    status: "challengeRequired",
    challenge: { kind: "emailotp" },
  },
};
// A one-minute timeout, so the idle warning opens after 30 seconds in the browser.
const ONE_MINUTE: FixedAnswer = { status: 200, value: { timeout: 1 } };

// Replies written from the contract's examples for states no capture shows. Each changes only what
// its scenario is about; the rest is the captured example.
const LOGIN = CONTRACT_EXAMPLES.sessionLogin;
const INFO = CONTRACT_EXAMPLES.systemGetInformation;
const ACCOUNT = CONTRACT_EXAMPLES.userMgmtGetUserByContext.user.value;
const FOLDERS = CONTRACT_EXAMPLES.shareMgmtGetList.populated.value;

/** The built-in administrator, whose password the factory one is. */
const BUILT_IN_ADMIN_LOGIN: FixedAnswer = {
  status: 200,
  value: { ...LOGIN.authenticated.value, username: "admin" },
};
const BUILT_IN_ADMIN_ACCOUNT: FixedAnswer = {
  status: 200,
  value: { ...ACCOUNT, name: "admin" },
};
/** An account the administrator has locked (OMV's "disallow user modification"). */
const LOCKED_ACCOUNT: FixedAnswer = {
  status: 200,
  value: { ...ACCOUNT, _readonly: true },
};

const FOLDER = FOLDERS.data[0];
/** Three folders that cannot be reached, one for each reason OMV reports, beside the healthy one. */
const PROBLEM_FOLDERS: FixedAnswer = {
  status: 200,
  value: {
    total: 4,
    data: [
      FOLDER,
      {
        ...FOLDER,
        uuid: "00000000-0000-4000-8000-000000000011",
        name: "backups",
        comment: "",
        reldirpath: "backups/",
        absdirpath:
          "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000003/backups/",
        description: "backups",
        status: "ENOENT",
      },
      {
        ...FOLDER,
        uuid: "00000000-0000-4000-8000-000000000012",
        name: "photos",
        comment: "",
        reldirpath: "photos",
        absdirpath:
          "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000003/photos",
        description: "photos",
        status: "ENOTDIR",
      },
      {
        ...FOLDER,
        uuid: "00000000-0000-4000-8000-000000000013",
        name: "old-disk",
        comment: "",
        reldirpath: "old/",
        device: "",
        absdirpath: "",
        description: "old-disk",
        status: "ENOENT_DB_MNTENT",
      },
    ],
  },
};

/**
 * The examples were captured at a fixed moment, so their `ts` is in the past. The mock moves it to
 * now, so the dashboard's clock check compares like with like; the "attention" scenario keeps the
 * captured time, so the clocks differ.
 */
function information(
  example: keyof typeof INFO,
  change: { now: boolean; rebootRequired?: boolean },
): FixedAnswer {
  const { status, value } = INFO[example];
  if (status !== 200) {
    return { status, message: value.message };
  }
  return {
    status,
    value: {
      ...value,
      ...(change.now ? { ts: Math.floor(Date.now() / 1000) } : {}),
      ...(change.rebootRequired ? { rebootRequired: true } : {}),
    },
  };
}

/** The one folder matches a search for any of its words; anything else finds nothing (A2). */
function folderSearch(params: unknown): "populated" | "searchNoMatch" {
  const search = (params as { search?: unknown } | null)?.search;
  if (typeof search !== "string" || search === "") {
    return "populated";
  }
  return JSON.stringify(FOLDER).toLowerCase().includes(search.toLowerCase())
    ? "populated"
    : "searchNoMatch";
}

// ---- Phase 5: dashboard and monitoring. Replies written from the captured examples for states the
// test VM does not show; each changes only what its scenario is about.

type Mounted =
  (typeof CONTRACT_EXAMPLES.fileSystemMgmtEnumerateMountedFilesystems.withRoot.value)[number];
const MOUNTED =
  CONTRACT_EXAMPLES.fileSystemMgmtEnumerateMountedFilesystems.withRoot.value;
const DATA_FS: Mounted = MOUNTED[0];
const ROOT_FS: Mounted = MOUNTED[1];
const GIB = 1024 ** 3;

/** A data file system like the captured one, with its own name, size and fill. */
function dataFs(
  n: number,
  label: string,
  percent: number,
  threshold: number,
): Record<string, unknown> {
  const size = 100 * GIB;
  const available = percent < 0 ? -1 : Math.round(size * (1 - percent / 100));
  const id = `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
  return {
    ...DATA_FS,
    devicename: `sd${String.fromCharCode(97 + n)}1`,
    canonicaldevicefile: `/dev/sd${String.fromCharCode(97 + n)}1`,
    devicefile: `/dev/disk/by-uuid/${id}`,
    uuid: id,
    label,
    mountpoint: `/srv/dev-disk-by-uuid-${id}`,
    size: percent < 0 ? "-1" : String(size),
    available: String(available),
    used: percent < 0 ? "-1" : `${String(percent)}.00 GiB`,
    percentage: percent,
    usagewarnthreshold: threshold,
  };
}

const mounted = (...rows: unknown[]): FixedAnswer => ({
  status: 200,
  value: rows,
});
const MOUNTED_SCENARIOS: Partial<
  Record<ScenarioName, FixedAnswer | "nearlyFull" | "empty">
> = {
  storageWarning: "nearlyFull",
  storageFull: mounted(dataFs(1, "backups", 100, 0), DATA_FS, ROOT_FS),
  storageNoReading: mounted(dataFs(1, "usb-disk", -1, 85), DATA_FS, ROOT_FS),
  storageRootOnly: mounted(ROOT_FS),
  storageEmpty: "empty",
  storageMany: mounted(
    ROOT_FS,
    ...Array.from({ length: 13 }, (_, i) =>
      dataFs(i + 1, `disk${String(i + 1)}`, 10 + i * 6, i % 2 === 0 ? 85 : 0),
    ),
  ),
};

type SmartDevice = Record<string, unknown> & {
  overallstatus: string;
  monitor: boolean;
};
const SMART_DEVICES = (
  JSON.parse(
    CONTRACT_EXAMPLES.execGetOutput.smartDevicesFinished.value.output,
  ) as {
    data: SmartDevice[];
  }
).data;
const SMART_FINISHED =
  CONTRACT_EXAMPLES.execGetOutput.smartDevicesFinished.value;
const smartHdd = (
  n: number,
  status: string,
  monitor: boolean,
  temperature: string | number,
) => ({
  ...SMART_DEVICES[1],
  devicename: `sd${String.fromCharCode(97 + n)}`,
  canonicaldevicefile: `/dev/sd${String.fromCharCode(97 + n)}`,
  model: "Example HDD 4TB",
  size: "4000787030016",
  temperature,
  overallstatus: status,
  monitor,
});
/** The last poll of a disk-health task whose result is `devices`. */
function smartFinished(devices: readonly unknown[]): FixedAnswer {
  const output = JSON.stringify({ total: devices.length, data: devices });
  return {
    status: 200,
    value: { ...SMART_FINISHED, output, pos: output.length },
  };
}
const SMART_SCENARIOS: Partial<
  Record<ScenarioName, FixedAnswer | "smartManyBadSectorsFinished">
> = {
  disksAllGood: smartFinished([
    { ...SMART_DEVICES[0], monitor: true },
    smartHdd(0, "GOOD", true, "34"),
    smartHdd(1, "GOOD", true, 36),
  ]),
  disksMixed: smartFinished([
    { ...SMART_DEVICES[0], monitor: true },
    smartHdd(0, "BAD_SECTOR", true, "38"),
    smartHdd(1, "BAD_ATTRIBUTE_IN_THE_PAST", false, "41"),
    smartHdd(2, "BAD_SECTOR_MANY", false, 44),
    smartHdd(3, "BAD_ATTRIBUTE_NOW", true, "61"),
    smartHdd(4, "BAD_STATUS", true, ""),
  ]),
  disksEmpty: smartFinished([]),
  disksUnrecognised: smartFinished([
    { ...SMART_DEVICES[0], monitor: true },
    smartHdd(0, "<b>SOMETHING_NEW</b>", true, ""),
  ]),
  // A disk-health task that fails: the last poll is refused, as a failed task's is (A6).
  disksFail: {
    status: 500,
    message:
      "Failed to execute command 'smartctl --xall --json /dev/sda': exit code '2'.",
  },
};

interface Service {
  name: string;
  title: string;
  enabled: boolean;
  running: boolean;
}
const SERVICES = CONTRACT_EXAMPLES.servicesGetStatus.sshOnly.value
  .data as unknown as Service[];
const services = (
  change: Record<string, Partial<Service>>,
  extra: Service[] = [],
): FixedAnswer => {
  const data = [
    ...SERVICES.map((s) => ({ ...s, ...change[s.name] })),
    ...extra,
  ];
  return { status: 200, value: { total: data.length, data } };
};
const SERVICE_SCENARIOS: Partial<
  Record<ScenarioName, FixedAnswer | "serviceStopped">
> = {
  serviceDown: "serviceStopped",
  servicesNoneOn: services({ ssh: { enabled: false, running: false } }),
  servicePlugin: services({}, [
    { name: "minidlna", title: "DLNA", enabled: true, running: false },
  ]),
  servicePending: services({ samba: { enabled: true, running: false } }),
  serviceOutputs: services({
    samba: { enabled: true, running: true },
    nfs: { enabled: true, running: true },
  }),
  serviceOutputsEmpty: services({
    samba: { enabled: true, running: true },
    nfs: { enabled: true, running: true },
  }),
};

/** System.getInformation with SMB/CIFS saved and not applied. */
function sambaPending(): FixedAnswer {
  const { value } = INFO.adminPendingChanges;
  return {
    status: 200,
    value: {
      ...value,
      ts: Math.floor(Date.now() / 1000),
      dirtyModules: { samba: "SMB/CIFS file sharing." },
    },
  };
}

type Device =
  (typeof CONTRACT_EXAMPLES.networkEnumerateDevicesList.ethernetAndLoopback.value.data)[number];
const DEVICES =
  CONTRACT_EXAMPLES.networkEnumerateDevicesList.ethernetAndLoopback.value.data;
const ETH: Device = DEVICES[0];
const devices = (...rows: unknown[]): FixedAnswer => ({
  status: 200,
  value: { total: rows.length, data: rows },
});
const NETWORK_SCENARIOS: Partial<Record<ScenarioName, FixedAnswer | "wifi">> = {
  networkTwoPorts: devices(...DEVICES, {
    ...ETH,
    uuid: "00000000-0000-4000-8000-000000000007",
    devicename: "enp3s0",
    address: "",
    prefix: -1,
    address6: "",
    prefix6: -1,
    ether: "00:00:5e:00:53:03",
    state: "DOWN",
    link: false,
    speed: -1,
    description: "enp3s0 [00:00:5e:00:53:03]",
  }),
  networkVirtual: devices(
    ...DEVICES,
    ...Array.from({ length: 12 }, (_, i) => ({
      ...DEVICES[1],
      devicename: `veth${String(i).padStart(4, "0")}a`,
      type: "virtual",
      state: "UP",
      speed: 10000,
    })),
  ),
  networkNoIpv6: devices(
    {
      ...ETH,
      address6: "",
      prefix6: -1,
      speed: -1,
      type: "bond",
      devicename: "bond0",
    },
    DEVICES[1],
  ),
  networkWifi: "wifi",
};

type LogRow =
  (typeof CONTRACT_EXAMPLES.logFileGetList.syslog.value.data)[number];
const SYSLOG_ROW: LogRow =
  CONTRACT_EXAMPLES.logFileGetList.syslog.value.data[0];
const SYSLOG_TS = SYSLOG_ROW.ts;
const SERVICES_LOGGING = [
  "sshd[812]",
  "systemd[1]",
  "smartd[640]",
  "openmediavault-webgui[85363]",
  "monit[702]",
];
/** A syslog of 5,000 entries, newest first, one every 30 seconds. */
const LARGE_SYSLOG: FixedAnswer = {
  status: 200,
  value: {
    total: 5000,
    data: Array.from({ length: 5000 }, (_, i) => {
      const rownum = 4999 - i;
      const ts = SYSLOG_TS - i * 30;
      return {
        rownum,
        ts,
        date: SYSLOG_ROW.date,
        hostname: SYSLOG_ROW.hostname,
        message: `${SERVICES_LOGGING[rownum % SERVICES_LOGGING.length] ?? ""}: entry ${String(rownum)} of the example log`,
      };
    }),
  },
};
const HOSTILE_SYSLOG: FixedAnswer = {
  status: 200,
  value: {
    total: 4,
    data: [
      {
        ...SYSLOG_ROW,
        rownum: 3,
        message: `kernel: ${"a very long line ".repeat(125)}end`,
      },
      {
        ...SYSLOG_ROW,
        rownum: 2,
        ts: SYSLOG_TS - 1,
        message: '<img src=x onerror="alert(1)"> <script>alert(2)</script>',
      },
      {
        ...SYSLOG_ROW,
        rownum: 1,
        ts: SYSLOG_TS - 2,
        message: "‮right-to-left override, then javascript:alert(3)",
      },
      {
        ...SYSLOG_ROW,
        rownum: 0,
        ts: SYSLOG_TS - 3,
        message: "שלום from a right-to-left message",
      },
    ],
  },
};
const LOG_FAILS: FixedAnswer = {
  status: 500,
  message: "Failed to execute command 'journalctl --no-pager': exit code '1'.",
};

type TopInfo = typeof CONTRACT_EXAMPLES.systemGetTopInfo.json.value;
const TOP: TopInfo = CONTRACT_EXAMPLES.systemGetTopInfo.json.value;
const BUSY_TOP: FixedAnswer = {
  status: 200,
  value: {
    ...TOP,
    tasks_total: "176",
    tasks_running: "2",
    tasks_sleeping: "171",
    tasks_stopped: "1",
    tasks_zombie: "2",
    swap_total: "1024.0",
    swap_used: "256.0",
    swap_free: "768.0",
    processes: [
      {
        ...TOP.processes[0],
        PID: "4242",
        USER: "example-user",
        "%CPU": "87.3",
        RES: "1073741824",
        S: "R",
        "TIME+": "123:45.67",
        COMMAND: `/usr/bin/python3 ${"--option=value ".repeat(32)}<b>end</b>`,
      },
      { ...TOP.processes[1], PID: "4243", S: "Z", COMMAND: "defunct-child" },
      { ...TOP.processes[1], PID: "4244", S: "Z", COMMAND: "another-defunct" },
      {
        ...TOP.processes[1],
        PID: "4245",
        S: "T",
        "%CPU": "0.3",
        COMMAND: "paused-job",
      },
      ...TOP.processes,
    ],
  },
};

export interface MockSession {
  signedIn: boolean;
  /** A password was accepted and a second factor is awaited (A10). */
  pending: boolean;
  /** The next 401 says the session expired, as OMV's first answer after a timeout does. */
  expiring: boolean;
  /** Configuration changes are saved and not applied. A finished apply or undo clears it. */
  dirty: boolean;
  /** An administrator hid the set-up checklist (WebGui.dismissWelcomeMessage). */
  welcomeDismissed: boolean;
}

export const newMockSession = (
  signedIn = false,
  dirty = false,
): MockSession => ({
  signedIn,
  pending: false,
  expiring: false,
  dirty,
  welcomeDismissed: false,
});

/** Whether a scenario starts with changes pending. */
export const startsDirty = (name: ScenarioName): boolean =>
  name === "pendingChanges" ||
  name === "applyFails" ||
  name === "servicePending";

// The handle the contract's apply example returns.
const APPLY_HANDLE = "/tmp/bgstatus7k6uanc46kul3JYrbbi";
// The handle the contract's disk health example returns.
const SMART_HANDLE = CONTRACT_EXAMPLES.smartGetListBg.smartDevices.value;
// The handles of the contract's wipe and self-test examples.
const WIPE_HANDLE = CONTRACT_EXAMPLES.diskMgmtWipe.started.value;
const SELF_TEST_HANDLE =
  CONTRACT_EXAMPLES.smartExecuteScheduledTest.started.value;

/** The logs of stock OMV; any other id fails, as on OMV (the plugins' logs are not mocked). */
const CORE_LOGS = new Set([
  "syslog",
  "daemon",
  "auth",
  "messages",
  "boot",
  "dmesg",
  "rsyncd",
  "smartd",
  "dpkg",
  "rsync",
  "apt_term",
  "apt_history",
  "smbdaudit",
]);

/** The captured logs answer as captured; the other stock logs are empty, as smartd was. */
function logFor(
  params: unknown,
): "syslog" | "updates" | "smbAudit" | "empty" | "unknownLog" {
  const id = (params as { id?: unknown } | null)?.id;
  switch (id) {
    case "syslog":
      return "syslog";
    case "apt_term":
      return "updates";
    case "smbdaudit":
      return "smbAudit";
    default:
      return typeof id === "string" && CORE_LOGS.has(id)
        ? "empty"
        : "unknownLog";
  }
}

/** A service that is on but has nothing to report: only whitespace. */
const EMPTY_OUTPUT: FixedAnswer = { status: 200, value: "\n" };

const SIGNED_IN_EXAMPLES = new Set(["authenticated", "authenticatedUser"]);

function signsIn(answer: string | FixedAnswer): boolean {
  if (typeof answer === "string") {
    return SIGNED_IN_EXAMPLES.has(answer);
  }
  const value = answer.value as { status?: unknown } | undefined;
  return answer.status === 200 && value?.status === "authenticated";
}

function challenges(answer: string | FixedAnswer): boolean {
  if (typeof answer === "string") {
    return answer === "challengeRequired";
  }
  const value = answer.value as { status?: unknown } | undefined;
  return answer.status === 200 && value?.status === "challengeRequired";
}

/**
 * The answers of a scenario. `session` is the mock's sign-in state, shared by every answer; start
 * it signed in to skip the sign-in screen. Like OMV, any other call while a second factor is
 * awaited discards the pending login, and Session.verify then answers 401 (A10).
 */
export function scenarioAnswers(
  name: ScenarioName,
  session: MockSession = newMockSession(),
): Answers {
  const user = USER_SCENARIOS.includes(name);
  let ended = false;
  let readsBeforeEnd = 2;

  const login =
    <T extends string>(reply: () => T | FixedAnswer) =>
    (): T | FixedAnswer => {
      const answer = reply();
      session.pending = challenges(answer);
      if (signsIn(answer)) {
        session.signedIn = true;
      }
      return answer;
    };

  const guarded =
    <T extends string>(example: T | FixedAnswer) =>
    (): T | FixedAnswer => {
      session.pending = false;
      if (name === "sessionExpired" && session.signedIn && !ended) {
        // The reads of the boot succeed; the next call finds the session gone, once.
        if (--readsBeforeEnd < 0) {
          ended = true;
          session.signedIn = false;
          session.expiring = true;
        }
      }
      if (!session.signedIn) {
        if (session.expiring) {
          session.expiring = false;
          return SESSION_EXPIRED;
        }
        return NOT_SIGNED_IN;
      }
      return example;
    };

  /** A write that leaves its change pending, as a saved setting does on OMV. */
  const pending =
    <T extends string>(example: T) =>
    (): T | FixedAnswer => {
      const answer = guarded(example)();
      if (answer === example) {
        session.dirty = true;
      }
      return answer;
    };

  return {
    sessionLogin: login(() => {
      switch (name) {
        case "user":
        case "readOnlyAccount":
          return "authenticatedUser";
        case "builtInAdmin":
          return BUILT_IN_ADMIN_LOGIN;
        case "secondFactor":
          return "challengeRequired";
        case "secondFactorOtherKind":
          return OTHER_KIND_CHALLENGE;
        case "wrongPassword":
          return "wrongPassword";
        case "tooManyAttempts":
          return "tooManyAttempts";
        default:
          return "authenticated";
      }
    }),
    sessionVerify: () => {
      if (!session.pending) {
        return "noPendingLogin";
      }
      if (name === "tooManyAttempts") {
        return "tooManyAttempts";
      }
      session.pending = false;
      session.signedIn = true;
      return "authenticated";
    },
    sessionLogout: () => {
      session.signedIn = false;
      session.pending = false;
      return "null";
    },
    systemGetInformation: () =>
      name === "servicePending" && session.dirty
        ? guarded<never>(sambaPending())()
        : guarded<never>(
            information(
              user
                ? "user"
                : session.dirty
                  ? "adminPendingChanges"
                  : name === "checklistHidden" || session.welcomeDismissed
                    ? "adminWelcomeDismissed"
                    : "admin",
              {
                now: name !== "attention",
                rebootRequired: name === "attention",
              },
            ),
          )(),
    userMgmtGetUserByContext: guarded(
      name === "builtInAdmin"
        ? BUILT_IN_ADMIN_ACCOUNT
        : name === "readOnlyAccount"
          ? LOCKED_ACCOUNT
          : "user",
    ),
    webGuiGetAutoLogoutSettings: guarded(
      name === "idleWarning" ? ONE_MINUTE : user ? "user" : "admin",
    ),
    configIsDirty: () => guarded(session.dirty ? "dirty" : "clean")(),
    configApplyChangesBg: guarded("applied"),
    configRevertChangesBg: guarded("reverted"),
    // The last poll of a task: an apply that fails (A6: HTTP 500 with the Salt log), or a finished
    // apply or undo, after which nothing is pending.
    execGetOutput: ({ params }) => {
      const filename = (params as { filename?: unknown } | null)?.filename;
      if (filename === SMART_HANDLE) {
        return guarded(SMART_SCENARIOS[name] ?? "smartDevicesFinished")();
      }
      if (filename === WIPE_HANDLE) {
        return guarded("wipeFinished")();
      }
      if (filename === SELF_TEST_HANDLE) {
        return guarded("selfTestFinished")();
      }
      const apply = filename === APPLY_HANDLE;
      if (apply && name === "applyFails") {
        return guarded("applyFailed")();
      }
      const answer = guarded(apply ? "appliedFinished" : "revertedFinished")();
      if (typeof answer === "string") {
        session.dirty = false;
      }
      return answer;
    },
    execIsRunning: guarded("running"),
    execStop: guarded("null"),
    sshGet: guarded("defaults"),
    // Saving marks ssh and avahi dirty on OMV, so the band appears (Phase 1).
    sshSet: () => {
      const answer = guarded("saved")();
      if (answer === "saved") {
        session.dirty = true;
      }
      return answer;
    },
    shareMgmtGetList: ({ params }) =>
      guarded(
        name === "noSharedFolders"
          ? "empty"
          : name === "folderProblems"
            ? PROBLEM_FOLDERS
            : folderSearch(params),
      )(),
    webGuiGetSettings: guarded(name === "httpsOn" ? "https" : "http"),
    emailNotificationGet: guarded(
      name === "alertsConfigured" ? "configured" : "notConfigured",
    ),
    systemGetTimeSettings: guarded("defaults"),
    networkGetGeneralSettings: guarded("noDomain"),
    webGuiDismissWelcomeMessage: () => {
      const answer = guarded("null")();
      if (answer === "null") {
        session.welcomeDismissed = true;
      }
      return answer;
    },
    userMgmtSetUserByContext: guarded("saved"),
    userMgmtSetPasswordByContext: guarded("null"),
    // Dashboard and monitoring (Phase 5): the test VM as captured.
    fileSystemMgmtEnumerateMountedFilesystems: guarded(
      MOUNTED_SCENARIOS[name] ?? "withRoot",
    ),
    fileSystemMgmtGetList: guarded(
      name === "storageMissing" ? "missing" : "configured",
    ),
    smartGetListBg: guarded("smartDevices"),
    servicesGetStatus: guarded(SERVICE_SCENARIOS[name] ?? "sshOnly"),
    networkEnumerateDevicesList: guarded(
      NETWORK_SCENARIOS[name] ?? "ethernetAndLoopback",
    ),
    logFileGetList: ({ params }) => {
      const log = logFor(params);
      if (log === "syslog" && name === "logsLarge") {
        return guarded<never>(LARGE_SYSLOG)();
      }
      if (log === "syslog" && name === "logsHostile") {
        return guarded<never>(HOSTILE_SYSLOG)();
      }
      if (log !== "unknownLog" && name === "logsFail") {
        return guarded<never>(LOG_FAILS)();
      }
      return guarded(log)();
    },
    systemGetTopInfo: guarded(name === "processesBusy" ? BUSY_TOP : "json"),
    // Disks and disk health (Phase 5): the test VM as captured. A saved setting is pending, as on
    // OMV, where each of these marks the smartmontools module dirty.
    diskMgmtEnumerateDevices: guarded("vmDisks"),
    diskMgmtGetList: guarded("vmDisks"),
    diskMgmtGetHdParm: guarded("configured"),
    diskMgmtSetHdParm: pending("created"),
    diskMgmtWipe: guarded("started"),
    diskMgmtRescan: guarded("null"),
    smartEnumerateDevices: guarded("vmDisks"),
    smartEnumerateMonitoredDevices: guarded("none"),
    smartGetSettings: guarded("defaults"),
    smartSetSettings: pending("saved"),
    smartGetDeviceSettings: guarded("monitored"),
    smartSetDeviceSettings: pending("created"),
    smartGetInformation: guarded("nvme"),
    smartGetAttributes: guarded("nvme"),
    smartGetSelfTestLogs: guarded("nvme"),
    smartGetExtendedInformation: guarded("nvme"),
    smartGetScheduleList: guarded("none"),
    smartGetScheduledTest: guarded("configured"),
    smartSetScheduledTest: pending("created"),
    smartDeleteScheduledTest: pending("deleted"),
    smartExecuteScheduledTest: guarded("started"),
    // The RAID plugin is not installed on the test VM: OMV answers the unknown service with 404.
    mdMgmtEnumerateDevices: guarded("notInstalled"),
    fileSystemMgmtEnumerateFilesystems: guarded("vmFilesystems"),
    smbGetStats: () =>
      guarded(
        name === "servicePending" && session.dirty
          ? "pendingChanges"
          : // SMB/CIFS is on and running in these scenarios, so it reports its connections.
            name === "serviceOutputs" || name === "serviceDown"
            ? "connected"
            : name === "serviceOutputsEmpty"
              ? EMPTY_OUTPUT
              : "disabled",
      )(),
    nfsGetStats: guarded(
      name === "serviceOutputs"
        ? "exports"
        : name === "serviceOutputsEmpty"
          ? EMPTY_OUTPUT
          : "disabled",
    ),
    // The pending changes of the mock are the ssh and avahi modules (adminPendingChanges), so only
    // SSH's details wait for them, as on OMV.
    sshGetStats: () =>
      guarded(
        session.dirty && name !== "servicePending"
          ? "pendingChanges"
          : name === "serviceOutputs"
            ? "connected"
            : "noConnections",
      )(),
  };
}
