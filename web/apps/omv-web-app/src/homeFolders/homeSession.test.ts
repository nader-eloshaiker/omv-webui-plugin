// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it } from "vitest";
import {
  forgetHomePending,
  homePending,
  homeSession,
  recordHomeSaved,
} from "./homeSession.ts";

afterEach(() => homeSession.reset());

describe("homeSession (12.3's pending mark)", () => {
  it("marks only after this session saved and while samba is pending", () => {
    expect(homePending(homeSession.getState(), ["samba"])).toBe(false);
    recordHomeSaved();
    expect(homePending(homeSession.getState(), ["samba"])).toBe(true);
    expect(homePending(homeSession.getState(), ["postfix"])).toBe(false);
  });

  it("forgets the save once samba is no longer pending", () => {
    recordHomeSaved();
    forgetHomePending(["samba", "ssh"]);
    expect(homeSession.getState().saved).toBe(true);
    forgetHomePending([]);
    expect(homeSession.getState().saved).toBe(false);
  });
});
