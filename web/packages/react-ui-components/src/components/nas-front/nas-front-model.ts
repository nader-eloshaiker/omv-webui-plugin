// SPDX-License-Identifier: GPL-3.0-or-later
// The drawing of the NAS's front, apart from its pictures: which bays run together under one bracket.
// Pure, so the caller's reads decide every name and the drawing only places them.

/** What a bay's disk belongs to, as the caller reads it: a drive, an array, or nothing yet. */
export interface NasFrontRun {
  /** The same id for every disk of one drive; a run of bays with one id is one bracket. */
  id: string;
  /** The bracket's words: the drive's name ("Data drive"), "RAID array", "Ready for storage". */
  name: string;
  /** What it is made as, under its name: "EXT4", "ZFS pool". */
  tech?: string;
  /** Unused disks: the bracket is dashed and its name in the secondary ink. */
  dashed?: boolean;
}

/** A bracket under the chassis, spanning the bays of one drive. Columns count from 1. */
export interface NasFrontGroup extends NasFrontRun {
  /** The first bay it spans, from 1. */
  start: number;
  /** How many bays it spans. */
  span: number;
}

/**
 * The bays grouped, in bay order, into runs of the drive they make: neighbouring bays with the same
 * run id share one bracket. A drive whose disks are not neighbours gets a bracket for each run, so
 * no bracket ever spans a bay that is not its own.
 */
export function nasFrontGroups<T>(
  bays: readonly T[],
  runOf: (bay: T, index: number) => NasFrontRun,
): NasFrontGroup[] {
  const groups: NasFrontGroup[] = [];
  bays.forEach((bay, i) => {
    const run = runOf(bay, i);
    const last = groups.at(-1);
    if (last && last.id === run.id) {
      last.span += 1;
      return;
    }
    groups.push({ ...run, start: i + 1, span: 1 });
  });
  return groups;
}

/**
 * The columns of the chassis: one per bay, and at least two when a stick is on the board, since its
 * words take the columns after its slot.
 */
export function nasFrontColumns(bays: number, sticks: number): number {
  return Math.max(bays, sticks > 0 ? 2 : 1);
}
