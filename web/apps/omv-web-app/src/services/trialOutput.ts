// SPDX-License-Identifier: GPL-3.0-or-later
// Reading a copy job's trial run (phase 5 services design 0.6, 5.7): what it would copy and what it
// would delete, counted from the task's output. The output is OMV's job script around rsync, which
// OMV always runs with `--verbose`; with `--dry-run` rsync prints one line per item it would
// transfer and, with deletion, one "deleting <path>" line per item it would remove, then its summary.
//
// Written against rsync's documented `--verbose` output and checked against a trial captured on the
// test VM (the contract's execGetOutput.rsyncTrialFinished example): folders end in "/", also in
// "deleting dir/" lines; only lines not ending in "/" count as files, copied or deleted. Every rule about a line's form is in LINE_RULES below, in one place, so
// it can follow what the VM shows. A line no rule knows makes the counts "about" (not exact), never
// a guess presented as exact.
//
// The lines are read as text only and never rendered from here (UI-2); the page shows them through
// the TaskLog or as text nodes.
import { stripControl } from "@omv-webui/react-ui-components";

/** What one line of the output is. */
export type TrialLineKind =
  /** Blank, or a line the script or rsync writes around the list. */
  | "chatter"
  /** "deleting <path>": an item the job would delete at its destination. */
  | "delete"
  /** A folder the job would make or update (rsync ends its name with "/"). */
  | "folder"
  /** A file (or link) the job would copy. */
  | "file"
  /** rsync's summary: "sent … bytes …", "total size is … (DRY RUN)". */
  | "summary"
  /** A line none of the rules knows: the counts are then not exact. */
  | "unknown";

/**
 * The rules, tried in order; the first that matches decides. `chatter` and `summary` lines are left
 * out of the counts; `delete`, `folder` and `file` are counted; anything else is `unknown`.
 */
export const LINE_RULES: readonly { kind: TrialLineKind; test: RegExp }[] = [
  { kind: "chatter", test: /^\s*$/u },
  // OMV's job script, before and after rsync.
  { kind: "chatter", test: /^Please wait, syncing .+ \.\.\.$/u },
  {
    kind: "chatter",
    test: /^The synchronisation has completed successfully\.$/u,
  },
  // rsync's own headers.
  { kind: "chatter", test: /^(sending|receiving) incremental file list$/u },
  { kind: "chatter", test: /^building file list \.\.\. done$/u },
  { kind: "chatter", test: /^(created directory|skipping non-regular file) /u },
  // The source folder itself.
  { kind: "chatter", test: /^\.\/$/u },
  // The summary, the second line marked "(DRY RUN)" in a trial.
  { kind: "summary", test: /^sent [\d,.]+ bytes\s+received [\d,.]+ bytes/u },
  { kind: "summary", test: /^total size is [\d,.]+\s+speedup is [\d,.]+/u },
  // "deleting old/report.txt", and "*deleting" when itemised.
  { kind: "delete", test: /^\*?deleting .+/u },
  // rsync's own warnings and errors ("rsync: …", "rsync error: …", "IO error encountered …").
  {
    kind: "unknown",
    test: /^(rsync[: ]|IO error|cannot delete|file has vanished)/u,
  },
  // A folder ends with "/"; anything else on a line of its own is a file.
  { kind: "folder", test: /^.+\/$/u },
  { kind: "file", test: /^.+$/u },
];

/** One line, as received, with escape codes removed. */
export const cleanLine = (line: string): string => stripControl(line);

export function lineKind(line: string): TrialLineKind {
  const text = cleanLine(line);
  return LINE_RULES.find((rule) => rule.test.test(text))?.kind ?? "unknown";
}

/** The path of a "deleting" line. */
const deletedPath = (line: string): string =>
  cleanLine(line).replace(/^\*?deleting /u, "");

export interface TrialReading {
  /** Files it would copy (folders are not counted). */
  copies: number;
  /** Files it would delete (folders, ending in "/", are listed but not counted). */
  deleteCount: number;
  /** Every item it would delete, in the output's order: files, and folders ending in "/". */
  deletes: readonly string[];
  /** False when a line no rule knows was seen: the counts are then said as "about". */
  exact: boolean;
  /** rsync printed its "(DRY RUN)" summary: the run was a trial and changed nothing. */
  dryRun: boolean;
}

