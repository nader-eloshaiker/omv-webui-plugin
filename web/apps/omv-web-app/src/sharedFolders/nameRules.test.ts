// SPDX-License-Identifier: GPL-3.0-or-later
import { ShareMgmtSetRequestSchema } from "@omv-webui/react-api-omv/forms";
import { describe, expect, it } from "vitest";
import {
  byteLength,
  defaultPath,
  descriptionProblem,
  displayPath,
  isSameOrInside,
  isWholeFs,
  nameProblem,
  normalisePath,
  pathProblem,
  typedNameMatches,
} from "./nameRules.ts";

const FOLDERS = [
  {
    uuid: "00000000-0000-4000-8000-000000000005",
    name: "Photos",
    mntentref: "00000000-0000-4000-8000-000000000002",
    reldirpath: "Photos/",
  },
  {
    uuid: "00000000-0000-4000-8000-00000000000e",
    name: "Whole",
    mntentref: "00000000-0000-4000-8000-000000000003",
    reldirpath: "/",
  },
];
const MNT = "00000000-0000-4000-8000-000000000002";

/** Whether the contract's request schema accepts a name (and a path) as ShareMgmt.set would send it. */
function contractAccepts(name: string, reldirpath = "x"): boolean {
  const result = ShareMgmtSetRequestSchema["~standard"].validate({
    uuid: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4",
    name,
    reldirpath,
    comment: "",
    mntentref: MNT,
    mode: "770",
  });
  if (result instanceof Promise) {
    throw new Error("The schema is synchronous.");
  }
  return result.issues === undefined;
}

describe("a new shared folder's name (design 0.5)", () => {
  it.each([
    ["Photos-2026", null],
    ["Family photos", null],
    ["תמונות", null],
    ["", "addShare.name.length"],
    ["y".repeat(80), null],
    ["y".repeat(81), "addShare.name.length"],
    // OMV counts bytes (observed): 40 Hebrew letters are 80 bytes, 41 are 82.
    ["א".repeat(40), null],
    ["א".repeat(41), "addShare.name.length"],
    ['a"b', "addShare.name.chars"],
    ["a\\b", "addShare.name.chars"],
    ["a/b", "addShare.name.chars"],
    ["a[b", "addShare.name.chars"],
    ["a]b", "addShare.name.chars"],
    ["a:b", "addShare.name.chars"],
    ["a|b", "addShare.name.chars"],
    ["a<b", "addShare.name.chars"],
    ["a>b", "addShare.name.chars"],
    ["a+b", "addShare.name.chars"],
    ["a=b", "addShare.name.chars"],
    ["a;b", "addShare.name.chars"],
    ["a,b", "addShare.name.chars"],
    ["a*b", "addShare.name.chars"],
    ["a?b", "addShare.name.chars"],
    ["a\tb", "addShare.name.chars"],
    ["a\u0000b", "addShare.name.chars"],
    [" lead", "addShare.name.chars"],
    ["trail ", "addShare.name.chars"],
    [".hidden", "addShare.name.dots"],
    ["a..b", "addShare.name.dots"],
    ["a.b", null],
    ["homes", "addShare.name.reserved"],
    ["GLOBAL", "addShare.name.reserved"],
    ["Printers", "addShare.name.reserved"],
    ["print$", "addShare.name.reserved"],
    ["IPC$", "addShare.name.reserved"],
    ["homes2", null],
    ["photos", "addShare.name.taken"],
    ["PHOTOS", "addShare.name.taken"],
  ] as const)("%j: %s", (name, key) => {
    expect(nameProblem(name, FOLDERS)?.key ?? null).toBe(key);
  });

  it("checks one rule at a time, in the design's order", () => {
    // Too long and with a forbidden character: the length comes first.
    expect(nameProblem(`${"y".repeat(80)}?`)?.key).toBe("addShare.name.length");
    // A forbidden character and two full stops: the characters come first.
    expect(nameProblem("a..b?")?.key).toBe("addShare.name.chars");
  });

  it("names the reserved word and the folder that holds the name", () => {
    expect(nameProblem("Homes")).toEqual({
      key: "addShare.name.reserved",
      name: "Homes",
    });
    expect(nameProblem("photos", FOLDERS)).toEqual({
      key: "addShare.name.taken",
      other: "Photos",
    });
  });

  it.each([
    "Photos",
    "תמונות",
    "a.b",
    "x".repeat(80),
    'a"b',
    "a/b",
    " a",
    "a ",
    ".a",
    "a..b",
    "homes",
    "IPC$",
    "a\u0001b",
  ])("accepts only names the contract accepts, on %j", (name) => {
    // The contract keeps OMV's rule so folders made elsewhere can be written back; the interface's
    // rules for a new name are stricter, never looser.
    if (nameProblem(name) === null) {
      expect(contractAccepts(name)).toBe(true);
    }
  });

  it("counts bytes of UTF-8", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("א")).toBe(2);
    expect(byteLength("😀")).toBe(4);
  });
});

