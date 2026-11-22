// SPDX-License-Identifier: GPL-3.0-or-later
import type { UserAccount } from "@omv-webui/react-api-omv/generated";
import { RpcError } from "@omv-webui/react-api-omv/transport";
import { describe, expect, it, vi } from "vitest";
import { accessByAccount } from "./accessByAccount.ts";
import {
  emailProblem,
  isMissing,
  leavesNoAdmin,
  personTodo,
  powerChanges,
  savePerson,
  sshLineOf,
} from "./personPage.ts";

const error = (status: number, message: string) =>
  new RpcError({ status, code: 0, message, operationId: "userMgmtGetUser" });

const SAM: UserAccount = {
  name: "sam",
  uid: 1006,
  comment: "",
  email: "",
  shell: "/usr/sbin/nologin",
  groups: ["users", "sudo"],
  disallowusermod: false,
  sshpubkeys: ["KEY"],
};

describe("does not exist (0.11, the VM's change 1)", () => {
  it("is only OMV's exact words for that very name, with HTTP 500", () => {
    expect(
      isMissing(error(500, "The user 'sam' does not exist."), "user", "sam"),
    ).toBe(true);
    expect(
      isMissing(error(500, "The group 'sam' does not exist."), "group", "sam"),
    ).toBe(true);
    expect(
      isMissing(error(500, "The user 'alex' does not exist."), "user", "sam"),
    ).toBe(false);
    expect(
      isMissing(error(400, "The user 'sam' does not exist."), "user", "sam"),
    ).toBe(false);
    expect(
      isMissing(error(500, "The group 'sam' does not exist."), "user", "sam"),
    ).toBe(false);
    expect(isMissing(new Error("x"), "user", "sam")).toBe(false);
  });
});

describe("what to do now (2.4)", () => {
  const folder = {
    uuid: "f",
    name: "Photos",
    privileges: { privilege: [] },
  } as never;
  const rows = accessByAccount("user", "sam", [folder], [SAM], []);

  it("takes the first case that applies, in the design's order", () => {
    expect(
      personTodo({
        warnedGroups: ["sudo"],
        ssh: { kind: "sshOff" },
        rows,
        home: undefined,
      }),
    ).toEqual({ kind: "power", groups: ["sudo"] });
    expect(
      personTodo({
        warnedGroups: [],
        ssh: { kind: "sshOff" },
        rows,
        home: undefined,
      }),
    ).toEqual({ kind: "ssh", reading: { kind: "sshOff" } });
    expect(
      personTodo({
        warnedGroups: [],
        ssh: { kind: "yes" },
        rows,
        home: undefined,
      }),
    ).toEqual({ kind: "noAccess" });
    expect(
      personTodo({
        warnedGroups: [],
        ssh: { kind: "no" },
        rows: [],
        home: undefined,
      }),
    ).toBeNull();
  });

  it("leaves out a case whose read failed", () => {
    expect(
      personTodo({
        warnedGroups: [],
        ssh: { kind: "unread" },
        rows: undefined,
        home: undefined,
      }),
    ).toBeNull();
  });
});

describe("what they can do (3.5)", () => {
  it("lists the changes in the order of the form", () => {
    expect(
      powerChanges({ admin: false, ssh: true }, { admin: true, ssh: false }),
    ).toEqual(["makeAdmin", "removeSsh"]);
    expect(
      powerChanges({ admin: true, ssh: false }, { admin: true, ssh: false }),
    ).toEqual([]);
  });

  it("knows when taking rights away leaves only the built-in admin", () => {
    const admin = { name: "alex", groups: ["users", "openmediavault-admin"] };
    expect(leavesNoAdmin([admin, SAM], "alex")).toBe(true);
    expect(
      leavesNoAdmin(
        [admin, { ...SAM, groups: ["openmediavault-admin"] }],
        "alex",
      ),
    ).toBe(false);
  });

  it("says how SSH stands only when it would stop the choice from working", () => {
    const on = {
      enable: true,
      passwordauthentication: true,
      pubkeyauthentication: true,
    };
    expect(sshLineOf(on, false, 0)).toBeNull();
    expect(sshLineOf({ ...on, enable: false }, false, 0)).toBe("off");
    expect(sshLineOf({ ...on, passwordauthentication: false }, false, 0)).toBe(
      "keysOnly",
    );
    expect(
      sshLineOf({ ...on, passwordauthentication: false }, false, 1),
    ).toBeNull();
    expect(sshLineOf(undefined, true, 0)).toBe("unread");
    expect(sshLineOf(undefined, false, 0)).toBeNull();
  });
});

describe("the email address (2.5)", () => {
  it.each([
    ["", false],
    ["alex@example.org", false],
    ["Alex.Smith@Example.ORG", false],
    ["alex", true],
    ["alex@example", true],
    ["a@b.org, c@d.org", true],
    ["a b@c.org", true],
  ])("%j is refused: %s", (email, refused) => {
    expect(emailProblem(email)).toBe(refused);
  });
});

describe("read, change, write (0.11)", () => {
  it("re-reads, then sends every field as read with only the change, never uid", async () => {
    const api = {
      user: vi.fn(() => Promise.resolve({ ...SAM })),
      setUser: vi.fn(() => Promise.resolve({} as never)),
    };
    const outcome = await savePerson(api, SAM, () => ({ comment: "Sam" }), {
      saving: ["comment"],
    });
    expect(outcome.kind).toBe("saved");
    expect(api.user).toHaveBeenCalledWith("sam");
    expect(api.setUser).toHaveBeenCalledWith({
      name: "sam",
      groups: ["users", "sudo"],
      shell: "/usr/sbin/nologin",
      password: "",
      email: "",
      comment: "Sam",
      disallowusermod: false,
      sshpubkeys: ["KEY"],
    });
  });

  it("stops when the person changed elsewhere in a field this save does not write", async () => {
    const api = {
      user: vi.fn(() =>
        Promise.resolve({ ...SAM, groups: ["users"], comment: "Other" }),
      ),
      setUser: vi.fn(),
    };
    const outcome = await savePerson(api, SAM, () => ({ comment: "Sam" }), {
      saving: ["comment"],
    });
    expect(outcome).toMatchObject({ kind: "changed", fields: ["groups"] });
    expect(api.setUser).not.toHaveBeenCalled();
  });

  it("says when the person is gone, and passes any other failure on", async () => {
    const gone = {
      user: vi.fn(() =>
        Promise.reject(error(500, "The user 'sam' does not exist.")),
      ),
      setUser: vi.fn(),
    };
    await expect(savePerson(gone, SAM, () => ({}))).resolves.toEqual({
      kind: "gone",
    });
    const broken = {
      user: vi.fn(() => Promise.reject(error(500, "Something else."))),
      setUser: vi.fn(),
    };
    await expect(savePerson(broken, SAM, () => ({}))).rejects.toThrow(
      "Something else.",
    );
  });

  it("refuses when the last check says so (0.8)", async () => {
    const api = {
      user: vi.fn(() => Promise.resolve({ ...SAM })),
      setUser: vi.fn(),
    };
    await expect(
      savePerson(api, SAM, () => ({}), { refuse: () => true }),
    ).resolves.toEqual({ kind: "refused" });
    expect(api.setUser).not.toHaveBeenCalled();
  });
});
