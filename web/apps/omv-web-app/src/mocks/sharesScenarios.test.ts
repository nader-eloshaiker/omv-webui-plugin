// SPDX-License-Identifier: GPL-3.0-or-later
// The shares stories of the mock (phase 5 shares design 13): every reply has the contract's shape,
// every request sent here passes the contract's form schema, and the answers remember what the pages
// do, with the pending modules, refusals and messages the test VM showed (journal, 2026-11-22).
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import * as F from "@omv-webui/react-api-omv/forms";
import type {
  SharedFolder,
  SmbSettings,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { describe, expect, it, vi } from "vitest";
// Test code only: the contract's tables, to check every reply.
import {
  OPERATIONS,
  SCHEMAS,
} from "../../../../packages/react-api-omv/src/contract/generated/operations.ts";
import {
  normalise,
  validate,
} from "../../../../packages/react-api-omv/src/transport/schema.ts";
import {
  newMockSession,
  scenarioAnswers,
  type ScenarioName,
} from "./scenarios.ts";
import {
  ADD_FAILURES_IN_TURN,
  addFailureOf,
  NEW_OBJECT,
  SHARES_OPERATIONS,
  SHARES_SCENARIOS,
  SLOW_DELETE,
  storedPath,
} from "./sharesScenarios.ts";

type AnyAnswer =
  | string
  | FixedAnswer
  | ((call: { params: unknown; options: unknown }) => string | FixedAnswer);

const entryOf = (operationId: string) =>
  Object.values(OPERATIONS).find((e) => e.operationId === operationId);

function checked(
  operationId: string,
  answer: string | FixedAnswer | undefined,
) {
  expect(answer, operationId).toBeDefined();
  if (typeof answer === "string" || answer === undefined) {
    return answer;
  }
  if (answer.status === 200) {
    const schema = entryOf(operationId)?.response;
    if (schema === null || schema === undefined) {
      expect(answer.value ?? null, operationId).toBeNull();
    } else {
      expect(
        validate(normalise(answer.value, schema, SCHEMAS), schema, SCHEMAS),
        operationId,
      ).toEqual([]);
    }
  } else {
    expect(answer.message, operationId).toEqual(expect.any(String));
  }
  return answer;
}

/** A request held first to the contract's form schema of its operation. */
function sent(
  schema: { "~standard": { validate: (value: unknown) => unknown } },
  params: object,
): object {
  const result = schema["~standard"].validate(params) as {
    issues?: readonly { message: string }[];
  };
  expect(
    result.issues?.map((i) => i.message),
    JSON.stringify(params),
  ).toBeUndefined();
  return params;
}

const ALL = {
  start: 0,
  limit: null,
  sortfield: null,
  sortdir: null,
  search: null,
};
const APPLY = CONTRACT_EXAMPLES.execGetOutput.appliedFinished.value.filename;
const REVERT = CONTRACT_EXAMPLES.configRevertChangesBg.reverted.value;
const SDA1 = "00000000-0000-4000-8000-000000000001";
const SDD1 = "00000000-0000-4000-8000-000000000002";

function story(scenario: ScenarioName) {
  const session = newMockSession(true);
  const answers: Readonly<Partial<Record<string, AnyAnswer>>> = scenarioAnswers(
    scenario,
    session,
  );
  const ask = (operationId: string, params: unknown = {}) => {
    const answer = answers[operationId];
    const result =
      typeof answer === "function"
        ? answer({ params, options: undefined })
        : answer;
    return checked(operationId, result);
  };
  const value = <T>(operationId: string, params: unknown = {}): T => {
    const answer = ask(operationId, params);
    expect(answer, operationId).toMatchObject({ status: 200 });
    return (answer as FixedAnswer).value as T;
  };
  const failure = (operationId: string, params: unknown = {}) => {
    const answer = ask(operationId, params) as FixedAnswer;
    expect(answer.status, operationId).not.toBe(200);
    return answer;
  };
  const pending = () =>
    Object.keys(
      value<{ dirtyModules: object }>("systemGetInformation").dirtyModules,
    ).sort();
  const folders = () =>
    value<{ data: SharedFolder[] }>("shareMgmtGetList", ALL).data;
  const folder = (name: string) => {
    const found = folders().find((f) => f.name === name);
    expect(found, name).toBeDefined();
    return found as SharedFolder;
  };
  const shares = () =>
    value<{ data: SmbShareRow[] }>("smbGetShareList", ALL).data;
  const settings = () => value<SmbSettings>("smbGetSettings");
  const samba = () =>
    value<{ data: { name: string; enabled: boolean; running: boolean }[] }>(
      "servicesGetStatus",
    ).data.find((s) => s.name === "samba");
  const apply = () =>
    ask("execGetOutput", { filename: APPLY, pos: 0 }) as string | FixedAnswer;
  const undo = () => ask("execGetOutput", { filename: REVERT, pos: 0 });
  const make = (name: string, mntentref = SDD1, reldirpath = name) =>
    ask(
      "shareMgmtSet",
      sent(F.ShareMgmtSetRequestSchema, {
        uuid: NEW_OBJECT,
        name,
        reldirpath,
        comment: "",
        mntentref,
        mode: "770",
      }),
    ) as FixedAnswer;
  /** The getShareList row sent back as 0.10 says: without sharedfoldername, three fields changed. */
  const rowBack = (row: SmbShareRow, change: object) => {
    const { sharedfoldername: _n, ...rest } = row;
    return sent(F.SmbSetShareRequestSchema, { ...rest, ...change });
  };
  const newShare = (folderUuid: string) =>
    sent(F.SmbSetShareRequestSchema, {
      ...rowBack(
        {
          ...CONTRACT_EXAMPLES.smbGetShareList.one.value.data[0],
        } as SmbShareRow,
        {},
      ),
      uuid: NEW_OBJECT,
      sharedfolderref: folderUuid,
    });
  return {
    session,
    ask,
    value,
    failure,
    pending,
    folders,
    folder,
    shares,
    settings,
    samba,
    apply,
    undo,
    make,
    rowBack,
    newShare,
  };
}

describe("the shares stories of the mock", () => {
  it.each(SHARES_SCENARIOS)(
    "%s: every reply has the contract's shape",
    (scenario) => {
      const s = story(scenario);
      for (const operationId of [
        "shareMgmtGetList",
        "shareMgmtGetCandidates",
        "userMgmtGetUserList",
        "userMgmtGetGroupList",
        "smbGetSettings",
        "servicesGetStatus",
        "fileSystemMgmtGetList",
        "systemGetInformation",
      ]) {
        expect(s.ask(operationId, ALL), operationId).toMatchObject({
          status: 200,
        });
      }
      s.ask("smbGetShareList", ALL);
    },
  );

  it.each(SHARES_SCENARIOS)("%s: answers 401 before sign-in", (scenario) => {
    const answers: Readonly<Partial<Record<string, AnyAnswer>>> =
      scenarioAnswers(scenario, newMockSession(false));
    for (const operationId of SHARES_OPERATIONS) {
      const answer = answers[operationId];
      expect(
        typeof answer === "function"
          ? answer({ params: ALL, options: undefined })
          : answer,
        operationId,
      ).toMatchObject({ status: 401 });
    }
  });

  it("the default story answers the new operations with captured examples, and marks writes", () => {
    const s = story("admin");
    expect(s.ask("shareMgmtGetCandidates")).toBe("dataOnly");
    expect(s.ask("smbGetShareList", ALL)).toBe("none");
    expect(s.ask("smbGetSettings")).toBe("off");
    expect(s.pending()).toEqual([]);
    expect(s.ask("smbSetShare")).toBe("created");
    expect(s.pending()).toEqual(["avahi", "samba"]);
    expect(s.ask("shareMgmtDelete")).toBe("removed");
    expect(s.pending()).toEqual([
      "avahi",
      "samba",
      "sharedfolders",
      "systemd",
      "task",
    ]);
    s.apply();
    expect(s.pending()).toEqual([]);
  });

  it("the people and groups never include admin or users", () => {
    const s = story("sharesSome");
    const users = s.value<{ data: { name: string; groups: string[] }[] }>(
      "userMgmtGetUserList",
      ALL,
    ).data;
    expect(users.map((u) => u.name)).toEqual(["alex", "sam", "robin"]);
    expect(users[0]?.groups).toEqual(["users", "family"]);
    const groups = s.value<{ data: { name: string }[] }>(
      "userMgmtGetGroupList",
      ALL,
    ).data;
    expect(groups.map((g) => g.name)).toEqual(["family"]);
    expect(
      story("sharesNoUsers").value<{ total: number }>(
        "userMgmtGetUserList",
        ALL,
      ).total,
    ).toBe(0);
  });

  it("sharesMany: 140 folders paged on the server, 1,000 people and 60 groups", () => {
    const s = story("sharesMany");
    const page = s.value<{ total: number; data: SharedFolder[] }>(
      "shareMgmtGetList",
      { start: 25, limit: 25, sortfield: "name", sortdir: "desc" },
    );
    expect(page.total).toBe(140);
    expect(page.data).toHaveLength(25);
    expect(page.data[0]?.name).toBe("folder-115");
    expect(s.value<{ total: number }>("userMgmtGetUserList", ALL).total).toBe(
      1000,
    );
    expect(s.value<{ total: number }>("userMgmtGetGroupList", ALL).total).toBe(
      60,
    );
    expect(s.shares()).toHaveLength(28);
  });

  it("sharesBroken: one folder of each Critical state and an unknown code", () => {
    const s = story("sharesBroken");
    const status = Object.fromEntries(
      s.folders().map((f) => [f.name, f.status]),
    );
    expect(status).toEqual({
      Documents: "OK",
      Archive: "ENOENT",
      Missing: "ENOENT",
      Notes: "ENOTDIR",
      Old: "ENOENT_DB_MNTENT",
      Future: "EFUTURE",
    });
    // The unmounted file system is not a candidate; its folder names it by its device file.
    expect(s.folder("Archive").device).toMatch(/^\/dev\/disk\/by-uuid\//);
    expect(s.folder("Archive").mntent?.devicefile).toBe("");
    expect(s.folder("Old").absdirpath).toBe("");
    expect(
      s.value<{ uuid: string }[]>("shareMgmtGetCandidates").map((c) => c.uuid),
    ).not.toContain("00000000-0000-4000-8000-000000000003");
  });

  it("making a folder: stored with a trailing slash, made on the disk, mode 770, and pending", () => {
    const s = story("sharesNone");
    expect(s.folders()).toEqual([]);
    const made = s.make("Photos");
    expect(made.status).toBe(200);
    expect(made.value).toMatchObject({
      reldirpath: "Photos/",
      mode: "770",
    });
    const row = s.folder("Photos");
    expect(row).toMatchObject({
      status: "OK",
      privileges: "",
      _used: false,
      reldirpath: "Photos/",
    });
    expect(row.uuid).not.toBe(NEW_OBJECT);
    expect(row.absdirpath).toBe(`${row.mntent?.dir ?? ""}/Photos/`);
    expect(s.pending()).toEqual(["sharedfolders", "systemd"]);
    // The same name, or the same folder on the same file system, is refused with OMV's words.
    expect(s.make("Photos", SDD1, "Other").message).toBe(
      "A shared folder with the name 'Photos' already exists.",
    );
    expect(s.make("Pictures", SDD1, "Photos").message).toBe(
      "A shared folder with the path 'Photos/' already exists for the specified file system.",
    );
    // OMV takes a name differing only in case.
    expect(s.make("photos", SDD1, "photos-lower").status).toBe(200);
    expect(
      s.failure("shareMgmtSet", {
        uuid: NEW_OBJECT,
        name: "Up",
        reldirpath: "a/../b",
        comment: "",
        mntentref: SDD1,
      }).status,
    ).toBe(500);
  });

  it("the whole file system is stored as /", () => {
    expect(storedPath("/")).toBe("/");
    expect(storedPath("/a/b")).toBe("a/b/");
    const s = story("sharesNone");
    expect(s.make("Whole", SDA1, "/").value).toMatchObject({
      reldirpath: "/",
    });
    expect(s.folder("Whole").absdirpath).toMatch(/[^/]\/$/);
  });

  it("a change keeps the access list and marks samba and avahi when the folder has a share", () => {
    const s = story("sharesSome");
    const photos = s.folder("Photos");
    const answer = s.value<{ privileges: unknown }>(
      "shareMgmtSet",
      sent(F.ShareMgmtSetRequestSchema, {
        uuid: photos.uuid,
        name: photos.name,
        comment: "Holidays",
        mntentref: photos.mntentref,
        reldirpath: photos.reldirpath,
      }),
    );
    expect(answer.privileges).toEqual(photos.privileges);
    expect(s.folder("Photos").comment).toBe("Holidays");
    expect(s.pending()).toEqual(["avahi", "samba", "sharedfolders", "systemd"]);
  });

  it("access replaces the whole list, [] is stored as the empty string, and unknown accounts are refused", () => {
    const s = story("sharesSome");
    const backups = s.folder("Backups");
    s.value(
      "shareMgmtSetPrivileges",
      sent(F.ShareMgmtSetPrivilegesRequestSchema, {
        uuid: backups.uuid,
        privileges: [{ type: "user", name: "robin", perms: 7 }],
      }),
    );
    expect(s.folder("Backups").privileges).toEqual({
      privilege: [{ type: "user", name: "robin", perms: 7 }],
    });
    // Backups has no share: only sharedfolders and systemd.
    expect(s.pending()).toEqual(["sharedfolders", "systemd"]);
    s.value("shareMgmtSetPrivileges", {
      uuid: backups.uuid,
      privileges: [],
    });
    expect(s.folder("Backups").privileges).toBe("");
    expect(
      s.failure("shareMgmtSetPrivileges", {
        uuid: backups.uuid,
        privileges: [{ type: "user", name: "admin", perms: 7 }],
      }).message,
    ).toBe(CONTRACT_EXAMPLES.shareMgmtSetPrivileges.adminRefused.value.message);
    expect(
      s.failure("shareMgmtSetPrivileges", {
        uuid: backups.uuid,
        privileges: [{ type: "user", name: "nobody-here", perms: 5 }],
      }).message,
    ).toBe(
      CONTRACT_EXAMPLES.shareMgmtSetPrivileges.unknownAccount.value.message,
    );
  });

  it("sharesStale: entries for a deleted account and a 0 entry are read; saving them is refused", () => {
    const s = story("sharesStale");
    const photos = s.folder("Photos");
    expect(photos.privileges).toEqual({
      privilege: expect.arrayContaining([
        { type: "user", name: "alex", perms: 0 },
        { type: "user", name: "old-user", perms: 5 },
        { type: "group", name: "old-team", perms: 7 },
      ]),
    });
    const list =
      typeof photos.privileges === "object"
        ? (photos.privileges.privilege ?? [])
        : [];
    expect(
      s.failure("shareMgmtSetPrivileges", {
        uuid: photos.uuid,
        privileges: list,
      }).message,
    ).toBe("The user 'old-user' does not exist.");
  });

  it("sharing: a new share with the classic defaults, one per folder, sharedfoldername refused", () => {
    const s = story("sharesNone");
    s.make("Photos");
    const photos = s.folder("Photos");
    s.value("smbSetShare", s.newShare(photos.uuid));
    expect(s.pending()).toEqual(["avahi", "samba", "sharedfolders", "systemd"]);
    const [row] = s.shares();
    expect(row).toMatchObject({
      sharedfolderref: photos.uuid,
      sharedfoldername: "Photos",
      guest: "no",
      browseable: true,
      hidedotfiles: true,
      easupport: true,
      followsymlinks: true,
    });
    expect(s.folder("Photos")._used).toBe(true);
    expect(s.failure("smbSetShare", s.newShare(photos.uuid)).message).toBe(
      CONTRACT_EXAMPLES.smbSetShare.secondShare.value.message.replace(
        "00000000-0000-4000-8000-000000000005",
        photos.uuid,
      ),
    );
    expect(
      s.failure("smbSetShare", { ...(row as SmbShareRow), guest: "allow" })
        .status,
    ).toBe(500);
  });

  it("sharesClassicOptions: the row sent back without sharedfoldername keeps every option", () => {
    const s = story("sharesClassicOptions");
    const [row] = s.shares();
    expect(row).toMatchObject({
      guest: "only",
      recyclebin: true,
      timemachine: true,
    });
    s.value(
      "smbSetShare",
      s.rowBack(row as SmbShareRow, { browseable: false }),
    );
    const [after] = s.shares();
    expect(after).toEqual({ ...row, browseable: false });
  });

  it("stopping sharing removes the share and marks samba and avahi", () => {
    const s = story("sharesSome");
    const share = s.shares().find((r) => r.sharedfoldername === "Photos");
    s.value(
      "smbDeleteShare",
      sent(F.SmbDeleteShareRequestSchema, { uuid: share?.uuid }),
    );
    expect(s.shares().map((r) => r.sharedfoldername)).toEqual(["Public"]);
    expect(s.pending()).toEqual(["avahi", "samba"]);
  });

  it("SMB on and off: the whole reply sent back, running once applied", () => {
    const s = story("sharesNone");
    const before = s.settings();
    expect(before.enable).toBe(false);
    expect(s.samba()).toMatchObject({ enabled: false, running: false });
    s.value(
      "smbSetSettings",
      sent(F.SmbSetSettingsRequestSchema, { ...before, enable: true }),
    );
    expect(s.settings()).toEqual({ ...before, enable: true });
    expect(s.pending()).toEqual(["avahi", "samba"]);
    // Saved, not applied: the service is still off.
    expect(s.samba()).toMatchObject({ enabled: false, running: false });
    expect(s.apply()).toBe("appliedFinished");
    expect(s.pending()).toEqual([]);
    expect(s.samba()).toMatchObject({ enabled: true, running: true });
  });

  it("sharesLongHost: the NAS name has 16 characters and SMB cannot be turned on", () => {
    const s = story("sharesLongHost");
    expect(s.value<{ hostname: string }>("systemGetInformation").hostname).toBe(
      "nas-living-room1",
    );
    expect(
      s.failure("smbSetSettings", { ...s.settings(), enable: true }).message,
    ).toBe(CONTRACT_EXAMPLES.smbSetSettings.hostTooLong.value.message);
    expect(s.pending()).toEqual([]);
  });

  it("sharesSmbDown: on, applied, not running", () => {
    expect(story("sharesSmbDown").samba()).toEqual(
      expect.objectContaining({ enabled: true, running: false }),
    );
    expect(story("sharesSome").samba()).toEqual(
      expect.objectContaining({ enabled: true, running: true }),
    );
  });

  it("deleting: refused while a share refers, even one turned off, and while something else uses it", () => {
    const s = story("sharesUsedElsewhere");
    const photos = s.folder("Photos");
    const referenced =
      CONTRACT_EXAMPLES.shareMgmtDelete.referenced.value.message;
    expect(
      s.failure(
        "shareMgmtDelete",
        sent(F.ShareMgmtDeleteRequestSchema, {
          uuid: photos.uuid,
          recursive: false,
        }),
      ).message,
    ).toBe(referenced);
    const share = s.shares().find((r) => r.sharedfolderref === photos.uuid);
    s.value("smbSetShare", s.rowBack(share as SmbShareRow, { enable: false }));
    expect(
      s.failure("shareMgmtDelete", { uuid: photos.uuid, recursive: false })
        .message,
    ).toBe(referenced);
    const backups = s.folder("Backups");
    expect(backups._used).toBe(true);
    expect(
      s.failure("shareMgmtDelete", { uuid: backups.uuid, recursive: true })
        .message,
    ).toBe(referenced);
  });

  it("deleting keeping the files, then undo: the record comes back as it was", () => {
    const s = story("sharesSome");
    const backups = s.folder("Backups");
    s.value("shareMgmtDelete", { uuid: backups.uuid, recursive: false });
    expect(s.folders().map((f) => f.name)).toEqual(["Photos", "Public"]);
    expect(s.pending()).toEqual(["sharedfolders", "systemd", "task"]);
    s.undo();
    expect(s.pending()).toEqual([]);
    expect(s.folder("Backups").status).toBe("OK");
  });

  it("deleting with the files, then undo: the record comes back, its folder does not", () => {
    const s = story("sharesSome");
    const backups = s.folder("Backups");
    s.value("shareMgmtDelete", { uuid: backups.uuid, recursive: true });
    s.undo();
    expect(s.folder("Backups").status).toBe("ENOENT");
  });

  it("an undone new folder loses its record; its empty folder stays and is used again", () => {
    const s = story("sharesNone");
    s.make("Photos");
    s.undo();
    expect(s.folders()).toEqual([]);
    s.make("Photos");
    expect(s.folder("Photos").status).toBe("OK");
  });

  it("sharesWholeFs: deleting with files is refused when another folder is inside, or it is the whole file system", () => {
    const s = story("sharesWholeFs");
    const otherInside =
      CONTRACT_EXAMPLES.shareMgmtDelete.otherInside.value.message;
    expect(s.folder("Archive").reldirpath).toBe("/");
    expect(
      s.failure("shareMgmtDelete", {
        uuid: s.folder("Media").uuid,
        recursive: true,
      }).message,
    ).toBe(otherInside);
    // Inside nothing else: deleting Movies with its files is allowed.
    s.value("shareMgmtDelete", {
      uuid: s.folder("Movies").uuid,
      recursive: true,
    });
    expect(s.folder("Media").status).toBe("OK");
  });

  it("getShareList fails outright when a share names a folder whose record is gone", () => {
    const s = story("sharesSome");
    const backups = s.folder("Backups");
    s.value("smbSetShare", s.newShare(backups.uuid));
    // Removed by hand, outside OMV's checks: the mock's state is edited directly.
    const state = s.session.shares;
    if (state !== undefined) {
      state.config.folders = state.config.folders.filter(
        (f) => f.uuid !== backups.uuid,
      );
    }
    const answer = s.failure("smbGetShareList", ALL);
    expect(answer.status).toBe(500);
    expect(answer.message).toContain(backups.uuid);
  });

  it("the file systems match the folders and the candidates", () => {
    const s = story("sharesSome");
    const fs = s.value<{
      data: { mountpoint: string; devicefile: string; _used: boolean }[];
    }>("fileSystemMgmtGetList", ALL).data;
    for (const f of s.folders()) {
      const row = fs.find((r) => r.mountpoint === f.mntent?.dir);
      expect(row?.devicefile, f.name).toBe(f.mntent?.fsname);
      expect(row?._used).toBe(true);
    }
    expect(
      s
        .value<{ uuid: string; description: string }[]>(
          "shareMgmtGetCandidates",
        )
        .map((c) => c.description),
    ).toEqual(
      CONTRACT_EXAMPLES.shareMgmtGetCandidates.several.value.map(
        (c) => c.description,
      ),
    );
  });

  describe("the add flow failing", () => {
    it("sharesAddFails picks the next failure for each new folder, wrapping", () => {
      expect(
        ADD_FAILURES_IN_TURN.map((_, k) => addFailureOf("sharesAddFails", k)),
      ).toEqual([...ADD_FAILURES_IN_TURN]);
      expect(addFailureOf("sharesAddFails", 8)).toBe("notMade");
      expect(addFailureOf("sharesAddFailsShare", 3)).toBe("share");
      expect(addFailureOf("sharesNone", 0)).toBeNull();
      const s = story("sharesAddFails");
      expect(s.make("One").status).toBe(500);
      expect(s.folders()).toEqual([]);
      // The second new folder: the record is made, its folder is not.
      expect(s.make("Two").status).toBe(500);
      expect(s.folder("Two").status).toBe("ENOENT");
    });

    it("check: the file systems are gone when the run checks again", () => {
      vi.useFakeTimers();
      try {
        const s = story("sharesAddFailsCheck");
        expect(s.value<unknown[]>("shareMgmtGetCandidates").length).toBe(4);
        // The form reads twice (StrictMode): both offer the file systems.
        expect(s.value<unknown[]>("shareMgmtGetCandidates").length).toBe(4);
        vi.advanceTimersByTime(6_000);
        expect(s.value<unknown[]>("shareMgmtGetCandidates")).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("notMade: nothing is recorded, and trying again works", () => {
      const s = story("sharesAddFailsNotMade");
      expect(s.make("Photos").status).toBe(500);
      expect(s.folders()).toEqual([]);
      expect(s.pending()).toEqual([]);
      expect(s.make("Photos").status).toBe(200);
      expect(s.folder("Photos").status).toBe("OK");
    });

    it("noDir: the record is made and pending; the same call with its uuid makes the folder", () => {
      const s = story("sharesAddFailsNoDir");
      const answer = s.make("Photos");
      expect(answer.status).toBe(500);
      expect(answer.message).toMatch(/^Failed to create the directory/);
      const row = s.folder("Photos");
      expect(row.status).toBe("ENOENT");
      expect(s.pending()).toEqual(["sharedfolders", "systemd"]);
      s.value("shareMgmtSet", {
        uuid: row.uuid,
        name: row.name,
        comment: row.comment,
        mntentref: row.mntentref,
        reldirpath: row.reldirpath,
        mode: "770",
      });
      expect(s.folder("Photos").status).toBe("OK");
      // Removing it again keeps nothing on the disk to worry about.
      s.value("shareMgmtDelete", { uuid: row.uuid, recursive: false });
      expect(s.folders()).toEqual([]);
    });

    it.each([
      { scenario: "sharesAddFailsAccess", step: "access" },
      { scenario: "sharesAddFailsSmbOn", step: "smbOn" },
      { scenario: "sharesAddFailsShare", step: "share" },
    ] as const)("$step fails once, then the step works", ({ scenario }) => {
      const s = story(scenario);
      expect(s.make("Photos").status).toBe(200);
      const photos = s.folder("Photos");
      const access = {
        uuid: photos.uuid,
        privileges: [{ type: "user", name: "alex", perms: 7 }],
      };
      const smbOn = { ...s.settings(), enable: true };
      const shareIt = s.newShare(photos.uuid);
      const calls = [
        ["shareMgmtSetPrivileges", access],
        ["smbSetSettings", smbOn],
        ["smbSetShare", shareIt],
      ] as const;
      const index = {
        sharesAddFailsAccess: 0,
        sharesAddFailsSmbOn: 1,
        sharesAddFailsShare: 2,
      }[scenario];
      const call = calls[index];
      if (call === undefined) {
        throw new Error(`No call for ${scenario}`);
      }
      const [op, params] = call;
      expect(s.failure(op, params).status).toBe(500);
      expect(s.ask(op, params)).toMatchObject({ status: 200 });
    });

    it("apply: the apply fails once and keeps everything pending, then succeeds", () => {
      const s = story("sharesAddFailsApply");
      s.make("Photos");
      expect(s.apply()).toBe("applyFailed");
      expect(s.pending()).toEqual(["sharedfolders", "systemd"]);
      expect(s.apply()).toBe("appliedFinished");
      expect(s.pending()).toEqual([]);
    });

    it("verify: applied, but SMB does not start", () => {
      const s = story("sharesAddFailsVerify");
      s.make("Photos");
      s.value("smbSetSettings", { ...s.settings(), enable: true });
      s.value("smbSetShare", s.newShare(s.folder("Photos").uuid));
      expect(s.apply()).toBe("appliedFinished");
      expect(s.samba()).toMatchObject({ enabled: true, running: false });
      expect(s.folder("Photos").status).toBe("OK");
    });

    it("cut: the request is cut after the folder was made", () => {
      const s = story("sharesAddFailsCut");
      expect(s.make("Photos")).toMatchObject({ status: 504 });
      expect(s.folder("Photos").status).toBe("OK");
      expect(s.pending()).toEqual(["sharedfolders", "systemd"]);
    });
  });

  it("sharesDeleteSlow: Big is deleted; deleting Huge is cut but done on the server", () => {
    const s = story("sharesDeleteSlow");
    s.value("shareMgmtDelete", { uuid: SLOW_DELETE.big, recursive: true });
    expect(
      s.ask("shareMgmtDelete", { uuid: SLOW_DELETE.huge, recursive: true }),
    ).toMatchObject({ status: 504 });
    expect(s.folders().map((f) => f.name)).toEqual(["Documents"]);
    expect(s.pending()).toEqual(["sharedfolders", "systemd", "task"]);
  });

  it("sharesHostile: the names and descriptions come back as stored", () => {
    const s = story("sharesHostile");
    const names = s.folders().map((f) => f.name);
    expect(names).toContain("<b>x</b>");
    expect(names.some((n) => n.length === 200)).toBe(true);
    expect(names.some((n) => n.includes("‮"))).toBe(true);
    expect(s.folders().some((f) => f.comment.length === 200)).toBe(true);
  });
});
