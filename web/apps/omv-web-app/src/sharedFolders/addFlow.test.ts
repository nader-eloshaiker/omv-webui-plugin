// SPDX-License-Identifier: GPL-3.0-or-later
// The add flow's plan and how it finds the folder it made (phase 5 shares design 6.4, 6.6): the steps
// that apply to the choices, in order, and the folder found by its UUID once known, else by name,
// mount entry and path (the stored path has a trailing "/", observed).
import type { SharedFolder } from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import { addSteps, findMade } from "./addFlow.ts";

const SMB = { browseable: true, readonly: false, guest: "no" } as const;
const ALEX = [{ type: "user", name: "alex", perms: 7 }] as const;

describe("addSteps (6.4)", () => {
  it.each([
    {
      name: "nobody given access, not shared",
      choices: { privileges: [], smb: null, turnOn: false },
      want: ["check", "make", "apply", "verify"],
    },
    {
      name: "access and sharing, SMB on",
      choices: { privileges: [...ALEX], smb: SMB, turnOn: false },
      want: ["check", "make", "access", "share", "apply", "verify"],
    },
    {
      name: "access and sharing, SMB off",
      choices: { privileges: [...ALEX], smb: SMB, turnOn: true },
      want: ["check", "make", "access", "smbOn", "share", "apply", "verify"],
    },
    {
      name: "guests only: shared, nobody given access",
      choices: {
        privileges: [],
        smb: { ...SMB, guest: "allow" },
        turnOn: true,
      },
      want: ["check", "make", "smbOn", "share", "apply", "verify"],
    },
    {
      name: "turnOn without sharing is ignored",
      choices: { privileges: [], smb: null, turnOn: true },
      want: ["check", "make", "apply", "verify"],
    },
  ] as const)("$name", ({ choices, want }) => {
    expect(
      addSteps({
        ...choices,
        privileges: [...choices.privileges],
      }),
    ).toEqual(want);
  });
});

describe("findMade (6.6)", () => {
  const row = (over: Partial<SharedFolder>): SharedFolder =>
    ({
      uuid: "00000000-0000-4000-8000-000000000401",
      name: "Photos",
      mntentref: "00000000-0000-4000-8000-000000000002",
      reldirpath: "Photos/",
      ...over,
    }) as SharedFolder;
  const choices = {
    name: "Photos",
    mntentref: "00000000-0000-4000-8000-000000000002",
    reldirpath: "Photos",
  };

  it("finds the folder by name, mount entry and path before its UUID is known", () => {
    expect(findMade([row({})], choices, null)?.uuid).toBe(
      "00000000-0000-4000-8000-000000000401",
    );
  });

  it("does not take another folder of the same name elsewhere, or another path", () => {
    expect(
      findMade(
        [
          row({ mntentref: "00000000-0000-4000-8000-000000000001" }),
          row({ reldirpath: "Other/" }),
        ],
        choices,
        null,
      ),
    ).toBeUndefined();
  });

  it("takes only its own UUID once known", () => {
    const mine = row({ uuid: "00000000-0000-4000-8000-000000000402" });
    expect(
      findMade(
        [row({}), mine],
        choices,
        "00000000-0000-4000-8000-000000000402",
      ),
    ).toBe(mine);
    expect(
      findMade([row({})], choices, "00000000-0000-4000-8000-000000000402"),
    ).toBeUndefined();
  });

  it("finds a folder using the whole file system", () => {
    expect(
      findMade(
        [row({ reldirpath: "/" })],
        { ...choices, reldirpath: "/" },
        null,
      ),
    ).toBeDefined();
  });
});
