// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it } from "vitest";
import { savedMarks } from "../pending/savedMarks.ts";
import { homePending, homeSession, recordHomeSaved } from "./homeSession.ts";

afterEach(() => {
  homeSession.reset();
  savedMarks.reset();
  savedMarks.readsInFlight(0);
});

describe("homeSession (12.3's pending mark)", () => {
  it("marks only after this session saved and while samba is pending", () => {
    expect(homePending(homeSession.getState(), ["samba"])).toBe(false);
    recordHomeSaved();
    expect(homePending(homeSession.getState(), ["samba"])).toBe(true);
    expect(homePending(homeSession.getState(), ["postfix"])).toBe(false);
  });

  it("forgets the save once samba is no longer pending", () => {
    recordHomeSaved();
    savedMarks.answered(["samba", "ssh"]);
    expect(homeSession.getState().saved).toBe(true);
    savedMarks.answered([]);
    expect(homeSession.getState().saved).toBe(false);
  });

  it("is not forgotten by the reading that was on its way when it was saved", () => {
    savedMarks.readsInFlight(1);
    recordHomeSaved();
    // The reply asked for before the write: samba was not pending yet.
    savedMarks.answered([]);
    savedMarks.readsInFlight(0);
    expect(homePending(homeSession.getState(), ["samba"])).toBe(true);
    savedMarks.answered(["samba"]);
    expect(homeSession.getState().saved).toBe(true);
    savedMarks.answered([]);
    expect(homeSession.getState().saved).toBe(false);
  });
});
