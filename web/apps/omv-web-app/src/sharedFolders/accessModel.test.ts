// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import { ShareMgmtSetPrivilegesRequestSchema } from "@omv-webui/react-api-omv/forms";
import type {
  SharedFolderPrivileges,
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  accessCounts,
  accessModel,
  accessOf,
  accessSummary,
  allowedValues,
  anyoneHasAccess,
  changedElsewhere,
  changedRows,
  effectiveAccess,
  entriesOf,
  gridGivesAccess,
  groupLine,
  privilegesToSave,
  rebaseChoices,
  withChoice,
  type Access,
  type AccessModel,
  type Choices,
} from "./accessModel.ts";

const clone = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;
const USERS = clone<UserAccount[]>(
  CONTRACT_EXAMPLES.userMgmtGetUserList.several.value.data,
);
const GROUPS = clone<UserGroup[]>(
  CONTRACT_EXAMPLES.userMgmtGetGroupList.several.value.data,
);
const PHOTOS = clone<SharedFolderPrivileges>(
  CONTRACT_EXAMPLES.shareMgmtGetList.withAccess.value.data[1]?.privileges,
);

const user = (name: string, groups: string[] = ["users"]): UserAccount => ({
  name,
  comment: "",
  groups,
});
const group = (name: string, members: string[] = []): UserGroup => ({
  name,
  members,
});
const list = (
  ...entries: [type: "user" | "group", name: string, perms: number][]
): SharedFolderPrivileges => ({
  privilege: entries.map(([type, name, perms]) => ({
    type,
    name,
    perms: perms as 0 | 5 | 7,
  })),
});

const row = (model: AccessModel, id: string) => {
  const found = model.rows.find((r) => r.id === id);
  if (found === undefined) {
    throw new Error(`No row ${id}`);
  }
  return found;
};

describe("the join of 0.4", () => {
  it("reads the captured folder: groups first, then people, each by name", () => {
    const model = accessModel(USERS, GROUPS, PHOTOS);
    expect(model.rows.map((r) => r.id)).toEqual([
      "group:family",
      "user:alex",
      "user:example-2fa",
      "user:example-admin",
      "user:example-user",
      "user:robin",
      "user:sam",
    ]);
    expect(row(model, "group:family")).toMatchObject({
      stored: "ro",
      description: "Everyone at home",
    });
    expect(row(model, "user:alex")).toMatchObject({
      stored: "rw",
      description: "Alex at home",
      groups: ["family"],
    });
    expect(row(model, "user:sam").stored).toBe("ro");
    expect(row(model, "user:robin").stored).toBe("none");
    // `users` is every person's primary group, which getGroupList never lists: it names no row.
    expect(row(model, "user:sam").groups).toEqual([]);
    expect(model.stale).toEqual([]);
  });

  it("reads no entries from the empty string OMV sends (observed) and from a missing list", () => {
    expect(entriesOf("")).toEqual([]);
    expect(entriesOf(undefined)).toEqual([]);
    expect(entriesOf({})).toEqual([]);
    expect(
      accessModel([user("alex")], [], "").rows.map((r) => r.stored),
    ).toEqual(["none"]);
  });

  it("sorts in natural order, ignoring case", () => {
    const model = accessModel(
      [user("user10"), user("User2"), user("alex")],
      [group("Zeta"), group("alpha")],
      "",
    );
    expect(model.rows.map((r) => r.name)).toEqual([
      "alpha",
      "Zeta",
      "alex",
      "User2",
      "user10",
    ]);
  });

  it("shows a stored 0 as Blocked, offered only on its own row", () => {
    const model = accessModel(
      [user("alex"), user("sam")],
      [],
      list(["user", "alex", 0]),
    );
    expect(row(model, "user:alex").stored).toBe("blocked");
    expect(allowedValues(row(model, "user:alex"))).toContain("blocked");
    expect(allowedValues(row(model, "user:sam"))).not.toContain("blocked");
  });

  it.each([
    [7, "rw"],
    [5, "ro"],
    [0, "blocked"],
    ["7", "rw"],
    [3, "blocked"],
  ] as const)("reads perms %j as %s", (perms, access) => {
    expect(accessOf(perms)).toBe(access);
  });

  it("keeps entries for accounts no list shows apart, as stale", () => {
    const model = accessModel(
      [user("alex")],
      [group("family")],
      list(["user", "alex", 7], ["user", "gone", 5], ["group", "old", 7]),
    );
    expect(model.stale.map((e) => e.name)).toEqual(["gone", "old"]);
    expect(privilegesToSave(model, {})).toEqual([
      { type: "user", name: "alex", perms: 7 },
    ]);
  });

  it("marks the web administrator's row, if listed, and never sends it", () => {
    const model = accessModel([user("admin"), user("alex")], [], "");
    expect(row(model, "user:admin").admin).toBe(true);
    expect(
      privilegesToSave(model, { "user:admin": "rw", "user:alex": "ro" }),
    ).toEqual([{ type: "user", name: "alex", perms: 5 }]);
    expect(changedRows(model, { "user:admin": "rw" })).toEqual([]);
  });

  it("counts a group's members from both the person's groups and the group's members", () => {
    const model = accessModel(
      [user("alex", ["users", "family"]), user("sam")],
      [group("family"), group("work", ["sam"])],
      "",
    );
    expect(row(model, "user:alex").groups).toEqual(["family"]);
    expect(row(model, "user:sam").groups).toEqual(["work"]);
  });
});

