// SPDX-License-Identifier: GPL-3.0-or-later
// Stories and tests only: English words for the dashboard's components, as the app's catalogue would
// give them (the components carry none). The copy is the dashboard lab's, which the owner saw.
import type { NasAnswerWords } from "../components/nas-answer/nas-answer-model";
import type { NasLane, NasRead } from "../components/nas-map/nas-map-model";
import type { NasMapWords } from "../components/nas-map/nas-map-words";

const NUMBER_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

/** A count in words up to ten, then in figures. */
export const countWords = (n: number) => NUMBER_WORDS[n] ?? String(n);
const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const NBSP = "\u00a0";

/** "a, b and c". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}

const plural = (n: number, one: string, other: string) =>
  `${String(n)}${NBSP}${n === 1 ? one : other}`;

const LANE_TITLES: Record<NasLane, { title: string; caption: string }> = {
  disks: {
    title: "Disks",
    caption: "The drives the NAS found inside it.",
  },
  storage: { title: "Storage", caption: "A disk made ready to keep files." },
  folders: {
    title: "Shared folders",
    caption: "What your computers open, like Photos.",
  },
  ways: {
    title: "Ways in",
    caption: "How computers reach your shared folders.",
  },
  network: {
    title: "Network",
    caption: "How the NAS is connected to your network.",
  },
};

const READ_NAMES: Record<NasRead, string> = {
  disks: "disks",
  health: "disks' health",
  storage: "storage",
  folders: "shared folders",
  ways: "ways in",
  network: "network",
  system: "system",
};

export const NAS_MAP_WORDS: NasMapWords = {
  title: "Your NAS",
  lanes: LANE_TITLES,
  rowsLabel: "Your storage, a row each",
  keyboardHint: "Use the arrow keys to move along a row and between rows.",
  list: listWords,
  disksUnread: "Disks: not read",
  disksNone: "Disks: none",
  sharedDiskState: (label, devices) => `${label}: ${listWords(devices)}`,
  strip: ({ count, ok, unchecked, more }) => {
    const lead = more
      ? `${String(count)} more`
      : plural(count, "disk", "disks");
    if (unchecked === 0) {
      return `${lead}, all OK`;
    }
    if (ok === 0) {
      return `${lead}, not checked`;
    }
    return `${lead}: ${String(ok)} OK, ${String(unchecked)} not checked`;
  },
  diskLabel: (d) =>
    [
      d.device,
      d.summary,
      d.healthLabel,
      d.detail,
      d.alsoIn.length > 0 ? `also in ${listWords(d.alsoIn)}` : undefined,
    ]
      .filter(Boolean)
      .join(", "),
  alsoIn: (names) => `Also in ${listWords(names)}`,
  atRisk: "At risk",
  foldersUnread: "Shared folders: not read",
  foldersNone: "Shared folders: none",
  systemNoFolders:
    "This drive holds the system itself, so it keeps no shared folders.",
  noWayIn: "Ways in: none",
  wayShort: {
    smb: "Windows and Mac",
    nfs: "Linux",
    rsync: "rsync",
    ssh: "SSH",
  },
  folderLabel: ({ name, ways, state }) =>
    `${name}: ${ways.length > 0 ? `reached by ${listWords(ways)}` : "no way in reaches it"}${state ? `, ${state.toLowerCase()}` : ""}`,
  moreFolders: (n, ok) =>
    ok ? `${String(n)} more, all OK` : `${String(n)} more`,
  rowLabel: (r) => {
    const on =
      r.devices.length === 0
        ? ""
        : `, on ${r.devices.length === 1 ? "disk" : "disks"} ${listWords(r.devices)}`;
    const used =
      r.used === null
        ? "space not read"
        : `${String(Math.round(r.used * 100))} percent used`;
    const own = r.problem ? `, ${r.problem.toLowerCase()}` : "";
    const sick = r.sick
      .map((d) => `, disk ${d.device} ${d.label.toLowerCase()}`)
      .join("");
    const held =
      r.folders.length > 0
        ? `Shared folders: ${listWords(r.folders)}${r.atRisk ? ", at risk" : ""}.`
        : r.system
          ? "It holds the system, so it keeps no shared folders."
          : "It has no shared folders yet.";
    return `${r.name}${on}: ${used}${own}${sick}. ${held}`;
  },
  unused: (devices) =>
    `${devices.length === 1 ? "Disk" : "Disks"} ${listWords(devices)} ${devices.length === 1 ? "is" : "are"} not in use yet.`,
  unusedLabel: (devices) =>
    `Not in use: ${devices.length === 1 ? "disk" : "disks"} ${listWords(devices)}. Add storage to keep files on ${devices.length === 1 ? "it" : "them"}.`,
  unusedFolders: "Shared folders live on storage.",
  moreRows: {
    link: (n, ok) => (ok ? `${String(n)} more, all OK` : `${String(n)} more`),
    disks: (n) => plural(n, "disk", "disks"),
    folders: (names, n) =>
      `${listWords(names)} hold ${plural(n, "shared folder", "shared folders")}.`,
  },
  example: {
    device: "disk",
    storage: "Data drive",
    tech: "EXT4",
    folder: "Photos",
    tag: "Example",
  },
  waysRunning: (running, total) =>
    running === total
      ? "All running"
      : `${String(running)} of ${String(total)} running`,
  running: "Running",
  notRunning: "Not running",
  noWayOn: "No way in is on yet.",
  off: (names) => `Off: ${listWords(names)}`,
  wayLabel: ({ name, tech, running, over }) =>
    `${name} (${tech}): ${running ? "running" : "on but not running"}${over.length > 0 ? `, over ${listWords(over)}` : ""}`,
  notConnected: "Not connected",
  world: "Your network",
  laneError: (lane) =>
    `Could not read ${lane === "ways" ? "the ways in" : lane === "network" ? "the network" : `the ${READ_NAMES[lane]}`}`,
  retry: "Try again",
  retrying: "Reading…",
};

export const NAS_ANSWER_WORDS: NasAnswerWords = {
  needs: (n) =>
    `${capital(countWords(n))} ${n === 1 ? "thing needs" : "things need"} you.`,
  unread: (failed) => ({
    title: "Part of the NAS could not be read.",
    reason: `The ${listWords(failed.map((r) => READ_NAMES[r]))} could not be read, so this page cannot say everything is working.`,
  }),
  welcome: {
    title: "Welcome to your NAS.",
    reason: "It is running. Here is what is in it, and what to set up first.",
  },
  reading: () => ({ title: "Reading the NAS…" }),
  ok: ({ total, withSpace, checkedAt }) => {
    const disks = `The disks reported no problem${checkedAt ? ` at ${checkedAt}` : ""}.`;
    return {
      title: "Everything is working.",
      reason:
        withSpace === total
          ? `${disks} All ${countWords(total)} drives have space.`
          : `${disks} ${capital(countWords(withSpace))} of ${countWords(total)} drives have space.`,
    };
  },
};
