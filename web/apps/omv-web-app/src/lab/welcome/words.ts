// SPDX-License-Identifier: GPL-3.0-or-later
// Every word of the three welcome candidates, final copy shaped for the catalogue (the keys would sit
// under dashboard.welcome.<candidate> in locales/en/common.json once the owner chooses). Development
// only (UI-11). `{{name}}` is filled from the reads by `fill`; counts are written in words up to ten.
// The words of the map, the answer and the first steps are the catalogue's own (useNasWords).

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

/** Shared by the three candidates. */
export const COMMON = {
  hide: "Hide the welcome",
  hideName: "Hide the welcome to the new interface",
  classic: "Open the classic interface",
  showAround: "Show me around",
  newTab: "(opens in a new tab)",
  check: "Check disk health",
  checking: "Checking disk health…",
  checkNow: "Check disk health now",
  /** The answer before the check: the catalogue's title, a new reason. */
  notCheckedReason:
    "Disk health is checked only when you ask, because the check can wake sleeping disks.",
  checkingReason:
    "The disks are being checked. A sleeping disk wakes up for it.",
};

/** A. The person's NAS, drawn large, assembling as the welcome. */
export const DRAWN = {
  title: "Welcome to {{host}}.",
  existing: {
    lead: "Its {{disks}}, {{drives}} and {{folders}} are on this page, drawn as they are right now.",
    more: "Point at any of them to see what it holds, or press / to go anywhere. It all runs on the settings {{host}} already has.",
  },
  new: {
    lead: "It found {{disks}}. One holds the system, and the other {{free}} are ready to keep your files.",
    more: "Make one of them into storage, put a shared folder on it, and every computer at home can open it. The first steps below take you there.",
  },
  picture: "The disks in {{host}} and the drives they make",
  board: "On the mainboard",
  raid: "RAID array",
  unused: "Not in use",
  ready: "Ready for storage",
  /** The later visit's small picture beside the answer, for assistive technology. */
  mini: "The disks in {{host}}: {{state}}",
  miniBefore: "not checked since you signed in",
  miniAfter: "all reported no problem",
};

/** B. A strong statement, and the three things that work differently, pointed out in place. */
export const ANNOTATED = {
  existing: {
    title: "Now you can see all of {{host}} at a glance.",
    lead: "This is the new interface for openmediavault, running on the settings {{host}} already has. Three things work differently, and this page points each one out.",
  },
  new: {
    title: "Set up {{host}} from one page.",
    lead: "This is the new interface for openmediavault. Everything {{host}} has is drawn below, and this page points out the three things that get you started.",
  },
  notesLabel: "What works differently",
  palette: {
    lead: "Any page is one key away.",
    body: "Press / on any page, or use the search at the top, and type what you want, such as share {{folder}}.",
  },
  answer: {
    lead: "The answer comes first.",
    body: "It names the worst problem before anything else, and it says everything is working only after the disks have been checked.",
  },
  map: {
    lead: "Your NAS is drawn as a map.",
    body: "Each row is one drive, from its disks to its shared folders. Point at {{folder}} to see the disk it is on and how computers reach it.",
  },
  steps: {
    lead: "Start with the first steps.",
    body: "Storage comes first, then a shared folder on it. Each button opens the page that does it.",
  },
  mapNew: {
    lead: "Your NAS is drawn as a map.",
    body: "Its {{free}} free disks are on the left. Storage you add appears in the middle, and its shared folders on the right.",
  },
};