describe("the write list (0.4, 0.10)", () => {
  const model = accessModel(
    [user("alex", ["users", "family"]), user("sam"), user("robin")],
    [group("family")],
    list(["group", "family", 5], ["user", "robin", 0]),
  );

  it("stores 7 and 5, no entry for No access, and keeps Blocked as 0, groups first", () => {
    const choices: Choices = { "user:alex": "rw", "user:sam": "none" };
    expect(privilegesToSave(model, choices)).toEqual([
      { type: "group", name: "family", perms: 5 },
      { type: "user", name: "alex", perms: 7 },
      { type: "user", name: "robin", perms: 0 },
    ]);
  });

  it("drops the whole entry when a row is set to No access", () => {
    expect(
      privilegesToSave(model, { "group:family": "none", "user:robin": "none" }),
    ).toEqual([]);
  });

  it("is a list the contract accepts", () => {
    const result = ShareMgmtSetPrivilegesRequestSchema["~standard"].validate({
      uuid: "00000000-0000-4000-8000-000000000005",
      privileges: privilegesToSave(model, { "user:alex": "rw" }),
    });
    expect(result instanceof Promise ? "async" : result.issues).toBeUndefined();
  });

  it("counts changes against what is stored", () => {
    const choices: Choices = {
      "user:alex": "rw",
      "user:sam": "none",
      "group:family": "ro",
    };
    expect(changedRows(model, choices).map((r) => r.id)).toEqual(["user:alex"]);
  });

  it("says whether anyone would have access", () => {
    expect(anyoneHasAccess(privilegesToSave(model, {}))).toBe(true);
    expect(
      anyoneHasAccess(privilegesToSave(model, { "group:family": "none" })),
    ).toBe(false);
    expect(gridGivesAccess(model, { "group:family": "none" })).toBe(false);
    expect(gridGivesAccess(model, { "user:sam": "ro" })).toBe(true);
  });

  it("counts people and groups with access, and lists them for the summary", () => {
    const choices: Choices = { "user:alex": "rw", "user:sam": "ro" };
    expect(accessCounts(model, choices)).toEqual({ people: 2, groups: 1 });
    const summary = accessSummary(model, choices);
    expect(summary.rw.map((r) => r.name)).toEqual(["alex"]);
    expect(summary.ro.map((r) => r.name)).toEqual(["family", "sam"]);
  });
});

