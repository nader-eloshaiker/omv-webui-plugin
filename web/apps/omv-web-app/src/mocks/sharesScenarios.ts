// SPDX-License-Identifier: GPL-3.0-or-later
// The shares scenarios of the mock (phase 5 shares design 13): shared folders, access, and sharing
// over SMB. Development and test code only (UI-11).
//
// In the shares* stories these answers REMEMBER what the reader did, as the file-system, RAID and ZFS
// mocks do, so the journeys of the design's sections 1 to 8 can be walked on `pnpm dev:mock`. What they
// do is what the test VM showed (OMV 8.6.1, journal 2026-11-22):
// - ShareMgmt.set makes the record first and then the folder on the disk at once; the stored path has
//   a trailing slash ("/" stays "/"); a new folder's reply carries mode "770"; an exact name or the same
//   path on the same file system is refused, as is ".." in the path; a change keeps the access list;
// - ShareMgmt.setPrivileges replaces the whole list ([] is stored as ""), refusing an account that does
//   not exist and the web administrator `admin`;
// - ShareMgmt.delete is refused while any SMB share refers to the folder (even one turned off) or
//   anything else uses it; with its files it is refused when another shared folder uses the same folder
//   or one inside it; the files go at once;
// - SMB.setShare allows one share per shared folder and refuses a body that carries
//   `sharedfoldername`; SMB.setSettings writes what is sent over what is stored and refuses to turn SMB
//   on for a NAS name over 15 characters; SMB.getShareList fails outright when a share names a shared
//   folder whose record is gone;
// - getUserList never lists the web administrator `admin`, getGroupList never lists `users`;
// - pending modules: ShareMgmt.set and setPrivileges mark sharedfolders and systemd, and samba and
//   avahi too when the folder has an SMB share; the SMB writes mark samba and avahi; ShareMgmt.delete
//   marks sharedfolders, systemd and task. An apply commits the configuration and SMB runs at once (on
//   the VM, about 5 s later); an undo brings back the configuration as last applied, but not what
//   happened on the disk: an undone new folder's record goes and its empty folder stays, and a folder
//   deleted with its files comes back with status ENOENT (B4, B5).
//
// Every reply is built from a captured example. The states the VM did not show (failures of the add
// flow at each step, a 40-second delete, 140 folders and 1,000 people, hostile names, broken folders of
// every kind) are WRITTEN BY HAND from the captured shapes and say so in their labels. No value comes
// from a real system: names are documentation names, UUIDs documentation values, the host "nas".
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  ConfiguredFilesystem,
  SharedFolder,
  SharedFolderPrivilege,
  SharedFolderPrivileges,
  SmbSettings,
  SmbShare,
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { delay, http } from "msw";

export const SHARES_SCENARIOS = [
  "sharesNone",
  "sharesSome",
  "sharesMany",
  "sharesBroken",
  "sharesSmbDown",
  "sharesNoUsers",
  "sharesStale",
  "sharesClassicOptions",
  "sharesUsedElsewhere",
  "sharesWholeFs",
  "sharesLongHost",
  "sharesAddFails",
  "sharesAddFailsCheck",
  "sharesAddFailsNotMade",
  "sharesAddFailsNoDir",
  "sharesAddFailsAccess",
  "sharesAddFailsSmbOn",
  "sharesAddFailsShare",
  "sharesAddFailsApply",
  "sharesAddFailsVerify",
  "sharesAddFailsCut",
  "sharesDeleteSlow",
  "sharesHostile",
] as const;
export type SharesScenarioName = (typeof SHARES_SCENARIOS)[number];

export const SHARES_SCENARIO_LABELS: Record<SharesScenarioName, string> = {
  sharesNone:
    "Shares: no shared folder, SMB off, alex, sam and the group family",
  sharesSome:
    "Shares: Photos shared with alex and sam, Public with guests, Backups not shared; SMB on",
  sharesMany:
    "Shares: 140 shared folders, 1,000 people and 60 groups (hand-written)",
  sharesBroken:
    "Shares: a folder of each Critical state and an unknown code (hand-written)",
  sharesSmbDown: "Shares: SMB on but not running (hand-written)",
  sharesNoUsers: "Shares: no user accounts and no groups",
  sharesStale:
    "Shares: access entries for a deleted account and group, and a Blocked person (hand-written)",
  sharesClassicOptions:
    "Shares: a share with recycle bin, Time Machine and Guests only set in the classic interface",
  sharesUsedElsewhere:
    "Shares: Backups used by a setting this interface does not show (hand-written)",
  sharesWholeFs:
    "Shares: a folder using the whole file system, and one inside another",
  sharesLongHost: "Shares: a NAS name of 16 characters, SMB off (hand-written)",
  sharesAddFails:
    "Add a shared folder: each new folder fails at the next step in turn (hand-written)",
  sharesAddFailsCheck:
    "Add a shared folder: the file systems are gone when the run checks again (hand-written)",
  sharesAddFailsNotMade:
    "Add a shared folder: the shared folder is not made (hand-written)",
  sharesAddFailsNoDir:
    "Add a shared folder: the record is made, its folder on the disk is not (hand-written)",
  sharesAddFailsAccess:
    "Add a shared folder: giving access fails once (hand-written)",
  sharesAddFailsSmbOn:
    "Add a shared folder: turning SMB on fails once (hand-written)",
  sharesAddFailsShare:
    "Add a shared folder: sharing it over SMB fails once (hand-written)",
  sharesAddFailsApply:
    "Add a shared folder: applying the changes fails once (hand-written)",
  sharesAddFailsVerify:
    "Add a shared folder: applied, but SMB does not start (hand-written)",
  sharesAddFailsCut:
    "Add a shared folder: the request to make it is cut after it was made (hand-written)",
  sharesDeleteSlow:
    "Shares: deleting Big with its files takes 40 s; deleting Huge is cut (hand-written)",
  sharesHostile:
    "Shares: long, right-to-left and markup-looking names and descriptions (hand-written)",
};

