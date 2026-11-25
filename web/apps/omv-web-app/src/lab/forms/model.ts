// SPDX-License-Identifier: GPL-3.0-or-later
// The form prototypes' model (rethink spec 3.11, 8 rows 2 and 3): development only (UI-11). Lab
// fixtures shaped like the mock's household (a few people, two groups, a data drive), and the pure
// logic each form derives from its answers: defaults, what "More options" hides, the problems a
// press of the primary finds, and the consequence sentences. Nothing here reaches the backend; the
// lab never writes (UI-4).

export type Access = "rw" | "ro" | "none";

export interface Drive {
  id: string;
  /** The plain name the person gave it (or the label OMV shows). */
  name: string;
  /** The technical term, second and quieter (N5). */
  type: string;
  device: string;
  freeGiB: number;
  sizeGiB: number;
  /** Not mounted: kept visible, not choosable, with the reason. */
  unavailable?: string;
}

export interface Person {
  name: string;
  who: string;
}

export interface Group {
  name: string;
  members: string[];
  /** The folders this group opens, with its level: what a group chip says. */
  opens: { folder: string; access: Exclude<Access, "none"> }[];
}

export const DRIVES_ONE: Drive[] = [
  {
    id: "data",
    name: "Data drive",
    type: "EXT4",
    device: "/dev/sdb1",
    freeGiB: 7.8,
    sizeGiB: 9.8,
  },
];

export const DRIVES_SEVERAL: Drive[] = [
  ...DRIVES_ONE,
  {
    id: "media",
    name: "Media",
    type: "XFS",
    device: "/dev/sdc1",
    freeGiB: 412,
    sizeGiB: 931,
  },
  {
    id: "old",
    name: "Old backups",
    type: "EXT4",
    device: "/dev/sdd1",
    freeGiB: 0,
    sizeGiB: 465,
    unavailable: "Not ready: its disk is not connected",
  },
];

export const PEOPLE: Person[] = [
  { name: "alex", who: "Alex at home" },
  { name: "sam", who: "Sam" },
  { name: "robin", who: "Robin" },
  { name: "jo", who: "Jo, upstairs" },
  { name: "kim", who: "Kim" },
  { name: "pat", who: "Pat, the laptop in the kitchen" },
];

export const GROUPS: Group[] = [
  {
    name: "family",
    members: ["alex", "sam", "robin"],
    opens: [
      { folder: "Photos", access: "rw" },
      { folder: "Music", access: "ro" },
    ],
  },
  {
    name: "kids",
    members: ["sam", "jo"],
    opens: [
      { folder: "Music", access: "ro" },
      { folder: "Games", access: "rw" },
    ],
  },
];

/** The shared folders a new person can be given (the "Add a person" prototype). */
export const FOLDERS = ["Photos", "Music", "Games", "Documents"] as const;

/** The shared folders "Add a shared folder" finds already there, so Photos is free to make. */
export const TAKEN_FOLDERS = ["Music", "Games", "Documents"] as const;

/** The NAS's own address range, read from its interface: the NFS default (3.4). */
export const HOME_RANGE = "192.0.2.0/24";
export const NAS_NAME = "nas";

// ─── Formatting ───────────────────────────────────────────────────────────────────────────────

const NBSP = " ";

export function gib(value: number): string {
  return value >= 100
    ? `${Math.round(value)}${NBSP}GiB`
    : `${value.toFixed(1)}${NBSP}GiB`;
}

/** "alex", "alex and sam", "alex, sam and robin". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

export function countPeople(n: number): string {
  return n === 1 ? "1 person" : `${n} people`;
}

// ─── Add a shared folder ──────────────────────────────────────────────────────────────────────

export type WhoPreset = "everyone" | "readSome" | "chosen";
export type NfsReach = "one" | "home" | "any";

export interface FolderForm {
  name: string;
  description: string;
  drive: string;
  /** Empty means "same as the name" (the default, 3.4). */
  path: string;
  who: WhoPreset;
  /** Per person or group, for the second and third presets. Keys: "p:alex", "g:family". */
  picked: Record<string, Access>;
  smb: boolean;
  nfs: boolean;
  nfsReach: NfsReach;
  nfsComputer: string;
  browseable: boolean;
  readOnly: boolean;
  recycle: boolean;
  guest: boolean;
}