describe("groups and people together (0.4; design 14.2 item 4, as 0.4 reads OMV)", () => {
  /** One person in `family`, with their own value and the group's; guest access off. */
  function combination(own: Access, ofGroup: Access) {
    const model = accessModel(
      [user("alex", ["users", "family"]), user("sam")],
      [group("family")],
      "",
    );
    const choices: Choices = { "user:alex": own, "group:family": ofGroup };
    const alex = row(model, "user:alex");
    return {
      line: groupLine(alex, model, choices),
      effective: effectiveAccess(alex, model, choices),
    };
  }

  it.each([
    // own, group's, the line under the person, what they get
    ["rw", "none", null, "rw"],
    ["ro", "none", null, "ro"],
    ["none", "none", null, "none"],
    ["none", "rw", { kind: "viaGroup", access: "rw", group: "family" }, "rw"],
    ["none", "ro", { kind: "viaGroup", access: "ro", group: "family" }, "ro"],
    ["ro", "rw", { kind: "viaGroup", access: "rw", group: "family" }, "rw"],
    ["rw", "ro", null, "rw"],
    ["blocked", "rw", { kind: "blockedVia", group: "family" }, "none"],
    ["blocked", "none", null, "none"],
    ["rw", "blocked", { kind: "groupBlocks", group: "family" }, "none"],
    ["none", "blocked", null, "none"],
  ] as const)("person %s, group %s", (own, ofGroup, line, effective) => {
    const result = combination(own, ofGroup);
    expect(result.line).toEqual(line);
    expect(result.effective).toBe(effective);
  });

  it("names the group that gives the most, the first by name on a tie", () => {
    const model = accessModel(
      [user("alex", ["users", "family", "work", "art"])],
      [group("work"), group("family"), group("art")],
      list(["group", "work", 7], ["group", "family", 5], ["group", "art", 7]),
    );
    expect(groupLine(row(model, "user:alex"), model, {})).toEqual({
      kind: "viaGroup",
      access: "rw",
      group: "art",
    });
  });

  it("has no line for a group's row", () => {
    const model = accessModel(
      [],
      [group("family")],
      list(["group", "family", 7]),
    );
    expect(groupLine(row(model, "group:family"), model, {})).toBeNull();
  });
});

describe("changed elsewhere (0.10)", () => {
  it("compares the stored lists, in any order", () => {
    const a = list(["user", "alex", 7], ["group", "family", 5]);
    const b = list(["group", "family", 5], ["user", "alex", 7]);
    expect(changedElsewhere(a, b)).toBe(false);
    expect(changedElsewhere(a, list(["user", "alex", 7]))).toBe(true);
    expect(
      changedElsewhere(a, list(["user", "alex", 5], ["group", "family", 5])),
    ).toBe(true);
    expect(changedElsewhere("", { privilege: [] })).toBe(false);
    expect(changedElsewhere("", undefined)).toBe(false);
  });

  it("carries the reader's changes onto the current list", () => {
    const users = [user("alex"), user("sam"), user("robin")];
    const before = accessModel(users, [], list(["user", "alex", 7]));
    const after = accessModel(
      users,
      [],
      list(["user", "alex", 7], ["user", "sam", 5], ["user", "robin", 0]),
    );
    const choices: Choices = {
      // A change the reader made: kept.
      "user:alex": "ro",
      // Equal to what was stored when opened: not a change, so the new stored value shows.
      "user:sam": "none",
    };
    expect(rebaseChoices(before, after, choices)).toEqual({
      "user:alex": "ro",
    });
    // A choice that is now what is stored is no longer a change.
    expect(rebaseChoices(before, after, { "user:robin": "blocked" })).toEqual(
      {},
    );
  });
});

describe("withChoice", () => {
  const users = [user("alex"), user("sam"), user("admin")];
  const model = accessModel(
    users,
    [group("family")],
    list(["user", "alex", 7], ["user", "sam", 0]),
  );

  it("records a change, and forgets it when set back to what is stored", () => {
    const one = withChoice(model, {}, ["user:alex"], "ro");
    expect(one).toEqual({ "user:alex": "ro" });
    expect(withChoice(model, one, ["user:alex"], "rw")).toEqual({});
  });

  it("sets many rows at once, never the administrator's or an unknown id", () => {
    expect(
      withChoice(
        model,
        {},
        ["group:family", "user:alex", "user:admin", "user:gone"],
        "ro",
      ),
    ).toEqual({ "group:family": "ro", "user:alex": "ro" });
  });

  it("never chooses Blocked anew, but lets a Blocked row go back to it", () => {
    expect(withChoice(model, {}, ["user:alex"], "blocked")).toEqual({});
    const changed = withChoice(model, {}, ["user:sam"], "rw");
    expect(changed).toEqual({ "user:sam": "rw" });
    expect(withChoice(model, changed, ["user:sam"], "blocked")).toEqual({});
  });
});
