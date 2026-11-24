// SPDX-License-Identifier: GPL-3.0-or-later
// Where a pending flight starts: the control the reader last pressed, while it is recent and still on
// the page; otherwise nowhere, and nothing flies.
import { describe, expect, it } from "vitest";
import { originOf } from "./flight.ts";

describe("originOf", () => {
  it("starts from the control last pressed, while the press is recent", () => {
    const save = document.createElement("button");
    document.body.append(save);
    expect(originOf({ element: save, at: 1_000 }, 5_000)).toBe(save);
    save.remove();
  });

  it("does not start from a press too long ago, or from a control that has gone", () => {
    const save = document.createElement("button");
    document.body.append(save);
    expect(originOf({ element: save, at: 1_000 }, 60_000)).toBeNull();
    save.remove();
    expect(originOf({ element: save, at: 1_000 }, 2_000)).toBeNull();
    expect(originOf(null)).toBeNull();
  });
});
