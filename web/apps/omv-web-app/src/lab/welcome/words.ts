// SPDX-License-Identifier: GPL-3.0-or-later
// Every new word of the dashboard design in the lab, final copy shaped for the catalogue (the keys
// would sit under dashboard.welcome, dashboard.answer and dashboard.scan in locales/en/common.json).
// Development only (UI-11). `{{name}}` is filled from the reads by `fill`; counts are written in
// words up to ten. The words of the map, the live charts, the temperatures, the first steps and This
// NAS are the catalogue's own.

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

/** A count in words up to ten, then in figures: "six". */
export const count = (n: number): string => NUMBER_WORDS[n] ?? String(n);

/** "six disks", "one disk". */
export const counted = (n: number, one: string, other: string): string =>
  `${count(n)} ${n === 1 ? one : other}`;

/** A non-breaking space, between a figure and its word. */
const NBSP = String.fromCharCode(160);

/** "6 disks", "1 disk": figures, for the scan line's short counts. */
export const figure = (n: number, one: string, other: string): string =>
  `${String(n)}${NBSP}${n === 1 ? one : other}`;

/** "sda, sdb and sdc". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}

/** Fills `{{name}}` from `values`. */
export function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => values[key] ?? "");
}

export const COMMON = {
  hide: "Hide the welcome",
  hideName: "Hide the welcome to the new interface",
  classic: "Open the classic interface",
  showAround: "Show me around",
  newTab: "(opens in a new tab)",
  check: "Check disk health",
  checking: "Checking disk health…",
  /** The answer before the check: the catalogue's title, this reason, and the button after it. */
  notCheckedReason:
    "Disks report their health only when asked, and asking wakes any that are asleep, so the check waits for you.",
  checkingReason:
    "Every disk is being asked for its health. A disk that was asleep wakes up for it.",
};

/** The welcome: the person's own NAS, drawn large, assembling as the entrance. */
export const DRAWN = {
  title: "Welcome to {{host}}.",
  existing: {
    lead: "Its {{disks}}, {{drives}} and {{folders}} are on this page, drawn as they are right now.",
    more: "Point at any of them to see what it holds, or press / to go anywhere. It all runs on the settings {{host}} already has.",
  },
  new: {
    lead: "It found {{disks}}. One holds the system, and the other {{free}} are ready to keep your files.",
    more: "Make one of them into storage, put a shared folder on it, and every computer at home can open it. The first steps take you there.",
  },
  picture: "The disks in {{host}} and the drives they make",
  board: "On the mainboard",
  raid: "RAID array",
  unused: "Not in use",
  ready: "Ready for storage",
  /** The small drawing beside a later answer, for assistive technology. */
  mini: "The disks in {{host}}: {{state}}",
  miniBefore: "not checked since you signed in",
  miniAfter: "all reported no problem",
};

/** The scan line: one status per area of the NAS, each a link to its part of the page. */
export const SCAN = {
  label: "The NAS at a glance",
  disks: "Disks",
  storage: "Storage",
  sharing: "Sharing",
  network: "Network",
  notChecked: "Not checked",
  disksCount: "{{count}}, {{asleep}} asleep",
  drivesAll: "{{count}}, all with space",
  drivesSome: "{{name}}, {{percent}} used",
  notSetUp: "Not set up",
  drivesNone: "Only the system drive",
  sharingOn: "{{folders}}, {{ways}} on",
  sharingNone: "No shared folders yet",
  networkUp: "{{name}} at {{speed}}",
  /** For assistive technology: "Disks: Not checked, 6 disks, 1 asleep. Go to the disks." */
  goTo: "Go to {{part}}",
  parts: {
    disks: "the disk temperatures",
    storage: "the map of your NAS",
    sharing: "the ways in",
    network: "the network",
  },
};

/** What still holds on a later visit, under the answer (G1: it ends when it is done). */
export const ALSO = {
  sentence: "You could also {{list}}.",
  unused: "put {{device}} to use",
  unreached: "let computers open {{folder}}",
  or: ", or ",
};

/** What needs you in the lab's "something needs you" state: the catalogue's attention words. */
export const NEEDS = {
  label: "What needs you",
  title: "{{name}} is almost full",
  detail: "It is {{percent}} full, at or above its warning level of {{mark}}.",
  reason:
    "{{name}} is {{percent}} full. Make room or add storage before it fills.",
  action: "Open {{name}}",
};

export const GROUNDS = {
  side: "This NAS",
};

/** The design, for the owner, under the page in the lab (never in a shot). */
export const BEHAVIOUR = {
  title: "The dashboard: your NAS, drawn, read like an instrument",
  idea: "The page opens dark. On the first visit it greets the NAS by name with its own figures, and the NAS drawn large assembles beside the greeting. Under that, on every visit: the answer at full size, a line with one status per area, the live instrument panel beside what needs you or This NAS, then the map on its own plate, the temperatures and the shortcuts.",
  rules: [
    "Dismissed with Hide the welcome only; pointing at or clicking the page leaves it where it is (a change to rethink P.2).",
    "Never comes back by itself: the browser remembers the dashboard was seen (UI-13). Show me around brings it back for one visit and plays the drawing again, whatever Show tips says.",
    "Show tips off: no welcome, no newcomer captions on the map and no sentence of what still holds. The small drawing beside the answer stays, because it is the answer's picture.",
    "The answer carries Check disk health right after the sentence that says why it waits. It takes the filled accent only when nothing else is the next step.",
    "Motion: on the first visit the disks rise into their bays and the brackets draw (about 880 ms, each part usable as it lands); after a check, the small drawing's outlines join up disk by disk; the live charts move left with time. Reduced: everything lands at once with a short fade.",
    "Compact: the welcome's second paragraph, each disk's kind and size, the map's captions and the steps' explanations go; the panels tighten.",
  ],
};