export const isSharesScenario = (name: string): name is SharesScenarioName =>
  (SHARES_SCENARIOS as readonly string[]).includes(name);

/** Where the add flow is made to fail (design 6.6). */
export type AddFailure =
  | "check"
  | "notMade"
  | "noDir"
  | "access"
  | "smbOn"
  | "share"
  | "apply"
  | "verify"
  | "cut";

/** sharesAddFails: the k-th new shared folder (counted from 0) meets failure k of these, wrapping. */
export const ADD_FAILURES_IN_TURN = [
  "notMade",
  "noDir",
  "access",
  "smbOn",
  "share",
  "apply",
  "verify",
  "cut",
] as const satisfies readonly AddFailure[];

const FIXED_FAILURE: Partial<Record<SharesScenarioName, AddFailure>> = {
  sharesAddFailsCheck: "check",
  sharesAddFailsNotMade: "notMade",
  sharesAddFailsNoDir: "noDir",
  sharesAddFailsAccess: "access",
  sharesAddFailsSmbOn: "smbOn",
  sharesAddFailsShare: "share",
  sharesAddFailsApply: "apply",
  sharesAddFailsVerify: "verify",
  sharesAddFailsCut: "cut",
};

/**
 * The failure the k-th new shared folder of a story meets: the fixed one of a sharesAddFails<Step>
 * story, the k-th in turn in sharesAddFails, none elsewhere. A refused new folder's "Try again" is a
 * new folder too, so sharesAddFailsNotMade refuses only every other one (the first, the third, ...).
 */
export function addFailureOf(
  name: SharesScenarioName,
  k: number,
): AddFailure | null {
  if (name === "sharesAddFails") {
    return ADD_FAILURES_IN_TURN[k % ADD_FAILURES_IN_TURN.length] ?? null;
  }
  if (name === "sharesAddFailsNotMade" && k % 2 === 1) {
    return null;
  }
  return FIXED_FAILURE[name] ?? null;
}

/** OMV's descriptions of the modules the shares methods mark dirty; "" where OMV gives none here. */
export const SHARES_MODULES = {
  sharedfolders: "",
  systemd: "",
  samba: "SMB/CIFS file sharing.",
  avahi: "Framework for Multicast DNS Service Discovery.",
  task: "",
} as const;
export type SharesModule = keyof typeof SHARES_MODULES;

const FOLDER_MODULES = ["sharedfolders", "systemd"] as const;
const SMB_MODULES = ["samba", "avahi"] as const;
const DELETE_MODULES = ["sharedfolders", "systemd", "task"] as const;

/** The marker OMV takes for "a new object" (ShareMgmt.set, SMB.setShare). */
export const NEW_OBJECT = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";

// ---- Small helpers --------------------------------------------------------------------------------

