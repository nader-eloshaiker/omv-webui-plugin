// SPDX-License-Identifier: GPL-3.0-or-later
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import type { DiskUseResult } from "./diskUse.ts";
import {
  inBlockerOrder,
  outputLines,
  phaseAfterCheck,
  wipePanelView,
} from "./wipe.ts";

const disk = {
  devicename: "sdb",
  canonicaldevicefile: "/dev/sdb",
} as DiskDevice;
const free: DiskUseResult = {
  known: true,
  uses: [{ kind: "none" }],
  blockers: [],
  unused: [],
};

describe("phaseAfterCheck", () => {
  it("offers the confirmation only when the disk is unchanged and free", () => {
    expect(
      phaseAfterCheck({
        kind: "ok",
        disk,
        result: free,
        untraceable: true,
        zfsKnown: false,
      }),
    ).toEqual({
      phase: "confirm",
      disk,
      unused: [],
      untraceable: true,
      zfsKnown: false,
      rechecking: false,
    });
  });

  it("refuses with the blockers found", () => {
    const result: DiskUseResult = {
      ...free,
      blockers: [{ kind: "swap" }],
    };
    expect(phaseAfterCheck({ kind: "refused", disk, result })).toEqual({
      phase: "refused",
      blockers: [{ kind: "swap" }],
    });
  });

  it("says when another disk took the name, or the disk is gone", () => {
    expect(phaseAfterCheck({ kind: "changed", disk })).toEqual({
      phase: "changed",
      device: "/dev/sdb",
    });
    expect(phaseAfterCheck({ kind: "gone" })).toEqual({ phase: "gone" });
  });

  it("refuses when the inputs could not be read (fail closed)", () => {
    const error = new Error("x");
    expect(phaseAfterCheck({ kind: "unchecked", error })).toEqual({
      phase: "refused",
      blockers: [{ kind: "unchecked" }],
      error,
    });
  });
});

describe("wipePanelView", () => {
  it("reads a secure wipe's percentage, and none for a quick one", () => {
    const output = "shred: pass 1/1 (random)...1.2GiB/3.7TiB 32%\n";
    expect(wipePanelView({ state: "running", output }, true)).toEqual({
      state: "running",
      secure: true,
      percent: 32,
    });
    expect(wipePanelView({ state: "running", output }, false)).toEqual({
      state: "running",
      secure: false,
      percent: null,
    });
    expect(wipePanelView({ state: "running", output: "" }, true)).toEqual({
      state: "running",
      secure: true,
      percent: null,
    });
  });

  it.each(["done", "failed", "stopped"] as const)("%s", (state) => {
    expect(wipePanelView({ state, output: "" }, true)).toEqual({ state });
  });
});

describe("outputLines and inBlockerOrder", () => {
  it("splits output into lines without a trailing empty one", () => {
    expect(outputLines("")).toEqual([]);
    expect(outputLines("a\nb\n")).toEqual(["a", "b"]);
    expect(outputLines("a\r\nb")).toEqual(["a", "b"]);
  });

  it("orders blockers as the page lists them", () => {
    expect(
      inBlockerOrder([
        { kind: "unchecked" },
        { kind: "raid", array: { name: "", devicefile: "/dev/md0" } },
        { kind: "system" },
      ]).map((b) => b.kind),
    ).toEqual(["system", "raid", "unchecked"]);
  });
});
