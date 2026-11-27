// SPDX-License-Identifier: GPL-3.0-or-later
import { NAS_ANSWER_WORDS } from "../../fixtures/nas-words";
import {
  NAS_READS,
  type NasHealth,
  type NasRead,
  type NasReads,
} from "../nas-map/nas-map-model";
import {
  capAttention,
  nasAnswerState,
  nasAnswerTone,
  nasAnswerWords,
  orderAttention,
  type NasAnswerInput,
} from "./nas-answer-model";

const ALL: NasReads = Object.fromEntries(NAS_READS.map((r) => [r, "ok"]));

const fine: NasAnswerInput = {
  reads: ALL,
  needs: [],
  newNas: false,
  storage: { total: 4, withSpace: 4 },
  checkedAt: "10:31",
};

const title = (input: NasAnswerInput) =>
  nasAnswerWords(nasAnswerState(input), NAS_ANSWER_WORDS).title;

describe("the answer (6.2 A)", () => {
  it("says everything is working only when every read arrived and nothing needs you", () => {
    expect(nasAnswerState(fine)).toEqual({
      kind: "ok",
      total: 4,
      withSpace: 4,
      checkedAt: "10:31",
    });
    expect(title(fine)).toBe("Everything is working.");
    expect(nasAnswerWords(nasAnswerState(fine), NAS_ANSWER_WORDS).reason).toBe(
      "The disks reported no problem at 10:31. All four drives have space.",
    );
  });

  // The rule that matters most: fail closed.
  it.each(NAS_READS)(
    "never says everything is working while the %s read failed or has not arrived",
    (read: NasRead) => {
      for (const state of ["failed", "loading", undefined] as const) {
        // `undefined`: the read is not listed at all, as before it was asked.
        const reads: NasReads = Object.fromEntries(
          Object.entries({ ...ALL, [read]: state }).filter(
            ([, v]) => v !== undefined,
          ),
        );
        const answer = nasAnswerState({ ...fine, reads });
        expect(answer.kind).not.toBe("ok");
        expect(nasAnswerTone(answer)).toBe("unknown");
        expect(title({ ...fine, reads })).not.toBe("Everything is working.");
      }
    },
  );

  it("never says everything is working with nothing read at all", () => {
    expect(nasAnswerState({ ...fine, reads: {} })).toEqual({
      kind: "reading",
      waiting: [...NAS_READS],
    });
  });

  it("says which read failed, before one that is still on its way", () => {
    const answer = nasAnswerState({
      ...fine,
      reads: { ...ALL, disks: "failed", network: "loading" },
    });
    expect(answer).toEqual({ kind: "unread", failed: ["disks"] });
    expect(nasAnswerWords(answer, NAS_ANSWER_WORDS).reason).toMatch(/disks/);
  });

  it("counts what needs the person, in a full sentence, with the worst one's tone", () => {
    const needs = [
      { health: "warning" as const },
      { health: "critical" as const },
      { health: "unknown" as const },
    ];
    const answer = nasAnswerState({ ...fine, needs });
    expect(answer).toEqual({ kind: "needs", count: 3, health: "critical" });
    expect(
      nasAnswerWords(answer, NAS_ANSWER_WORDS, "Disk sda is failing."),
    ).toEqual({
      title: "Three things need you.",
      reason: "Disk sda is failing.",
    });
    expect(title({ ...fine, needs: [{ health: "warning" }] })).toBe(
      "One thing needs you.",
    );
  });

  it("puts what needs the person before a failed read, and ignores what is fine", () => {
    expect(
      nasAnswerState({
        ...fine,
        reads: { ...ALL, ways: "failed" },
        needs: [{ health: "ok" }, { health: "warning" }],
      }),
    ).toEqual({ kind: "needs", count: 1, health: "warning" });
    expect(nasAnswerState({ ...fine, needs: [{ health: "ok" }] }).kind).toBe(
      "ok",
    );
  });

  it("welcomes a new NAS instead of judging it, but not over a failed read", () => {
    expect(nasAnswerState({ ...fine, newNas: true }).kind).toBe("welcome");
    expect(
      nasAnswerState({
        ...fine,
        newNas: true,
        reads: { ...ALL, health: "loading" },
      }).kind,
    ).toBe("welcome");
    expect(
      nasAnswerState({
        ...fine,
        newNas: true,
        reads: { ...ALL, disks: "failed" },
      }).kind,
    ).toBe("unread");
  });

  it("rests only on the reads it is told to", () => {
    expect(
      nasAnswerState({
        ...fine,
        reads: { ...ALL, system: "failed" },
        rests: ["disks", "storage"],
      }).kind,
    ).toBe("ok");
  });
});

describe("what needs you (6.2 B)", () => {
  const item = (id: string, health: NasHealth) => ({ id, health });

  it("lists worst first and keeps the found order among equals", () => {
    const list = [
      item("a", "unknown"),
      item("b", "warning"),
      item("c", "critical"),
      item("d", "warning"),
      item("e", "ok"),
    ];
    expect(orderAttention(list).map((a) => a.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("shows three rows, then how many more", () => {
    const list = ["a", "b", "c", "d", "e"].map((id) => item(id, "warning"));
    expect(capAttention(list)).toEqual({ shown: list.slice(0, 3), more: 2 });
    expect(capAttention(list.slice(0, 2)).more).toBe(0);
  });
});