/** The mounted drive with the most free space (3.4): never the system drive, never unmounted. */
export function defaultDrive(drives: readonly Drive[]): string {
  const usable = drives.filter((d) => !d.unavailable);
  usable.sort((a, b) => b.freeGiB - a.freeGiB);
  return usable[0]?.id ?? "";
}

/** "Everyone here can read and change files" when there are ten people or fewer (3.4). */
export function defaultWho(people: readonly Person[]): WhoPreset {
  return people.length <= 10 ? "everyone" : "chosen";
}

export function initialFolder(drives: readonly Drive[]): FolderForm {
  return {
    name: "",
    description: "",
    drive: defaultDrive(drives),
    path: "",
    who: defaultWho(PEOPLE),
    picked: {},
    smb: true,
    nfs: false,
    nfsReach: "home",
    nfsComputer: "",
    browseable: true,
    readOnly: false,
    recycle: false,
    guest: false,
  };
}

/** How many settings each "More options" holds away from their defaults ("More options · 1 changed"). */
export function changedCounts(form: FolderForm): {
  name: number;
  where: number;
  how: number;
} {
  return {
    name: form.description.trim() ? 1 : 0,
    where: form.path.trim() && form.path.trim() !== form.name.trim() ? 1 : 0,
    how:
      (form.browseable ? 0 : 1) +
      (form.readOnly ? 1 : 0) +
      (form.recycle ? 1 : 0) +
      (form.guest ? 1 : 0),
  };
}

/** The level a row in the people picker starts at, for each preset. */
export function baseAccess(who: WhoPreset): Access {
  return who === "readSome" ? "ro" : who === "chosen" ? "none" : "rw";
}

export interface Principal {
  key: string;
  kind: "person" | "group";
  name: string;
  line: string;
}

/** Groups first, saying who is in them; then people (3.11). */
export const PRINCIPALS: Principal[] = [
  ...GROUPS.map((g) => ({
    key: `g:${g.name}`,
    kind: "group" as const,
    name: g.name,
    line: listWords(g.members),
  })),
  ...PEOPLE.map((p) => ({
    key: `p:${p.name}`,
    kind: "person" as const,
    name: p.name,
    line: p.who,
  })),
];

/** Each person's effective level: their own row, raised by any group row they are in. */
export function effectiveAccess(form: FolderForm): Map<string, Access> {
  const out = new Map<string, Access>();
  const rank: Record<Access, number> = { none: 0, ro: 1, rw: 2 };
  for (const person of PEOPLE) {
    if (form.who === "everyone") {
      out.set(person.name, "rw");
      continue;
    }
    const base = baseAccess(form.who);
    let level: Access = form.picked[`p:${person.name}`] ?? base;
    for (const group of GROUPS) {
      if (!group.members.includes(person.name)) {
        continue;
      }
      const viaGroup = form.picked[`g:${group.name}`] ?? base;
      if (rank[viaGroup] > rank[level]) {
        level = viaGroup;
      }
    }
    out.set(person.name, level);
  }
  return out;
}

export type ProblemField = "name" | "who" | "nfsComputer";

export interface Problem {
  field: ProblemField;
  text: string;
}

