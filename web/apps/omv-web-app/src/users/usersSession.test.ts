// SPDX-License-Identifier: GPL-3.0-or-later
import type { SharedFolder } from "@omv-webui/react-api-omv/generated";
import { afterEach, describe, expect, it } from "vitest";
import { savedMarks } from "../pending/savedMarks.ts";
import {
  accountId,
  accountSectionPending,
  beginAccountAction,
  deletedInSession,
  endAccountAction,
  forgetAdded,
  recordAccountSaved,
  recordAdded,
  recordDeleted,
  runningOnAccount,
  storedFor,
  unfinishedPeople,
  usersSession,
} from "./usersSession.ts";

afterEach(() => {
  usersSession.reset();
  savedMarks.reset();
});

const folder = (
  uuid: string,
  name: string,
  entries: { type: "user" | "group"; name: string; perms: number }[],
): SharedFolder =>
  ({
    uuid,
    name,
    privileges: { privilege: entries },
  }) as unknown as SharedFolder;

const PHOTOS = folder("p", "Photos", [
  { type: "user", name: "casey", perms: 7 },
]);
const DOCS = folder("d", "Documents", [
  { type: "user", name: "old", perms: 5 },
]);

describe("one action at a time (0.10)", () => {
  it("refuses a second action on the same account until the first ends", () => {
    const id = accountId("user", "alex");
    expect(beginAccountAction(id, "groups")).toBe(true);
    expect(beginAccountAction(id, "powers")).toBe(false);
    expect(runningOnAccount(id)).toBe("groups");
    expect(beginAccountAction(accountId("group", "alex"), "members")).toBe(
      true,
    );
    endAccountAction(id);
    expect(runningOnAccount(id)).toBeNull();
  });
});

describe("pending marks (0.4)", () => {
  it("shows a section's mark while its module is pending, and forgets them once nothing is", () => {
    const id = accountId("user", "alex");
    recordAccountSaved(id, "email");
    recordAccountSaved(id, "access");
    const state = usersSession.getState();
    expect(accountSectionPending(state, id, "email", ["postfix"])).toBe(true);
    expect(accountSectionPending(state, id, "email", ["ssh"])).toBe(false);
    expect(accountSectionPending(state, id, "access", ["samba"])).toBe(true);
    savedMarks.answered(["postfix"]);
    expect(usersSession.getState().saved[id]).toHaveLength(2);
    savedMarks.answered(["ssh"]);
    expect(usersSession.getState().saved).toEqual({});
  });
});

describe("what a folder stores for a person", () => {
  it("reads the entry, or No access without one", () => {
    expect(storedFor(PHOTOS, "casey")).toBe("rw");
    expect(storedFor(DOCS, "old")).toBe("ro");
    expect(storedFor(PHOTOS, "alex")).toBe("none");
    expect(
      storedFor(folder("x", "X", [{ type: "user", name: "a", perms: 0 }]), "a"),
    ).toBe("blocked");
  });
});

describe("the Users list's unfinished work (1.5)", () => {
  it("says when an added person's chosen access is not in the lists", () => {
    recordAdded({ name: "casey", access: { p: "rw", d: "ro" } });
    const state = usersSession.getState();
    expect(
      unfinishedPeople(state, [{ name: "casey" }], [PHOTOS, DOCS]),
    ).toEqual([{ kind: "access", name: "casey" }]);
    // Not while its flow still runs, nor without the folders' read.
    usersSession.set({ running: { [accountId("user", "casey")]: "add" } });
    expect(
      unfinishedPeople(usersSession.getState(), [{ name: "casey" }], [PHOTOS]),
    ).toEqual([]);
    usersSession.set({ running: {} });
    expect(
      unfinishedPeople(usersSession.getState(), [{ name: "casey" }], undefined),
    ).toEqual([]);
    forgetAdded("casey");
    expect(
      unfinishedPeople(
        usersSession.getState(),
        [{ name: "casey" }],
        [PHOTOS, DOCS],
      ),
    ).toEqual([]);
  });

  it("says when a deleted person is still listed, or still in folders' lists", () => {
    recordDeleted("user", "old", false);
    expect(
      unfinishedPeople(usersSession.getState(), [{ name: "old" }], [DOCS]),
    ).toEqual([{ kind: "notDeleted", name: "old" }]);
    recordDeleted("user", "old", true);
    expect(
      unfinishedPeople(usersSession.getState(), [], [PHOTOS, DOCS]),
    ).toEqual([{ kind: "staleAccess", name: "old", folders: [DOCS] }]);
    expect(unfinishedPeople(usersSession.getState(), [], [PHOTOS])).toEqual([]);
  });

  it("knows which accounts this session deleted (13.1)", () => {
    recordDeleted("user", "old", false);
    expect(deletedInSession(usersSession.getState(), "user", "old")).toBe(
      false,
    );
    recordDeleted("user", "old", true);
    expect(deletedInSession(usersSession.getState(), "user", "old")).toBe(true);
    expect(deletedInSession(usersSession.getState(), "group", "old")).toBe(
      false,
    );
    // Adding the name again forgets the deletion.
    recordAdded({ name: "old", access: {} });
    expect(deletedInSession(usersSession.getState(), "user", "old")).toBe(
      false,
    );
  });
});