const ok = (value: unknown): FixedAnswer => ({ status: 200, value });
const fail = (status: number, message: string): FixedAnswer => ({
  status,
  message,
  code: 0,
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const asDto = <T>(value: unknown): T => clone(value) as T;
const param = (params: unknown, key: string): unknown =>
  typeof params === "object" && params !== null
    ? (params as Record<string, unknown>)[key]
    : undefined;
const text = (params: unknown, key: string): string => {
  const value = param(params, key);
  return typeof value === "string" ? value : "";
};
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

// ---- The captured pieces -------------------------------------------------------------------------

const FS_TEMPLATE = asDto<ConfiguredFilesystem>(
  CONTRACT_EXAMPLES.fileSystemMgmtGetList.withTags.value.data[0],
);
const TANK = asDto<ConfiguredFilesystem>(
  CONTRACT_EXAMPLES.fileSystemMgmtGetList.zfs.value.data[1],
);
const CANDIDATES = CONTRACT_EXAMPLES.shareMgmtGetCandidates.several.value;
const SMB_ON = asDto<SmbSettings>(CONTRACT_EXAMPLES.smbGetSettings.on.value);
const SMB_OFF = asDto<SmbSettings>(CONTRACT_EXAMPLES.smbGetSettings.off.value);
const { sharedfoldername: _name, ...SHARE_ROW } =
  CONTRACT_EXAMPLES.smbGetShareList.one.value.data[0];
/** A new share as the classic form makes it (design 0.10, D5), as captured. */
const SHARE_DEFAULTS = asDto<SmbShare>(SHARE_ROW);
const { sharedfoldername: _classicName, ...CLASSIC_ROW } =
  CONTRACT_EXAMPLES.smbGetShareList.classicOptions.value.data[0];
const CLASSIC_SHARE = asDto<SmbShare>(CLASSIC_ROW);
const USERS = asDto<UserAccount[]>(
  CONTRACT_EXAMPLES.userMgmtGetUserList.several.value.data,
);
const FAMILY = asDto<UserGroup>(
  CONTRACT_EXAMPLES.userMgmtGetGroupList.several.value.data[0],
);
const SERVICES = CONTRACT_EXAMPLES.servicesGetStatus.sshOnly.value.data;
const user = (name: string) => {
  const found = USERS.find((u) => u.name === name);
  if (found === undefined) {
    throw new Error(`No captured user ${name}`);
  }
  return clone(found);
};

// OMV's messages, as captured where the VM showed them.
const MSG = {
  nameTaken: (name: string) =>
    `A shared folder with the name '${name}' already exists.`,
  pathTaken: (path: string) =>
    `A shared folder with the path '${path}' already exists for the specified file system.`,
  userUnknown: (name: string) => `The user '${name}' does not exist.`,
  userNotAllowed: (name: string) => `The user '${name}' is not allowed.`,
  referenced: CONTRACT_EXAMPLES.shareMgmtDelete.referenced.value.message,
  otherInside: CONTRACT_EXAMPLES.shareMgmtDelete.otherInside.value.message,
  secondShare: (folder: string) =>
    `The configuration object 'conf.service.smb.share' is not unique. An object with the property 'sharedfolderref' and value '${folder}' already exists.`,
  folderGone: (folder: string) =>
    `Failed to execute XPath query './/system/shares/sharedfolder[uuid='${folder}']'.`,
  hostTooLong: CONTRACT_EXAMPLES.smbSetSettings.hostTooLong.value.message,
  // Written by hand: the VM refused these with HTTP 500, in words not captured.
  dots: "The relative directory path must not contain '..'.",
  groupUnknown: (name: string) => `The group '${name}' does not exist.`,
  notFound: (what: string, id: string) =>
    `The configuration object '${what}' with the identifier '${id}' does not exist.`,
  sharedFolderName:
    "Invalid RPC parameters: the property 'sharedfoldername' is not allowed.",
  notMade:
    "Failed to store the configuration object 'conf.system.sharedfolder'.",
  noDir: (path: string) => `Failed to create the directory '${path}'.`,
  access: "Failed to store the privileges of the shared folder.",
  smbOn: "Failed to store the configuration object 'conf.service.smb'.",
  share: "Failed to store the configuration object 'conf.service.smb.share'.",
};
const CUT = fail(504, "Gateway Time-out");

// ---- The state -----------------------------------------------------------------------------------

/** A shared folder as stored, with what the mock adds to say what else uses it. */
export interface MockFolder {
  uuid: string;
  name: string;
  comment: string;
  mntentref: string;
  reldirpath: string;
  privileges: SharedFolderPrivilege[];
  /** A setting this interface does not show refers to it (an NFS share, a backup job). */
  usedElsewhere?: boolean;
  /** The status OMV reports whatever the disk says (ENOTDIR, a code from a later OMV). */
  statusOverride?: string;
}

/** A mount entry and the file system it mounts, as FileSystemMgmt.getList reports it. */
export interface MockEntry {
  uuid: string;
  fs: ConfiguredFilesystem;
  /** getCandidates' server-built text for it (captured). */
  candidateText: string;
}

interface Config {
  folders: MockFolder[];
  shares: SmbShare[];
  settings: SmbSettings;
}

export interface SharesMockState {
  name: SharesScenarioName;
  /** The NAS's name (System.getInformation's hostname). */
  host: string;
  /** The configuration as saved. */
  config: Config;
  /** The configuration as last applied: what an undo brings back, and what the services run. */
  applied: Config;
  entries: MockEntry[];
  users: UserAccount[];
  groups: UserGroup[];
  /** The folders that exist on the disk, as "mntentref|reldirpath". */
  dirs: string[];
  /** UUIDs handed out so far. */
  made: number;
  /** New shared folders asked for so far (the failure in turn). */
  newFolders: number;
  /** The failure the flow under way will still meet, once. */
  armed: AddFailure | null;
  /** SMB did not start after the last apply (sharesAddFailsVerify). */
  smbStuck: boolean;
  /** getCandidates reads so far (sharesAddFailsCheck). */
  candidateReads: number;
  /** When getCandidates was first read (sharesAddFailsCheck). */
  firstCandidateRead?: number;
}

const dirKey = (f: Pick<MockFolder, "mntentref" | "reldirpath">) =>
  `${f.mntentref}|${f.reldirpath}`;

/** The path as OMV stores it: no leading slash, one trailing slash; "/" stays "/". */
export function storedPath(path: string): string {
  const inner = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return inner === "" ? "/" : `${inner}/`;
}

const ENTRY = {
  sda1: uuid(1),
  sdd1: uuid(2),
  sdb1: uuid(3),
  tank: uuid(4),
} as const;
const GONE_ENTRY = uuid(0x99);

function blockFs(
  fsUuid: string,
  dev: string,
  type: string,
  comment: string,
): ConfiguredFilesystem {
  const devicefile = `/dev/disk/by-uuid/${fsUuid}`;
  const canonical = `/dev/${dev}`;
  const tags = comment === "" ? "" : ` [${comment}]`;
  return {
    ...clone(FS_TEMPLATE),
    devicename: dev,
    devicefile,
    predictabledevicefile: devicefile,
    canonicaldevicefile: canonical,
    parentdevicefile: canonical.replace(/\d+$/, ""),
    devlinks: [devicefile],
    uuid: fsUuid,
    label: "",
    type,
    mountpoint: `/srv/dev-disk-by-uuid-${fsUuid}`,
    description:
      tags === ""
        ? `${canonical} [${type.toUpperCase()}, 2.03 MiB (1%) used, 7.75 GiB available]`
        : `${canonical}${tags}`,
    propcompress: type === "btrfs",
    propautodefrag: type === "btrfs",
    devicefiles: [canonical],
    comment,
    usagewarnthreshold: 85,
  };
}

function entries(): MockEntry[] {
  const [sda1, sdd1, sdb1, tank] = CANDIDATES;
  return [
    {
      uuid: ENTRY.sda1,
      fs: blockFs(uuid(7), "sda1", "ext4", ""),
      candidateText: sda1?.description ?? "",
    },
    {
      uuid: ENTRY.sdd1,
      fs: blockFs(uuid(8), "sdd1", "ext4", "Media"),
      candidateText: sdd1?.description ?? "",
    },
    {
      uuid: ENTRY.sdb1,
      fs: blockFs(uuid(15), "sdb1", "btrfs", "Archive"),
      candidateText: sdb1?.description ?? "",
    },
    {
      uuid: ENTRY.tank,
      fs: clone(TANK),
      candidateText: tank?.description ?? "",
    },
  ];
}

const priv = (
  type: "user" | "group",
  name: string,
  perms: 0 | 5 | 7,
): SharedFolderPrivilege => ({ type, name, perms });

function folder(
  n: number,
  name: string,
  mntentref: string,
  over: Partial<MockFolder> = {},
): MockFolder {
  return {
    uuid: uuid(0x200 + n),
    name,
    comment: "",
    mntentref,
    reldirpath: `${name}/`,
    privileges: [],
    ...over,
  };
}

function share(
  n: number,
  folderUuid: string,
  over: Partial<SmbShare> = {},
): SmbShare {
  return {
    ...clone(SHARE_DEFAULTS),
    uuid: uuid(0x300 + n),
    sharedfolderref: folderUuid,
    ...over,
  };
}

const TWO_PEOPLE = () => [user("alex"), user("sam")];
const THREE_PEOPLE = () => [user("alex"), user("sam"), user("robin")];

/** The Photos, Public and Backups of sharesSome. */
function someFolders(): { folders: MockFolder[]; shares: SmbShare[] } {
  const photos = folder(1, "Photos", ENTRY.sdd1, {
    comment: "Family photos",
    privileges: [priv("user", "alex", 7), priv("user", "sam", 5)],
  });
  const pub = folder(2, "Public", ENTRY.sdd1, {
    comment: "For visitors",
    privileges: [priv("group", "family", 5)],
  });
  const backups = folder(3, "Backups", ENTRY.sda1);
  return {
    folders: [photos, pub, backups],
    shares: [share(1, photos.uuid), share(2, pub.uuid, { guest: "allow" })],
  };
}

function manyStory(): Pick<SharesMockState, "users" | "groups" | "config"> {
  const users = Array.from({ length: 1000 }, (_, i) => {
    const name = `example-user-${String(i + 1).padStart(4, "0")}`;
    return {
      ...user("sam"),
      name,
      uid: 2000 + i,
      dir: `/home/${name}`,
      comment: i % 3 === 0 ? `Person ${String(i + 1)}` : "",
      groups: [
        "users",
        `example-group-${String((i % 60) + 1).padStart(2, "0")}`,
      ],
    };
  });
  const groups = Array.from({ length: 60 }, (_, i): UserGroup => {
    const name = `example-group-${String(i + 1).padStart(2, "0")}`;
    const { comment: _comment, ...plain } = clone(FAMILY);
    return {
      ...plain,
      name,
      gid: 3000 + i,
      members: users
        .filter((_u, j) => j % 60 === i)
        .slice(0, 5)
        .map((u) => u.name),
      // OMV gives a comment only for a group it holds a record of.
      ...(i % 2 === 0 ? { comment: `Group ${String(i + 1)}` } : {}),
    };
  });
  const refs = [ENTRY.sda1, ENTRY.sdd1, ENTRY.tank];
  const folders = Array.from({ length: 140 }, (_, i) => {
    const name = `folder-${String(i + 1).padStart(3, "0")}`;
    return folder(0x100 + i, name, refs[i % 3] ?? ENTRY.sda1, {
      comment: i % 4 === 0 ? `Description of ${name}` : "",
      privileges:
        i % 2 === 0
          ? [
              priv("group", groups[i % 60]?.name ?? "family", 7),
              priv("user", users[i]?.name ?? "alex", 5),
            ]
          : [],
    });
  });
  const shares = folders
    .filter((_f, i) => i % 5 === 0)
    .map((f, i) =>
      share(0x100 + i, f.uuid, { guest: i % 4 === 0 ? "allow" : "no" }),
    );
  return {
    users,
    groups,
    config: { folders, shares, settings: clone(SMB_ON) },
  };
}

/** A description of exactly 200 characters, with markup-looking text and a bidi override. */
const LONG_COMMENT =
  `<script>alert(1)</script> ‮evil ${"A long description. ".repeat(10)}`.slice(
    0,
    200,
  );

function hostileStory(): Pick<SharesMockState, "users" | "groups" | "config"> {
  const markup = folder(1, "<b>x</b>", ENTRY.sdd1, {
    reldirpath: "markup/",
    comment: '<img src=x onerror="alert(1)">',
    privileges: [priv("user", "alex", 7)],
  });
  const rtl = folder(2, "תמונות", ENTRY.sdd1, {
    reldirpath: "rtl/",
    comment: "תמונות מהחופשה",
    privileges: [priv("group", "family", 5)],
  });
  const bidi = folder(3, "‮evil.exe", ENTRY.sdd1, {
    reldirpath: "bidi/",
    comment: LONG_COMMENT,
  });
  const at80 = folder(4, "y".repeat(80), ENTRY.sdd1, { reldirpath: "at80/" });
  const long = folder(5, `Long-${"n".repeat(195)}`, ENTRY.sda1, {
    reldirpath: "long/",
    comment: "A name of 200 characters, made outside OMV's checks.",
  });
  return {
    users: [
      { ...user("alex"), comment: '<img src=x onerror="alert(1)">' },
      { ...user("sam"), comment: "סם ‮evil" },
      { ...user("robin"), comment: LONG_COMMENT },
    ],
    groups: [{ ...clone(FAMILY), comment: "<i>everyone</i> at home" }],
    config: {
      folders: [markup, rtl, bidi, at80, long],
      shares: [share(1, markup.uuid), share(2, rtl.uuid, { guest: "allow" })],
      settings: clone(SMB_ON),
    },
  };
}

/** The Big and Huge of sharesDeleteSlow. */
const BIG = folder(1, "Big", ENTRY.sdd1, {
  comment: "About 2 GiB in many files",
});
const HUGE = folder(2, "Huge", ENTRY.sdd1, {
  comment: "Too big to delete in time",
});
export const SLOW_DELETE = { big: BIG.uuid, huge: HUGE.uuid } as const;
/** How long the slow deletion takes, and how long the cut one runs before the cut. */
export const SLOW_DELETE_MS = { big: 40_000, huge: 10_000 } as const;

export function newSharesMockState(name: SharesScenarioName): SharesMockState {
  let users: UserAccount[] = THREE_PEOPLE();
  let groups: UserGroup[] = [clone(FAMILY)];
  let config: Config = { folders: [], shares: [], settings: clone(SMB_OFF) };
  let host = "nas";
  let missing: string[] = [];
  const all = entries();
  switch (name) {
    case "sharesNone":
    case "sharesAddFails":
    case "sharesAddFailsCheck":
    case "sharesAddFailsNotMade":
    case "sharesAddFailsNoDir":
    case "sharesAddFailsAccess":
    case "sharesAddFailsSmbOn":
    case "sharesAddFailsShare":
    case "sharesAddFailsApply":
    case "sharesAddFailsVerify":
    case "sharesAddFailsCut":
      users = TWO_PEOPLE();
      break;
    case "sharesSome":
    case "sharesSmbDown": {
      config = { ...someFolders(), settings: clone(SMB_ON) };
      break;
    }
    case "sharesMany": {
      const many = manyStory();
      ({ users, groups, config } = many);
      break;
    }
    case "sharesBroken": {
      const sdb1 = all.find((e) => e.uuid === ENTRY.sdb1);
      if (sdb1 !== undefined) {
        sdb1.fs.mounted = false;
      }
      const missingFolder = folder(3, "Missing", ENTRY.sdd1);
      missing = [dirKey(missingFolder)];
      config = {
        folders: [
          folder(1, "Documents", ENTRY.sda1),
          folder(2, "Archive", ENTRY.sdb1, {
            comment: "On a disk that is not mounted",
          }),
          missingFolder,
          folder(4, "Notes", ENTRY.sdd1, {
            reldirpath: "notes.txt/",
            statusOverride: "ENOTDIR",
          }),
          folder(5, "Old", GONE_ENTRY, {
            comment: "Its file system was removed",
          }),
          folder(6, "Future", ENTRY.sda1, { statusOverride: "EFUTURE" }),
        ],
        shares: [],
        settings: clone(SMB_ON),
      };
      break;
    }
    case "sharesNoUsers":
      users = [];
      groups = [];
      config = {
        folders: [folder(1, "Documents", ENTRY.sda1)],
        shares: [],
        settings: clone(SMB_OFF),
      };
      break;
    case "sharesStale": {
      const photos = folder(1, "Photos", ENTRY.sdd1, {
        privileges: [
          priv("group", "family", 7),
          priv("user", "alex", 0),
          priv("user", "sam", 5),
          priv("user", "old-user", 5),
          priv("group", "old-team", 7),
        ],
      });
      config = {
        folders: [photos],
        shares: [share(1, photos.uuid)],
        settings: clone(SMB_ON),
      };
      break;
    }
    case "sharesClassicOptions": {
      const photos = folder(1, "Photos", ENTRY.sdd1, {
        comment: "Family photos",
        privileges: [priv("user", "alex", 7)],
      });
      config = {
        folders: [photos],
        shares: [
          {
            ...clone(CLASSIC_SHARE),
            uuid: uuid(0x301),
            sharedfolderref: photos.uuid,
            guest: "only",
          },
        ],
        settings: clone(SMB_ON),
      };
      break;
    }
    case "sharesUsedElsewhere": {
      const { folders, shares } = someFolders();
      config = {
        folders: folders.map((f) =>
          f.name === "Backups" ? { ...f, usedElsewhere: true } : f,
        ),
        shares,
        settings: clone(SMB_ON),
      };
      break;
    }
    case "sharesWholeFs":
      config = {
        folders: [
          folder(1, "Archive", ENTRY.sdb1, { reldirpath: "/" }),
          folder(2, "Media", ENTRY.sdd1),
          folder(3, "Movies", ENTRY.sdd1, { reldirpath: "Media/Movies/" }),
        ],
        shares: [],
        settings: clone(SMB_OFF),
      };
      break;
    case "sharesLongHost":
      host = "nas-living-room1";
      config = {
        folders: [
          folder(1, "Photos", ENTRY.sdd1, {
            privileges: [priv("user", "alex", 7)],
          }),
        ],
        shares: [],
        settings: clone(SMB_OFF),
      };
      break;
    case "sharesDeleteSlow":
      config = {
        folders: [clone(BIG), clone(HUGE), folder(3, "Documents", ENTRY.sda1)],
        shares: [],
        settings: clone(SMB_ON),
      };
      break;
    case "sharesHostile": {
      const hostile = hostileStory();
      ({ users, groups, config } = hostile);
      break;
    }
  }
  const dirs = config.folders
    .filter((f) => f.reldirpath !== "/")
    .map(dirKey)
    .filter((k) => !missing.includes(k));
  return {
    name,
    host,
    config,
    applied: clone(config),
    entries: all,
    users,
    groups,
    dirs,
    made: 0x400,
    newFolders: 0,
    armed: null,
    smbStuck: false,
    candidateReads: 0,
  };
}

// ---- Reading the state ---------------------------------------------------------------------------

const entryOf = (state: SharesMockState, ref: string) =>
  state.entries.find((e) => e.uuid === ref);

const fsMounted = (fs: ConfiguredFilesystem) => fs.status === 1 && fs.mounted;

const hasShare = (state: SharesMockState, folderUuid: string) =>
  state.config.shares.some((s) => s.sharedfolderref === folderUuid);

/** The stored access list as OMV reports it: "" when empty (observed). */
const privilegesOf = (f: MockFolder): SharedFolderPrivileges =>
  f.privileges.length === 0 ? "" : { privilege: clone(f.privileges) };

function rowOf(state: SharesMockState, f: MockFolder): SharedFolder {
  const _used = hasShare(state, f.uuid) || f.usedElsewhere === true;
  const base = {
    uuid: f.uuid,
    name: f.name,
    comment: f.comment,
    mntentref: f.mntentref,
    reldirpath: f.reldirpath,
    privileges: privilegesOf(f),
    _used,
  };
  const entry = entryOf(state, f.mntentref);
  if (entry === undefined) {
    return {
      ...base,
      device: "",
      description: f.comment === "" ? f.name : `${f.name} [${f.comment}]`,
      snapshots: false,
      absdirpath: "",
      status: f.statusOverride ?? "ENOENT_DB_MNTENT",
    };
  }
  const fs = entry.fs;
  const mounted = fsMounted(fs);
  const device = mounted ? fs.canonicaldevicefile : fs.devicefile;
  const exists =
    f.reldirpath === "/" ? true : mounted && state.dirs.includes(dirKey(f));
  return {
    ...base,
    device,
    description:
      f.comment === ""
        ? `${f.name} [on ${device}, ${f.reldirpath}]`
        : `${f.name} [${f.comment}]`,
    mntent: {
      devicefile: mounted ? fs.canonicaldevicefile : "",
      fsname: fs.devicefile,
      dir: fs.mountpoint,
      type: fs.type,
      posixacl: true,
    },
    snapshots: fs.type === "btrfs",
    absdirpath:
      f.reldirpath === "/"
        ? `${fs.mountpoint}/`
        : `${fs.mountpoint}/${f.reldirpath}`,
    status: f.statusOverride ?? (exists ? "OK" : "ENOENT"),
  };
}

/** The stored record, as ShareMgmt.set, setPrivileges and delete return it. */
const savedOf = (f: MockFolder, mode?: string) => ({
  uuid: f.uuid,
  name: f.name,
  comment: f.comment,
  mntentref: f.mntentref,
  reldirpath: f.reldirpath,
  privileges: privilegesOf(f),
  ...(mode === undefined ? {} : { mode }),
});

/** Whether SMB runs now: on as last applied, and not kept down by the story. */
export function sharesSmbRunning(state: SharesMockState): boolean {
  return (
    state.applied.settings.enable &&
    state.name !== "sharesSmbDown" &&
    !state.smbStuck
  );
}

/** OMV's getlist: search over every field, sort on a top-level field, then the page. */
function paged<T>(rows: T[], params: unknown): { total: number; data: T[] } {
  const search = text(params, "search").toLowerCase();
  let list =
    search === ""
      ? rows
      : rows.filter((r) => JSON.stringify(r).toLowerCase().includes(search));
  const field = text(params, "sortfield");
  if (field !== "") {
    const dir = text(params, "sortdir") === "desc" ? -1 : 1;
    list = [...list].sort((a, b) => {
      const x = String((a as Record<string, unknown>)[field] ?? "");
      const y = String((b as Record<string, unknown>)[field] ?? "");
      return x < y ? -dir : x > y ? dir : 0;
    });
  }
  const start = Number(param(params, "start") ?? 0) || 0;
  const limit = param(params, "limit");
  const data =
    typeof limit === "number"
      ? list.slice(start, start + limit)
      : list.slice(start);
  return { total: list.length, data };
}

// ---- The answers ---------------------------------------------------------------------------------

interface Call {
  params: unknown;
}
export type SharesReply = (call: Call) => FixedAnswer;

export const SHARES_OPERATIONS = [
  "shareMgmtGetList",
  "shareMgmtGetCandidates",
  "shareMgmtSet",
  "shareMgmtSetPrivileges",
  "shareMgmtDelete",
  "userMgmtGetUserList",
  "userMgmtGetGroupList",
  "smbGetSettings",
  "smbSetSettings",
  "smbGetShareList",
  "smbSetShare",
  "smbDeleteShare",
  "servicesGetStatus",
  "fileSystemMgmtGetList",
] as const;
export type SharesOperation = (typeof SHARES_OPERATIONS)[number];

/** Take the armed failure if it is this one: it happens once. */
function take(state: SharesMockState, failure: AddFailure): boolean {
  if (state.armed !== failure) {
    return false;
  }
  state.armed = null;
  return true;
}

/**
 * The remembering answers of a shares story. `dirty` receives the modules a write marks pending, which
 * the caller adds to what System.getInformation and Config.isDirty report.
 */
export function sharesAnswers(
  state: SharesMockState,
  hooks: { dirty: (modules: readonly SharesModule[]) => void },
): Record<SharesOperation, SharesReply> {
  const newUuid = () => uuid(++state.made);
  const folderModules = (folderUuid: string): SharesModule[] =>
    hasShare(state, folderUuid)
      ? [...FOLDER_MODULES, ...SMB_MODULES]
      : [...FOLDER_MODULES];

  return {
    shareMgmtGetList: ({ params }) =>
      ok(
        paged(
          state.config.folders.map((f) => rowOf(state, f)),
          params,
        ),
      ),

    shareMgmtGetCandidates: () => {
      state.candidateReads += 1;
      state.firstCandidateRead ??= Date.now();
      // sharesAddFailsCheck: by the time the run checks again, none is offered any more. Every read
      // in the first five seconds offers them, so the form (read twice under StrictMode) has a
      // choice; a read after that, such as the run's step 1, finds none.
      if (
        state.name === "sharesAddFailsCheck" &&
        Date.now() - state.firstCandidateRead > 5_000
      ) {
        return ok([]);
      }
      return ok(
        state.entries
          .filter((e) => fsMounted(e.fs))
          .map((e) => ({ uuid: e.uuid, description: e.candidateText })),
      );
    },

    shareMgmtSet: ({ params }) => {
      const id = text(params, "uuid");
      const name = text(params, "name");
      const rawPath = text(params, "reldirpath");
      const mntentref = text(params, "mntentref");
      const comment = text(params, "comment");
      const mode = param(params, "mode");
      if (rawPath.includes("..")) {
        return fail(500, MSG.dots);
      }
      const reldirpath = storedPath(rawPath);
      const others = state.config.folders.filter((f) => f.uuid !== id);
      if (others.some((f) => f.name === name)) {
        return fail(500, MSG.nameTaken(name));
      }
      if (
        others.some(
          (f) => f.mntentref === mntentref && f.reldirpath === reldirpath,
        )
      ) {
        return fail(500, MSG.pathTaken(reldirpath));
      }
      const replyMode = typeof mode === "string" ? mode : "775";
      if (id === NEW_OBJECT) {
        const failure = addFailureOf(state.name, state.newFolders);
        state.newFolders += 1;
        state.armed = failure;
        if (take(state, "notMade")) {
          return fail(500, MSG.notMade);
        }
        const made: MockFolder = {
          uuid: newUuid(),
          name,
          comment,
          mntentref,
          reldirpath,
          privileges: [],
        };
        state.config.folders.push(made);
        hooks.dirty(FOLDER_MODULES);
        if (take(state, "noDir")) {
          const fs = entryOf(state, mntentref)?.fs;
          return fail(500, MSG.noDir(`${fs?.mountpoint ?? ""}/${reldirpath}`));
        }
        if (reldirpath !== "/") {
          state.dirs.push(dirKey(made));
        }
        if (take(state, "cut")) {
          return CUT;
        }
        return ok({
          ...savedOf(made, replyMode),
          privileges: { privilege: [] },
        });
      }
      const stored = state.config.folders.find((f) => f.uuid === id);
      if (stored === undefined) {
        return fail(500, MSG.notFound("conf.system.sharedfolder", id));
      }
      Object.assign(stored, { name, comment, mntentref, reldirpath });
      // OMV makes the folder when it does not exist; an existing one keeps its mode.
      const key = dirKey(stored);
      if (reldirpath !== "/" && !state.dirs.includes(key)) {
        state.dirs.push(key);
      }
      hooks.dirty(folderModules(stored.uuid));
      return ok(savedOf(stored, replyMode));
    },

    shareMgmtSetPrivileges: ({ params }) => {
      const id = text(params, "uuid");
      const stored = state.config.folders.find((f) => f.uuid === id);
      if (stored === undefined) {
        return fail(500, MSG.notFound("conf.system.sharedfolder", id));
      }
      if (take(state, "access")) {
        return fail(500, MSG.access);
      }
      const list = param(params, "privileges");
      const entriesSent = Array.isArray(list)
        ? (list as SharedFolderPrivilege[])
        : [];
      for (const entry of entriesSent) {
        if (entry.type === "user" && entry.name === "admin") {
          return fail(500, MSG.userNotAllowed(entry.name));
        }
        if (
          entry.type === "user" &&
          !state.users.some((u) => u.name === entry.name)
        ) {
          return fail(500, MSG.userUnknown(entry.name));
        }
        if (
          entry.type === "group" &&
          !state.groups.some((g) => g.name === entry.name)
        ) {
          return fail(500, MSG.groupUnknown(entry.name));
        }
      }
      stored.privileges = clone(entriesSent);
      hooks.dirty(folderModules(stored.uuid));
      return ok(savedOf(stored));
    },

    shareMgmtDelete: ({ params }) => {
      const id = text(params, "uuid");
      const recursive = param(params, "recursive") === true;
      const stored = state.config.folders.find((f) => f.uuid === id);
      if (stored === undefined) {
        return fail(500, MSG.notFound("conf.system.sharedfolder", id));
      }
      if (hasShare(state, id) || stored.usedElsewhere === true) {
        return fail(500, MSG.referenced);
      }
      if (recursive) {
        const inside = state.config.folders.some(
          (f) =>
            f.uuid !== id &&
            f.mntentref === stored.mntentref &&
            (stored.reldirpath === "/" ||
              f.reldirpath.startsWith(stored.reldirpath)),
        );
        if (inside) {
          return fail(500, MSG.otherInside);
        }
        // The folder and everything in it are deleted at once, inside the request.
        state.dirs = state.dirs.filter(
          (k) =>
            !(
              k.startsWith(`${stored.mntentref}|`) &&
              (stored.reldirpath === "/" ||
                k
                  .slice(stored.mntentref.length + 1)
                  .startsWith(stored.reldirpath))
            ),
        );
      }
      state.config.folders = state.config.folders.filter((f) => f.uuid !== id);
      hooks.dirty(DELETE_MODULES);
      // sharesDeleteSlow: the server finishes deleting Huge, but the request is cut first.
      if (state.name === "sharesDeleteSlow" && recursive && id === HUGE.uuid) {
        return CUT;
      }
      return ok(savedOf(stored));
    },

    userMgmtGetUserList: ({ params }) =>
      ok(
        paged(
          state.users.filter((u) => u.name !== "admin"),
          params,
        ),
      ),

    userMgmtGetGroupList: ({ params }) =>
      ok(
        paged(
          state.groups.filter((g) => g.name !== "users"),
          params,
        ),
      ),

    smbGetSettings: () => ok(clone(state.config.settings)),

    smbSetSettings: ({ params }) => {
      const enable = param(params, "enable") === true;
      if (enable && state.host.length > 15) {
        return fail(500, MSG.hostTooLong);
      }
      if (take(state, "smbOn")) {
        return fail(500, MSG.smbOn);
      }
      state.config.settings = {
        ...state.config.settings,
        ...(params as Partial<SmbSettings>),
      };
      hooks.dirty(SMB_MODULES);
      return ok(clone(state.config.settings));
    },

    smbGetShareList: () => {
      const gone = state.config.shares.find(
        (s) => !state.config.folders.some((f) => f.uuid === s.sharedfolderref),
      );
      if (gone !== undefined) {
        return fail(500, MSG.folderGone(gone.sharedfolderref));
      }
      const data = state.config.shares.map((s) => ({
        ...clone(s),
        sharedfoldername:
          state.config.folders.find((f) => f.uuid === s.sharedfolderref)
            ?.name ?? "",
      }));
      return ok({ total: data.length, data });
    },

    smbSetShare: ({ params }) => {
      if (param(params, "sharedfoldername") !== undefined) {
        return fail(500, MSG.sharedFolderName);
      }
      const id = text(params, "uuid");
      const ref = text(params, "sharedfolderref");
      if (take(state, "share")) {
        return fail(500, MSG.share);
      }
      // OMV builds a fresh object from what is sent: a field left out returns to its default.
      const sent = {
        ...clone(SHARE_DEFAULTS),
        ...(params as Partial<SmbShare>),
      };
      if (id === NEW_OBJECT) {
        if (hasShare(state, ref)) {
          return fail(500, MSG.secondShare(ref));
        }
        const made = { ...sent, uuid: newUuid() };
        state.config.shares.push(made);
        hooks.dirty(SMB_MODULES);
        return ok(clone(made));
      }
      const index = state.config.shares.findIndex((s) => s.uuid === id);
      if (index < 0) {
        return fail(500, MSG.notFound("conf.service.smb.share", id));
      }
      if (
        state.config.shares.some(
          (s) => s.uuid !== id && s.sharedfolderref === ref,
        )
      ) {
        return fail(500, MSG.secondShare(ref));
      }
      state.config.shares[index] = sent;
      hooks.dirty(SMB_MODULES);
      return ok(clone(sent));
    },

    smbDeleteShare: ({ params }) => {
      const id = text(params, "uuid");
      const stored = state.config.shares.find((s) => s.uuid === id);
      if (stored === undefined) {
        return fail(500, MSG.notFound("conf.service.smb.share", id));
      }
      state.config.shares = state.config.shares.filter((s) => s.uuid !== id);
      hooks.dirty(SMB_MODULES);
      return ok(clone(stored));
    },

    servicesGetStatus: () => {
      const data = SERVICES.map((s) =>
        s.name === "samba"
          ? {
              ...s,
              enabled: state.applied.settings.enable,
              running: sharesSmbRunning(state),
            }
          : { ...s },
      );
      return ok({ total: data.length, data });
    },

    fileSystemMgmtGetList: ({ params }) => {
      const rows = state.entries.map((e) => ({
        ...clone(e.fs),
        _used: state.config.folders.some((f) => f.mntentref === e.uuid),
      }));
      return ok(paged(rows, params));
    },
  };
}

/** A finished apply: the configuration is committed and SMB follows it. False when it fails (once). */
export function sharesApplied(state: SharesMockState): boolean {
  if (take(state, "apply")) {
    return false;
  }
  state.smbStuck = take(state, "verify");
  // A failure the flow did not reach (nobody given access, SMB already on) is not kept for later.
  state.armed = null;
  state.applied = clone(state.config);
  return true;
}

/**
 * A finished undo: the configuration as last applied comes back. The disk does not: a folder made
 * since stays as an empty folder without its record, and a folder deleted with its files comes back
 * with status ENOENT (B4, B5).
 */
export function sharesReverted(state: SharesMockState): void {
  state.config = clone(state.applied);
  state.armed = null;
}

/**
 * The pass-through handlers of a story, for `pnpm dev:mock`: in sharesDeleteSlow, a deletion of Big
 * with its files is held 40 s and one of Huge 10 s (then the answer is the cut), before the rpc.php
 * handler answers. They answer nothing themselves. The test renderer does not add them.
 */
export function sharesDelayHandlers(name: string) {
  if (name !== "sharesDeleteSlow") {
    return [];
  }
  return [
    http.post("*/rpc.php", async ({ request }) => {
      let body: { service?: unknown; method?: unknown; params?: unknown };
      try {
        body = (await request.clone().json()) as typeof body;
      } catch {
        return undefined;
      }
      if (
        body.service === "ShareMgmt" &&
        body.method === "delete" &&
        param(body.params, "recursive") === true
      ) {
        const id = param(body.params, "uuid");
        const ms =
          id === SLOW_DELETE.big
            ? SLOW_DELETE_MS.big
            : id === SLOW_DELETE.huge
              ? SLOW_DELETE_MS.huge
              : 0;
        if (ms > 0) {
          await delay(ms);
        }
      }
      return undefined;
    }),
  ];
}