describe("the folder on the file system (design 0.5)", () => {
  it.each([
    ["/Media/", "Media"],
    ["Media/Photos/", "Media/Photos"],
    ["//a", "a"],
    ["/", "/"],
    [" / ", "/"],
  ])("normalises %j to %j", (typed, path) => {
    expect(normalisePath(typed)).toBe(path);
  });

  it.each([
    ["Media", null],
    ["Media/Photos", null],
    ["/", null],
    ["a/b/c/d/e/f/g/h", null],
    ["a/b/c/d/e/f/g/h/i", "addShare.path.tooDeep"],
    ["", "addShare.path.invalid"],
    ["a//b", "addShare.path.invalid"],
    [".", "addShare.path.invalid"],
    ["..", "addShare.path.invalid"],
    ["a/../b", "addShare.path.invalid"],
    ["a/.hidden", "addShare.path.invalid"],
    ["a..b", "addShare.path.invalid"],
    ["a\\b", "addShare.path.invalid"],
    ["a\nb", "addShare.path.invalid"],
    ["x".repeat(255), null],
    ["x".repeat(256), "addShare.path.invalid"],
    ["Photos", "addShare.path.taken"],
  ] as const)("%j: %s", (path, key) => {
    expect(pathProblem(path, MNT, FOLDERS)?.key ?? null).toBe(key);
  });

  it("is taken only on the same file system, and a repaired folder may keep its own path", () => {
    expect(pathProblem("Photos", MNT, FOLDERS)).toEqual({
      key: "addShare.path.taken",
      other: "Photos",
    });
    expect(
      pathProblem("Photos", "00000000-0000-4000-8000-000000000001", FOLDERS),
    ).toBeNull();
    expect(pathProblem("Photos", MNT, FOLDERS, FOLDERS[0]?.uuid)).toBeNull();
    expect(
      pathProblem("/", "00000000-0000-4000-8000-000000000003", FOLDERS)?.key,
    ).toBe("addShare.path.taken");
  });

  it.each(["Media", "a/b/c", "/", "x".repeat(255), "a/.b", "a//b", "a/../b"])(
    "accepts only paths the contract accepts, on %j",
    (path) => {
      if (pathProblem(path, MNT) === null) {
        expect(contractAccepts("Photos", path)).toBe(true);
      }
    },
  );

  it("shows a stored path without its trailing slash, and the whole file system as /", () => {
    expect(displayPath("Photos/")).toBe("Photos");
    expect(displayPath("a/b/")).toBe("a/b");
    expect(displayPath("/")).toBe("/");
    expect(isWholeFs("/")).toBe(true);
    expect(isWholeFs("Photos/")).toBe(false);
    expect(defaultPath("Photos")).toBe("Photos");
  });

  it.each([
    ["Media/", "Media/", true],
    ["Media/", "Media/Photos/", true],
    ["Media/", "Media2/", false],
    ["Media/Photos/", "Media/", false],
    ["/", "anything/", true],
  ])("%j holds %j: %s", (outer, inner, inside) => {
    expect(isSameOrInside(outer, inner)).toBe(inside);
  });
});

describe("the description (design 2.6)", () => {
  it("takes up to 255 characters", () => {
    expect(descriptionProblem("x".repeat(255))).toBeNull();
    expect(descriptionProblem("x".repeat(256))?.key).toBe(
      "sharedFolder.description.tooLong",
    );
  });
});

describe("typedNameMatches", () => {
  it.each([
    ["Photos", "Photos", true],
    [" Photos ", "Photos", true],
    ["photos", "Photos", false],
    // A name with an override: the prompt shows "�evil.exe".
    ["\uFFFDevil.exe", "\u202Eevil.exe", true],
    ["\u202Eevil.exe", "\u202Eevil.exe", true],
    ["evil.exe", "\u202Eevil.exe", false],
    ["exe.live", "\u202Eevil.exe", false],
    ["\uFFFDevil.ex", "\u202Eevil.exe", false],
  ])("%j for %j is %s", (typed, name, matches) => {
    expect(typedNameMatches(typed, name)).toBe(matches);
  });
});
