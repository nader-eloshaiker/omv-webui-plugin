// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { createSavedMarks, type SavedMarks } from "./savedMarks.ts";

/** Each step either changes the read's state or makes a save; `kept` is asked after each. */
type Step =
  | { inFlight: number }
  | { answered: string[] }
  | { saved: true }
  | { reset: true };

function run(steps: readonly Step[], modules = ["samba"]): boolean[] {
  const marks: SavedMarks = createSavedMarks();
  let kept = false;
  const tracked = marks.track(modules, () => {
    kept = false;
  });
  return steps.map((step) => {
    if ("inFlight" in step) {
      marks.readsInFlight(step.inFlight);
    } else if ("answered" in step) {
      marks.answered(step.answered);
    } else if ("saved" in step) {
      kept = true;
      tracked.saved();
    } else {
      marks.reset();
    }
    return kept;
  });
}

describe("when a saved mark may be forgotten", () => {
  it.each<{ name: string; steps: Step[]; kept: boolean[] }>([
    {
      name: "a reading asked for after the save, without the module, forgets it",
      steps: [{ saved: true }, { answered: [] }],
      kept: [true, false],
    },
    {
      name: "a reading that still shows the module keeps it, until one does not",
      steps: [{ saved: true }, { answered: ["samba"] }, { answered: ["ssh"] }],
      kept: [true, true, false],
    },
    {
      name: "the reading on its way at the save forgets nothing (it may predate the write)",
      steps: [
        { inFlight: 1 },
        { saved: true },
        { answered: [] },
        { inFlight: 0 },
        { answered: ["samba"] },
        { answered: [] },
      ],
      kept: [false, true, true, true, true, false],
    },
    {
      name: "a reading answered before the save says nothing about it",
      steps: [{ answered: [] }, { saved: true }],
      kept: [false, true],
    },
    {
      name: "a later save waits for a reading after it, too",
      steps: [
        { saved: true },
        { inFlight: 1 },
        { saved: true },
        { answered: [] },
        { inFlight: 0 },
        { answered: [] },
      ],
      kept: [true, true, true, true, true, false],
    },
    {
      name: "two readings on their way at the save are both passed over",
      steps: [
        { inFlight: 2 },
        { saved: true },
        { answered: [] },
        { answered: [] },
        { inFlight: 0 },
        { answered: [] },
      ],
      kept: [false, true, true, true, true, false],
    },
    {
      name: "nothing saved, nothing to forget",
      steps: [{ answered: [] }, { answered: ["samba"] }],
      kept: [false, false],
    },
    {
      name: "the session ending leaves no save waiting",
      steps: [{ saved: true }, { reset: true }],
      kept: [true, true],
    },
  ])("$name", ({ steps, kept }) => {
    expect(run(steps)).toEqual(kept);
  });

  it("follows any of a store's modules, and forgets once none of them is pending", () => {
    expect(
      run(
        [
          { saved: true },
          { answered: ["samba"] },
          { answered: ["sharedfolders"] },
          { answered: ["ssh"] },
        ],
        ["sharedfolders", "samba"],
      ),
    ).toEqual([true, true, true, false]);
  });

  it("forgets each store's marks on its own", () => {
    const marks = createSavedMarks();
    const forgotten: string[] = [];
    const smb = marks.track(["samba"], () => forgotten.push("samba"));
    const nfs = marks.track(["nfs"], () => forgotten.push("nfs"));
    smb.saved();
    nfs.saved();
    marks.answered(["nfs"]);
    expect(forgotten).toEqual(["samba"]);
    marks.answered([]);
    expect(forgotten).toEqual(["samba", "nfs"]);
    marks.answered([]);
    expect(forgotten).toEqual(["samba", "nfs"]);
  });
});