/** C. The welcome is the start of the work. */
export const START = {
  title: "Welcome to {{host}}.",
  existing: {
    lead: "Type what you want to do, or start with one of these.",
  },
  new: {
    lead: "Its {{free}} free disks are ready for your files. Type what you want to do, or start with the first step.",
  },
  field: "Find a page, a setting or a task",
  suggestions: "Suggested for {{host}}",
  check: {
    title: "Check the health of all {{disks}}.",
    asleep: "{{asleep}} is asleep, and the check wakes it up.",
    asleepMany: "{{asleep}} are asleep, and the check wakes them up.",
    awake: "Each disk reports whether it is wearing out.",
    action: "Check disk health",
  },
  unused: {
    title: "Put {{device}} to use.",
    detail:
      "This {{size}} {{kind}} is in {{host}}, but no storage is made from it yet.",
    action: "Add storage",
  },
  unreached: {
    title: "Let computers open {{folder}}.",
    detail: "It is a shared folder, but no way in reaches it yet.",
    action: "Share {{folder}}",
  },
  /** A later visit, while the suggestions still hold (G1, "Show tips" on). */
  also: "You could also {{list}}.",
  alsoUnused: "put {{device}} to use",
  alsoUnreached: "let computers open {{folder}}",
  /** Between the two phrases of `also`. */
  alsoOr: ", or ",
};

/** What each candidate does, for the owner, shown under the page in the lab (never in a shot). */
export const BEHAVIOUR: Record<
  "drawn" | "annotated" | "start",
  { idea: string; rules: readonly string[] }
> = {
  drawn: {
    idea: "The welcome is the person's own NAS, drawn large: every disk by its kind in the chassis, and under them the drives they make. On the first visit the disks drop into their bays and the brackets draw under them. On later visits a small copy of the drawing stands beside the answer, and the disk health check is drawn on it.",
    rules: [
      "Dismissed with Hide the welcome: it folds up and focus moves to the answer. Pointing at or clicking the page does not end it, so nothing jumps under the pointer.",
      "It never comes back by itself: the browser remembers that the dashboard was seen (a preference, UI-13), so the next visit opens on the answer.",
      "Show me around (This NAS, the account menu) brings it back for one visit and plays the drawing again, whatever Show tips says.",
      "Show tips off: no welcome on the first visit. The small drawing beside the answer stays, because it is the answer's picture, not a tip.",
      "Motion: the disks drop in left to right and the brackets draw, about 900 ms, every part usable as it lands; the map under it is already there. Reduced: the drawing fades in whole. After a check, each disk's dashed outline joins into a solid one.",
      "Compact: the second paragraph and each disk's kind and size go; the drawing is smaller.",
    ],
  },
  annotated: {
    idea: "One strong statement, then the three things that work differently, each pointed out beside the thing itself on the person's own page: the search, the answer and the map. Nothing covers a control; the notes sit in the empty side of each region and draw their line to it.",
    rules: [
      "Dismissed with Hide the welcome: the statement and the three notes fold away together and the answer becomes the page's heading.",
      "Never comes back by itself (the same remembered preference as today).",
      "Show me around brings the statement and the notes back for one visit and replays the map.",
      "Show tips off: no statement and no notes; the page opens on the answer.",
      "Motion: the map assembles as approved, and each note's line draws to its region as that region lands. Pointing at a note rings the thing it is about (a note is not a control, so it takes no focus; the words name the place). Reduced: the lines are drawn and the ring appears without a transition.",
      "Compact: each note keeps its first sentence, and the statement keeps its first sentence.",
    ],
  },
  start: {
    idea: "The welcome turns into the start of the work: a large search for any page, setting or task, and beside the answer, the few things this NAS suggests right now, each with its button. On a new NAS those are the first steps.",
    rules: [
      "Dismissed with Hide the welcome. A suggestion that is done leaves the list; when none is left, the welcome folds away by itself.",
      "Never comes back by itself. Suggestions that still hold appear on later visits as one sentence under the answer, until they are done or tips are off.",
      "Show me around brings the welcome back for one visit and replays the map.",
      "Show tips off: no welcome and no suggestions; the page opens on the answer, with Check disk health in it.",
      "Motion: the map assembles as approved. Pressing a suggestion's button turns it into its progress, and when it is done the row leaves and the answer changes its words. Reduced: rows go at once.",
      "Compact: the suggestions keep their title and button, and the search is the normal field height.",
    ],
  },
};