const FORBIDDEN = /["\\/[\]:|<>+=;,*?]/u;

/** The first thing wrong with a new folder's name, or null (lab-local: the app's rules are fuller). */
export function folderNameProblem(name: string): string | null {
  if (!name.trim()) {
    return "Give the folder a name.";
  }
  if (FORBIDDEN.test(name)) {
    return 'A name cannot hold any of these: " \\ / [ ] : | < > + = ; , * ?';
  }
  const taken = TAKEN_FOLDERS.find(
    (f) => f.toLowerCase() === name.toLowerCase(),
  );
  if (taken) {
    return `A shared folder called ${taken} already exists.`;
  }
  return null;
}

export function folderProblems(form: FolderForm): Problem[] {
  const out: Problem[] = [];
  const name = folderNameProblem(form.name);
  if (name) {
    out.push({ field: "name", text: name });
  }
  const anyone = [...effectiveAccess(form).values()].some((a) => a !== "none");
  if (!anyone && !form.guest) {
    out.push({
      field: "who",
      text: "Choose at least one person or group who can open it.",
    });
  }
  if (form.nfs && form.nfsReach === "one" && !form.nfsComputer.trim()) {
    out.push({
      field: "nfsComputer",
      text: "Type the address of the computer, for example 192.0.2.20.",
    });
  }
  return out;
}

/** One fact of the consequence summary. `parts` alternate plain and bold, starting plain. */
export interface Sentence {
  id: string;
  icon: "made" | "people" | "smb" | "nfs" | "nas" | "warning" | "effect";
  parts: string[];
  /** A value to copy beside the sentence: an address. */
  copy?: { text: string; label: string };
  tone?: "warning";
}

export function folderSentences(
  form: FolderForm,
  drives: readonly Drive[],
  services: { smbOn: boolean; nfsOn: boolean },
): Sentence[] {
  const drive = drives.find((d) => d.id === form.drive);
  const name = form.name.trim();
  const out: Sentence[] = [];
  const path = form.path.trim();
  out.push({
    id: "made",
    icon: "made",
    parts: [
      "Creates ",
      name || "a shared folder",
      " on ",
      drive?.name ?? "a drive",
      `${drive ? ` (${gib(drive.freeGiB)} free)` : ""}${path && path !== name ? ", in its folder " : "."}`,
      ...(path && path !== name ? [`${path}/`, "."] : []),
    ],
  });

  const levels = effectiveAccess(form);
  const rw = PEOPLE.filter((p) => levels.get(p.name) === "rw").map(
    (p) => p.name,
  );
  const ro = PEOPLE.filter((p) => levels.get(p.name) === "ro").map(
    (p) => p.name,
  );
  if (form.who === "everyone") {
    out.push({
      id: "people",
      icon: "people",
      parts: [
        "",
        countPeople(PEOPLE.length),
        " can read and change files. Nobody else can open it.",
      ],
    });
  } else if (rw.length + ro.length === 0) {
    out.push({
      id: "people",
      icon: "people",
      parts: ["Nobody can open it yet."],
    });
  } else {
    const names = (list: string[]) =>
      list.length > 3 ? countPeople(list.length) : listWords(list);
    const bits: string[] = [""];
    if (rw.length > 0) {
      bits.push(
        names(rw),
        ro.length > 0
          ? " can read and change files; "
          : " can read and change files.",
      );
    }
    if (ro.length > 0) {
      bits.push(
        names(ro),
        rw.length > 0 ? " can read them." : " can read files.",
      );
    }
    bits[bits.length - 1] =
      `${bits[bits.length - 1] ?? ""} Nobody else can open it.`;
    out.push({ id: "people", icon: "people", parts: bits });
  }

  if (form.smb && form.guest) {
    out.push({
      id: "guest",
      icon: "warning",
      tone: "warning",
      parts: ["Anyone on your network can open it without a password."],
    });
  }

  const shown = name || "Photos";
  if (form.smb) {
    const windows = `\\\\${NAS_NAME}\\${shown}`;
    const mac = `smb://${NAS_NAME}/${shown}`;
    out.push({
      id: "smb",
      icon: "smb",
      parts: [
        "Windows computers open it at ",
        windows,
        ", Macs at ",
        mac,
        form.readOnly ? ". Nobody can change files this way." : ".",
      ],
      copy: { text: windows, label: `Copy the Windows address of ${shown}` },
    });
  }
  if (form.nfs) {
    const where =
      form.nfsReach === "one"
        ? [
            "The computer at ",
            form.nfsComputer.trim() || "the address you type",
          ]
        : form.nfsReach === "home"
          ? ["Computers on your home network (", HOME_RANGE]
          : ["Any computer that can reach the NAS"];
    out.push({
      id: "nfs",
      icon: form.nfsReach === "any" ? "warning" : "nfs",
      tone: form.nfsReach === "any" ? "warning" : undefined,
      parts:
        where.length === 2
          ? [
              where[0] ?? "",
              where[1] ?? "",
              `${form.nfsReach === "home" ? ")" : ""} can open it over NFS, without a password.`,
            ]
          : [`${where[0] ?? ""} can open it over NFS, without a password.`],
    });
  }
  if (!form.smb && !form.nfs) {
    out.push({
      id: "unshared",
      icon: "nas",
      parts: [
        "No computer can open it until you share it. You can do that later on its page.",
      ],
    });
  }
  if (form.recycle) {
    out.push({
      id: "recycle",
      icon: "made",
      parts: ["Files deleted from it go to a recycle bin first."],
    });
  }
  if (form.smb && !services.smbOn) {
    out.push({
      id: "smbOn",
      icon: "nas",
      parts: ["Turns on Windows and Mac sharing for the whole NAS."],
    });
  }
  if (form.nfs && !services.nfsOn) {
    out.push({
      id: "nfsOn",
      icon: "nas",
      parts: ["Turns on Linux and Unix sharing for the whole NAS."],
    });
  }
  out.push({
    id: "effect",
    icon: "effect",
    parts: ["Takes effect when you press Create."],
  });
  return out;
}

// ─── Add a person ─────────────────────────────────────────────────────────────────────────────

export type Role = "user" | "admin";

export interface PersonForm {
  name: string;
  who: string;
  email: string;
  password: string;
  again: string;
  revealed: boolean;
  /** The password came from "Suggest a strong password": shown once, copyable, no retyping. */
  suggested: boolean;
  groups: string[];
  /** Their own level on a folder, set in the rows; absent means "as their groups give". */
  own: Record<string, Access>;
  role: Role;
  ssh: boolean;
}

export function initialPerson(): PersonForm {
  return {
    name: "",
    who: "",
    email: "",
    password: "",
    again: "",
    revealed: false,
    suggested: false,
    groups: [],
    own: {},
    role: "user",
    ssh: false,
  };
}

export const TAKEN_PEOPLE = PEOPLE.filter((p) => p.name !== "alex").map(
  (p) => p.name,
);

export function personNameProblem(name: string): string | null {
  if (!name.trim()) {
    return "Give them a name to sign in with.";
  }
  if (!/^[a-z_][a-z0-9_.-]*$/u.test(name)) {
    return "Use small letters, numbers, dots, dashes and underscores, starting with a letter.";
  }
  if (TAKEN_PEOPLE.includes(name)) {
    return `Someone called ${name} already uses this NAS.`;
  }
  return null;
}

export type PersonField = "name" | "password" | "again";

export function personProblems(
  form: PersonForm,
): { field: PersonField; text: string }[] {
  const out: { field: PersonField; text: string }[] = [];
  const name = personNameProblem(form.name);
  if (name) {
    out.push({ field: "name", text: name });
  }
  if (!form.password) {
    out.push({
      field: "password",
      text: "Give them a password, or press Suggest a strong password.",
    });
  } else if (form.password.length < 8) {
    out.push({
      field: "password",
      text: "Use at least 8 characters.",
    });
  } else if (
    !form.revealed &&
    !form.suggested &&
    form.again !== form.password
  ) {
    out.push({
      field: "again",
      text: "The two passwords are not the same. Type it again.",
    });
  }
  return out;
}

/** What a person can open: their own levels over what their groups give. */
export function personAccess(
  form: PersonForm,
): { folder: string; access: Access; through: string | null }[] {
  const rank: Record<Access, number> = { none: 0, ro: 1, rw: 2 };
  return FOLDERS.map((folder) => {
    let best: Access = "none";
    let through: string | null = null;
    for (const name of form.groups) {
      const group = GROUPS.find((g) => g.name === name);
      const grant = group?.opens.find((o) => o.folder === folder);
      if (grant && rank[grant.access] > rank[best]) {
        best = grant.access;
        through = name;
      }
    }
    const own = form.own[folder];
    if (own !== undefined) {
      return { folder, access: own, through: null };
    }
    return { folder, access: best, through };
  });
}

const LEVEL_WORDS: Record<Access, string> = {
  rw: "read and change",
  ro: "read only",
  none: "no access",
};

export function levelWords(access: Access): string {
  return LEVEL_WORDS[access];
}

export function personSentences(form: PersonForm): Sentence[] {
  const name = form.name.trim();
  const out: Sentence[] = [];
  const who = form.who.trim();
  out.push({
    id: "adds",
    icon: "made",
    parts: name
      ? who
        ? ["Adds ", who, ", who signs in as ", name, "."]
        : ["Adds ", name, ", who signs in with that name."]
      : ["Adds a person who can sign in to this NAS."],
  });
  const access = personAccess(form).filter((a) => a.access !== "none");
  if (access.length === 0) {
    out.push({
      id: "opens",
      icon: "people",
      parts: ["Cannot open any shared folder yet. You can give access later."],
    });
  } else {
    // "Photos (read and change) and Music (read only)": folder names bold, levels plain.
    const folderParts = (list: typeof access): string[] =>
      list.flatMap((a, i) => [
        a.folder,
        ` (${LEVEL_WORDS[a.access]})${
          i === list.length - 1 ? "" : i === list.length - 2 ? " and " : ", "
        }`,
      ]);
    const viaGroup = access.filter((a) => a.through !== null);
    const own = access.filter((a) => a.through === null);
    if (viaGroup.length > 0) {
      const via = [
        ...new Set(
          viaGroup.map((a) => a.through).filter((v): v is string => v !== null),
        ),
      ];
      const parts = ["Can open ", ...folderParts(viaGroup)];
      parts[parts.length - 1] = `${parts[parts.length - 1] ?? ""}, through `;
      parts.push(listWords(via), ".");
      out.push({ id: "opens", icon: "people", parts });
    }
    if (own.length > 0) {
      const parts = [
        viaGroup.length > 0 ? "Can also open " : "Can open ",
        ...folderParts(own),
      ];
      parts[parts.length - 1] =
        `${parts[parts.length - 1] ?? ""}, given to them alone.`;
      out.push({ id: "own", icon: "people", parts });
    }
  }
  out.push(
    form.role === "admin"
      ? {
          id: "role",
          icon: "warning",
          tone: "warning",
          parts: [
            "Can change every setting on this NAS, and read and delete every file.",
          ],
        }
      : {
          id: "role",
          icon: "nas",
          parts: ["Cannot change the NAS's settings."],
        },
  );
  if (form.ssh) {
    out.push({
      id: "ssh",
      icon: "nas",
      parts: ["May sign in to the NAS's command line over SSH."],
    });
  }
  out.push({
    id: "effect",
    icon: "effect",
    parts: ["Takes effect when you press Add."],
  });
  return out;
}

// ─── Passwords ────────────────────────────────────────────────────────────────────────────────

export type StrengthWord =
  "Too short" | "Weak" | "Fair" | "Strong" | "Very strong";

/**
 * A rough strength for the line under the password (7.4 "Password strength"): the bits a guesser
 * faces from length and the kinds of character used, with repeated and common passwords counted as
 * weak. `fraction` is how far the line is drawn.
 */
export function strength(password: string): {
  word: StrengthWord;
  fraction: number;
  length: number;
} {
  const length = [...password].length;
  if (length === 0) {
    return { word: "Too short", fraction: 0, length };
  }
  let pool = 0;
  if (/[a-z]/u.test(password)) {
    pool += 26;
  }
  if (/[A-Z]/u.test(password)) {
    pool += 26;
  }
  if (/[0-9]/u.test(password)) {
    pool += 10;
  }
  if (/[^a-zA-Z0-9]/u.test(password)) {
    pool += 33;
  }
  const distinct = new Set(password).size;
  let bits = length * Math.log2(Math.max(pool, 2));
  if (distinct <= 2 || /^(password|12345678|qwerty)/iu.test(password)) {
    bits = Math.min(bits, 20);
  }
  const fraction = Math.min(1, bits / 100);
  if (length < 8) {
    return { word: "Too short", fraction: Math.min(fraction, 0.15), length };
  }
  const word: StrengthWord =
    bits < 40
      ? "Weak"
      : bits < 60
        ? "Fair"
        : bits < 80
          ? "Strong"
          : "Very strong";
  return { word, fraction: Math.max(fraction, 0.2), length };
}

// No 0/O, 1/l/I: a suggestion is read off the screen and typed on a phone.
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A strong password made in the browser (`crypto.getRandomValues`), in four groups of five. */
export function suggestPassword(
  random: (bytes: Uint8Array<ArrayBuffer>) => void = (b) => {
    crypto.getRandomValues(b);
  },
): string {
  const out: string[] = [];
  const limit = 256 - (256 % ALPHABET.length);
  while (out.length < 20) {
    const bytes = new Uint8Array(32);
    random(bytes);
    for (const byte of bytes) {
      if (byte < limit && out.length < 20) {
        out.push(ALPHABET[byte % ALPHABET.length] ?? "a");
      }
    }
  }
  return [0, 5, 10, 15].map((i) => out.slice(i, i + 5).join("")).join("-");
}
