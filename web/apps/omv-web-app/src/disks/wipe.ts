// SPDX-License-Identifier: GPL-3.0-or-later
// The wipe's decisions (phase 5 disks design 3; owner, P1 to P9), kept out of the components so each
// is tested by itself: which state the checked dialog is in after a re-read, and what the running
// panel shows for the task's state and output. Nothing here starts a wipe.
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import type { TaskSnapshot } from "@omv-webui/react-api-omv/tasks";
import type { Recheck } from "../hooks/useDiskReads.ts";
import type { FsRef, WipeBlocker } from "./diskUse.ts";
import { wipeProgress } from "./diskWords.ts";

/** What the wipe dialog shows (3.2, 3.3). */
export type WipeDialogPhase =
  | { phase: "checking" }
  /** A blocker appeared since the page was read, or the inputs could not be read (fail closed). */
  | { phase: "refused"; blockers: WipeBlocker[]; error?: unknown }
  /** Another disk now has this disk's name: its serial number, model or stable name differ. */
  | { phase: "changed"; device: string }
  | { phase: "gone" }
  | {
      phase: "confirm";
      disk: DiskDevice;
      unused: FsRef[];
      untraceable: boolean;
      /** The ZFS pools' disks were read: the untraceable sentence does not name ZFS (ZFS design 10.2). */
      zfsKnown: boolean;
      /** "Checking again…": the second re-read on "Wipe disk" is under way. */
      rechecking: boolean;
      /** The wipe could not be started; nothing was erased. */
      startError?: unknown;
    };

/** The dialog's phase after a re-read. Only "ok" leads to the confirmation; everything else refuses. */
export function phaseAfterCheck(outcome: Recheck): WipeDialogPhase {
  switch (outcome.kind) {
    case "ok":
      return {
        phase: "confirm",
        disk: outcome.disk,
        unused: outcome.result.unused,
        untraceable: outcome.untraceable,
        zfsKnown: outcome.zfsKnown,
        rechecking: false,
      };
    case "refused":
      return { phase: "refused", blockers: outcome.result.blockers };
    case "changed":
      return { phase: "changed", device: outcome.disk.canonicaldevicefile };
    case "gone":
      return { phase: "gone" };
    case "unchecked":
      return {
        phase: "refused",
        blockers: [{ kind: "unchecked" }],
        error: outcome.error,
      };
  }
}

/** What the panel shows for a wipe task (3.5, 3.6). */
export type WipePanelView =
  | {
      state: "running";
      secure: boolean;
      /** The percentage of a secure wipe, from shred's last line; null while it reports none. */
      percent: number | null;
    }
  | { state: "done" }
  | { state: "failed" }
  | { state: "stopped" };

export function wipePanelView(
  task: Pick<TaskSnapshot, "state" | "output">,
  secure: boolean,
): WipePanelView {
  switch (task.state) {
    case "running":
      return {
        state: "running",
        secure,
        percent: secure ? wipeProgress(task.output) : null,
      };
    case "done":
      return { state: "done" };
    case "failed":
      return { state: "failed" };
    case "stopped":
      return { state: "stopped" };
  }
}

/** The task's output as lines for the output block; a trailing newline adds no empty line. */
export function outputLines(output: string): string[] {
  if (output === "") {
    return [];
  }
  const lines = output.split(/\r?\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

/** The order of the blocker lines (3.1); the rules already return them in it. */
export const BLOCKER_ORDER: readonly WipeBlocker["kind"][] = [
  "system",
  "readOnly",
  "fsInUse",
  "fsSetUp",
  "fsCreating",
  "swap",
  "raid",
  "zfs",
  "wiping",
  "unchecked",
];

/** The blockers in 3.1's order, whatever order they came in. */
export const inBlockerOrder = (
  blockers: readonly WipeBlocker[],
): WipeBlocker[] =>
  [...blockers].sort(
    (a, b) => BLOCKER_ORDER.indexOf(a.kind) - BLOCKER_ORDER.indexOf(b.kind),
  );