/** The trial's counts, from every line received. */
export function readTrial(lines: readonly string[]): TrialReading {
  let copies = 0;
  let deleteCount = 0;
  const deletes: string[] = [];
  let exact = true;
  let dryRun = false;
  for (const line of lines) {
    switch (lineKind(line)) {
      case "file":
        copies += 1;
        break;
      case "delete": {
        const path = deletedPath(line);
        deletes.push(path);
        if (!path.endsWith("/")) {
          deleteCount += 1;
        }
        break;
      }
      case "summary":
        if (/\(DRY RUN\)\s*$/u.test(cleanLine(line))) {
          dryRun = true;
        }
        break;
      case "unknown":
        exact = false;
        break;
      case "chatter":
      case "folder":
        break;
    }
  }
  return { copies, deleteCount, deletes, exact, dryRun };
}

/** How many of the deleting lines the result lists before "Show the whole trial output" (5.7). */
export const LISTED_DELETES = 20;

/** The common causes of a failed run the result explains (5.7), from the output's words. */
export type FailureCause = "hostKey" | "denied" | "notMounted" | "partial";

// Observed on the test VM: "Host key verification failed.", "@ERROR: auth failed on module …" for a
// wrong rsync password, "[ERROR] Source storage device not mounted at …", and rsync's exit code 23
// when the account on the other computer cannot set times or permissions (the files arrived).
const CAUSES: readonly { cause: FailureCause; test: RegExp }[] = [
  { cause: "hostKey", test: /Host key verification failed/iu },
  { cause: "denied", test: /Permission denied|auth failed/iu },
  { cause: "notMounted", test: /not mounted/iu },
  { cause: "partial", test: /\(code 23\)/u },
];

/** Each cause whose words appear in the output, in a fixed order, at most once each. */
export function failureCauses(lines: readonly string[]): FailureCause[] {
  const text = lines.map(cleanLine).join("\n");
  return CAUSES.filter(({ test }) => test.test(text)).map(({ cause }) => cause);
}

/** The last lines of an output, for a failure's account (5.7, 7.3). */
export const lastLines = (
  lines: readonly string[],
  count = 10,
): readonly string[] =>
  lines
    .map(cleanLine)
    .filter((l) => l.trim() !== "")
    .slice(-count);

/**
 * A failed run's account: OMV's message is "Failed to execute command '…' with exit code 'N': " then
 * everything the job printed (observed). The command is dropped; `output` is empty when the job ended
 * at once without a word (a second start while it runs, observed: 7.3's silent failure). A message of
 * another form is returned whole as the output.
 */
export function failureOutput(message: string): {
  exitCode: number | null;
  output: string;
} {
  const match =
    /^Failed to execute command '[\s\S]*?' with exit code '(\d+)': ?([\s\S]*)$/u.exec(
      message,
    );
  if (match === null) {
    return { exitCode: null, output: message };
  }
  return { exitCode: Number(match[1]), output: match[2] ?? "" };
}

/**
 * A run's lines for the screen: what was received, and the failure's account only where it adds to
 * it. OMV's failing poll repeats everything the job printed after its command (observed), so when the
 * account starts with what was received it replaces it, when what was received already ends with the
 * account it is left out, and only otherwise is it added after.
 */
export function runLines(output: string, errorMessage?: string): string[] {
  const failure =
    errorMessage === undefined ? "" : failureOutput(errorMessage).output;
  const received = output.replace(/\s+$/u, "");
  const account = failure.replace(/\s+$/u, "");
  let text: string;
  if (account === "") {
    text = output;
  } else if (received === "" || account.startsWith(received)) {
    text = failure;
  } else if (received.endsWith(account)) {
    text = output;
  } else {
    text = `${output}${output.endsWith("\n") ? "" : "\n"}${failure}`;
  }
  if (text === "") {
    return [];
  }
  const lines = text.split(/\r?\n/u);
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}
