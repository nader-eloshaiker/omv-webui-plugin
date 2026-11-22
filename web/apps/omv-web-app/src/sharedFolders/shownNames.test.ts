// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { shownFsName } from "./shownNames.ts";

const row = (label: string | null) => ({
  label,
  type: "ext4",
  canonicaldevicefile: "/dev/sdd1",
  devicefile: "/dev/disk/by-uuid/x",
});

describe("shownFsName", () => {
  it("shows a label's controls as the placeholder", () => {
    expect(shownFsName(row("‮atad"))).toEqual({
      kind: "label",
      text: "�atad",
    });
  });

  it("keeps a plain label and the device rule as they are", () => {
    expect(shownFsName(row("Media"))).toEqual({ kind: "label", text: "Media" });
    expect(shownFsName(row(null))).toEqual({
      kind: "onDevice",
      type: "ext4",
      device: "/dev/sdd1",
    });
  });
});
