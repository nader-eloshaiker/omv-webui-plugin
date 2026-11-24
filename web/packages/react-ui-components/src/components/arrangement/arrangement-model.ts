// SPDX-License-Identifier: GPL-3.0-or-later
// Which blocks the arrangement drawing puts on which disk, and what one failing disk costs.

export type ArrangementKind = "mirror" | "stripe" | "parity";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ROWS = 3;

/** The letters on each disk, row by row: `null` marks a parity block. */
export function blockLayout(
  kind: ArrangementKind,
  disks: number,
): (string | null)[][] {
  const rows: (string | null)[][] = [];
  let next = 0;
  for (let r = 0; r < ROWS; r += 1) {
    const row: (string | null)[] = [];
    // Parity rotates across the disks, one block per row, from the last disk backwards.
    const parityAt = (disks - 1 - (r % disks) + disks) % disks;
    for (let d = 0; d < disks; d += 1) {
      if (kind === "mirror") {
        row.push(LETTERS[r] ?? "?");
      } else if (kind === "parity" && d === parityAt) {
        row.push(null);
      } else {
        row.push(LETTERS[next % LETTERS.length] ?? "?");
        next += 1;
      }
    }
    rows.push(row);
  }
  return rows;
}

/** Whether a layout loses data when one disk fails: a stripe does, a mirror and parity do not. */
export function losesDataOnOneFailure(kind: ArrangementKind): boolean {
  return kind === "stripe";
}

/** 0 to `disks - 1`: the disks a drawing has, left to right. */
export function diskNumbers(disks: number): number[] {
  return Array.from({ length: disks }, (_, d) => d);
}
