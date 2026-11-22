// SPDX-License-Identifier: GPL-3.0-or-later
import { UserMgmtSetUserRequestSchema } from "@omv-webui/react-api-omv/forms";
import { describe, expect, it } from "vitest";
import {
  descriptionProblem,
  hasOwnPage,
  isAccountAddress,
  NAME_MAX,
  newNameProblem,
  OMV_NAME,
} from "./nameRules.ts";

/** Whether the contract accepts a name as UserMgmt.setUser would send it. */
function contractAccepts(name: string): boolean {
  const result = UserMgmtSetUserRequestSchema["~standard"].validate({
    name,
    groups: ["users"],
    shell: "/usr/sbin/nologin",
    password: "",
    email: "",
    comment: "",
    disallowusermod: false,
    sshpubkeys: [],
  });
  return !(result instanceof Promise) && result.issues === undefined;
}

describe("newNameProblem (0.6)", () => {
  it.each([
    ["alex", null],
    ["a", null],
    ["robin.smith", null],
    ["sam_2", null],
    ["kim-lee", null],
    ["x".repeat(NAME_MAX), null],
  ])("accepts %s", (name, expected) => {
    expect(newNameProblem(name, "person")).toBe(expected);
  });

  it.each([
    ["", "length"],
    ["x".repeat(NAME_MAX + 1), "length"],
    ["Alex", "chars"],
    ["1alex", "chars"],
    [".alex", "chars"],
    ["_alex", "chars"],
    ["alex$", "chars"],
    ["1234", "chars"],
    ["al ex", "chars"],
    ["alëx", "chars"],
    ["-alex", "chars"],
  ])("refuses %s (%s)", (name, key) => {
    expect(newNameProblem(name, "person")?.key).toBe(key);
  });

  it.each([
    "admin",
    "administrator",
    "root",
    "guest",
    "nobody",
    "users",
    "everyone",
  ])("keeps %s for the NAS or Windows", (name) => {
    expect(newNameProblem(name, "person")?.key).toBe("reserved");
    expect(newNameProblem(name, "person", false)).toBeNull();
  });

  it.each(["users", "root", "admin", "sudo", "wheel", "everyone", "guests"])(
    "keeps the group name %s",
    (name) => {
      expect(newNameProblem(name, "group")?.key).toBe("reserved");
    },
  );

  it.each(["person", "group"] as const)(
    "keeps add for this interface's own address (%s)",
    (kind) => {
      expect(newNameProblem("add", kind)?.key).toBe("reservedHere");
      expect(newNameProblem("add", kind, false)).toBeNull();
      expect(newNameProblem("adder", kind)).toBeNull();
    },
  );

  it("never accepts a name the contract refuses", () => {
    const samples = [
      "alex",
      "a.b",
      "a_b",
      "a-b",
      "z9",
      "x".repeat(NAME_MAX),
      "Alex",
      "-a",
      "a b",
      "a$",
      "1a",
    ];
    for (const name of samples) {
      if (newNameProblem(name, "person") === null) {
        expect(contractAccepts(name)).toBe(true);
        expect(OMV_NAME.test(name)).toBe(true);
      }
    }
  });
});

describe("isAccountAddress (D1, UI-4)", () => {
  it.each([
    ["alex", true],
    ["Alex", true],
    ["alex$", true],
    ["add", true],
    ["", false],
    ["-alex", false],
    ["al/ex", false],
    ["..", true],
    ["a b", false],
    [undefined, false],
  ])("%s -> %s", (value, expected) => {
    expect(isAccountAddress(value)).toBe(expected);
  });
});

describe("descriptionProblem (D13)", () => {
  it.each([
    ["", null],
    ["Alex at home", null],
    ["Alex, at home", null],
    ["a".repeat(65), null],
    ["a".repeat(66), "tooLong"],
    ["Alex: at home", "chars"],
    ["two\nlines", "chars"],
  ])("%j", (text, key) => {
    expect(descriptionProblem(text)?.key ?? null).toBe(key);
  });
});

describe("hasOwnPage (14.2, the VM's change 11)", () => {
  it("is true for a name that passes OMV's pattern", () => {
    expect(hasOwnPage("alex")).toBe(true);
    expect(hasOwnPage("Alex")).toBe(true);
    expect(hasOwnPage("addy")).toBe(true);
    expect(hasOwnPage("add2")).toBe(true);
  });

  it("is false for an `add` made elsewhere, the address of Add a person (new ones are refused)", () => {
    expect(newNameProblem("add", "person")?.key).toBe("reservedHere");
    expect(hasOwnPage("add")).toBe(false);
  });

  it("is false for a value that could not be an address", () => {
    expect(hasOwnPage("")).toBe(false);
    expect(hasOwnPage("-alex")).toBe(false);
    expect(hasOwnPage("a/b")).toBe(false);
  });
});
