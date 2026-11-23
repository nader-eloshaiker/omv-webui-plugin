// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  RsyncdModule,
  RsyncdModuleRow,
  ServiceStatus,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  changedModuleRequest,
  changeRefusal,
  defaultModuleName,
  moduleChoicesOf,
  moduleMay,
  moduleProblems,
  moduleSignIn,
  moduleWho,
  nameTaken,
  NEW_OBJECT_UUID,
  newModuleChoices,
  newModuleRequest,
  offerableFolders,
  offerRefusal,
  readOnlyModule,
  rsyncAddress,
  rsyncdSettingsRequest,
  rsyncdState,
  withAsk,
  type ModuleChoices,
} from "./rsyncdModel.ts";

const FOLDER = "00000000-0000-4000-8000-000000000201";
const OTHER = "00000000-0000-4000-8000-000000000202";
const MODULE = "00000000-0000-4000-8000-000000000301";

const module = (over: Partial<RsyncdModule> = {}): RsyncdModule => ({
  uuid: MODULE,
  enable: true,
  sharedfolderref: FOLDER,
  name: "Photos",
  comment: "",
  uid: "nobody",
  gid: "users",
  readonly: true,
  writeonly: false,
  maxconnections: 0,
  list: true,
  hostsallow: "",
  hostsdeny: "",
  authusers: true,
  usechroot: true,
  users: [{ name: "backup", password: true }],
  extraoptions: "",
  ...over,
});

const row = (over: Partial<RsyncdModuleRow> = {}): RsyncdModuleRow => ({
  ...module(),
  sharedfoldername: "Photos",
  ...over,
});

const folder = (over: Partial<SharedFolder> = {}): SharedFolder =>
  ({
    uuid: FOLDER,
    name: "Photos",
    status: "OK",
    ...over,
  }) as SharedFolder;

const service = (running: boolean): ServiceStatus =>
  ({
    name: "rsyncd",
    title: "RSync server",
    enabled: true,
    running,
  }) as ServiceStatus;

describe("rsyncdState (0.3)", () => {
  const on = { data: { enable: true }, failed: false };
  it.each([
    {
      why: "a failed settings read is Unknown",
      settings: { data: undefined, failed: true, error: "x" },
      services: { data: [], failed: false },
      pending: [],
      kind: "unread",
    },
    {
      why: "a failed status read is Unknown",
      settings: on,
      services: { data: undefined, failed: true },
      pending: [],
      kind: "unread",
    },
    {
      why: "off",
      settings: { data: { enable: false }, failed: false },
      services: { data: undefined, failed: false },
      pending: [],
      kind: "off",
    },
    {
      why: "on and running",
      settings: on,
      services: { data: [service(true)], failed: false },
      pending: [],
      kind: "on",
    },
    {
      why: "on, not running, not pending: down",
      settings: on,
      services: { data: [service(false)], failed: false },
      pending: ["samba"],
      kind: "down",
    },
    {
      why: "on, not running, rsyncd pending",
      settings: on,
      services: { data: [service(false)], failed: false },
      pending: ["rsyncd", "avahi"],
      kind: "pendingOn",
    },
    {
      why: "no rsyncd row is Unknown",
      settings: on,
      services: { data: [], failed: false },
      pending: [],
      kind: "unread",
    },
    {
      why: "still loading",
      settings: { data: undefined, failed: false },
      services: { data: undefined, failed: false },
      pending: [],
      kind: "loading",
    },
  ])("$why", ({ settings, services, pending, kind }) => {
    expect(rsyncdState(settings, services, pending).kind).toBe(kind);
  });
});

describe("the writes (0.11)", () => {
  it("setSettings keeps the port and options, changing only enable", () => {
    expect(
      rsyncdSettingsRequest(
        { enable: false, port: 8873, extraoptions: "x" },
        true,
      ),
    ).toEqual({ enable: true, port: 8873, extraoptions: "x" });
    expect(rsyncdSettingsRequest({ enable: true, port: 873 }, false)).toEqual({
      enable: false,
      port: 873,
      extraoptions: "",
    });
  });

  it("a new module gets the classic defaults, the typed password and empty who-may-connect", () => {
    const choices: ModuleChoices = {
      ...newModuleChoices(folder()),
      signInName: "backup",
    };
    expect(newModuleRequest(choices, "secret")).toEqual({
      uuid: NEW_OBJECT_UUID,
      enable: true,
      sharedfolderref: FOLDER,
      name: "Photos",
      comment: "",
      uid: "nobody",
      gid: "users",
      readonly: true,
      writeonly: false,
      maxconnections: 0,
      list: true,
      hostsallow: "",
      hostsdeny: "",
      authusers: true,
      usechroot: true,
      users: [{ name: "backup", password: "secret" }],
      extraoptions: "",
    });
  });

  it("a module without a sign-in sends no users and one network", () => {
    const choices: ModuleChoices = {
      ...newModuleChoices(folder()),
      may: "rw",
      ask: false,
      who: { choice: "network", text: "192.0.2.0/24" },
    };
    const request = newModuleRequest(choices, "");
    expect(request.users).toEqual([]);
    expect(request.authusers).toBe(false);
    expect(request.readonly).toBe(false);
    expect(request.hostsallow).toBe("192.0.2.0/24");
  });

  it("a change keeps what it does not ask, and sends the password typed again", () => {
    const stored = module({
      uid: "media",
      gid: "media",
      maxconnections: 4,
      list: false,
      hostsdeny: "198.51.100.0/24",
      extraoptions: "timeout = 60",
      comment: "note",
    });
    const choices = {
      ...moduleChoicesOf(stored),
      may: "rw" as const,
      who: { choice: "one" as const, text: "192.0.2.10" },
    };
    const request = changedModuleRequest(stored, choices, "again");
    expect(request).toMatchObject({
      uuid: MODULE,
      name: "Photos",
      uid: "media",
      gid: "media",
      maxconnections: 4,
      list: false,
      hostsdeny: "198.51.100.0/24",
      extraoptions: "timeout = 60",
      comment: "note",
      readonly: false,
      writeonly: false,
      hostsallow: "192.0.2.10",
      users: [{ name: "backup", password: "again" }],
    });
    // Nothing from the reply's presence flag is sent back.
    expect(JSON.stringify(request)).not.toContain("true}");
  });

  it("a stored write-only is kept while its choice is", () => {
    const stored = module({ readonly: true, writeonly: true });
    const request = changedModuleRequest(stored, moduleChoicesOf(stored), "pw");
    expect(request).toMatchObject({ readonly: true, writeonly: true });
  });
});

describe("a module's words (0.3, 9.2)", () => {
  it.each([
    [{ readonly: true, writeonly: false }, "ro"],
    [{ readonly: false, writeonly: false }, "rw"],
    [{ readonly: false, writeonly: true }, "wo"],
  ] as const)("%o may %s", (access, may) => {
    expect(moduleMay(access)).toBe(may);
  });

  it.each([
    [{ authusers: false, users: [] }, { kind: "none" }],
    [
      { authusers: true, users: [{ name: "a", password: true }] },
      { kind: "one", name: "a", passwordSet: true },
    ],
    [
      { authusers: true, users: [{ name: "a", password: false }] },
      { kind: "one", name: "a", passwordSet: false },
    ],
    [
      {
        authusers: true,
        users: [{ name: "a" }, { name: "b" }, { name: "c" }],
      },
      { kind: "many", count: 3 },
    ],
  ])("sign-in of %o", (input, expected) => {
    expect(moduleSignIn(input)).toEqual(expected);
  });

  it.each([
    [{ authusers: true, hostsallow: "" }, "anyWithPassword"],
    [{ authusers: false, hostsallow: "" }, "any"],
    [{ authusers: true, hostsallow: "192.0.2.10" }, "one"],
    [{ authusers: true, hostsallow: "192.0.2.0/24" }, "network"],
    [{ authusers: true, hostsallow: "*.example.org" }, "classic"],
  ])("who of %o is %s", (input, kind) => {
    expect(moduleWho(input).kind).toBe(kind);
  });

  it("builds the address, naming the port only when it is not 873", () => {
    expect(rsyncAddress("nas", "Photos")).toBe("rsync://nas/Photos/");
    expect(rsyncAddress("nas", "Photos", 873)).toBe("rsync://nas/Photos/");
    expect(rsyncAddress("nas", "Photos", 8873)).toBe(
      "rsync://nas:8873/Photos/",
    );
  });
});

describe("the dialog's rules (0.10, 10.2)", () => {
  it.each([
    ["Photos", "Photos"],
    ["Photos-2024_a.b", "Photos-2024_a.b"],
    ["My Photos", ""],
    ["_hidden", ""],
    ["Фото", ""],
    ["a".repeat(64), "a".repeat(64)],
    ["a".repeat(65), ""],
  ])("D8: %s is offered as %s", (name, offered) => {
    expect(defaultModuleName(name)).toBe(offered);
  });

  it("a taken name ignores case, but not the module being changed", () => {
    const modules = [row({ uuid: MODULE, name: "Photos" })];
    expect(nameTaken("photos", modules)).toBe(true);
    expect(nameTaken("PHOTOS", modules)).toBe(true);
    expect(nameTaken("Photos2", modules)).toBe(false);
    expect(nameTaken("photos", modules, MODULE)).toBe(false);
  });

  const base: ModuleChoices = {
    folder: FOLDER,
    name: "Photos",
    may: "ro",
    ask: true,
    signInName: "backup",
    who: { choice: "anyWithPassword", text: "" },
  };
  it.each([
    { why: "valid", change: {}, problems: [] },
    {
      why: "no folder",
      change: { folder: "" },
      problems: [{ field: "folder", kind: "required" }],
    },
    {
      why: "a name with a space",
      change: { name: "My Photos" },
      problems: [{ field: "name", kind: "pattern" }],
    },
    {
      why: "an empty name",
      change: { name: "" },
      problems: [{ field: "name", kind: "pattern" }],
    },
    {
      why: "a taken name, any case",
      change: { name: "MEDIA" },
      problems: [{ field: "name", kind: "taken", name: "MEDIA" }],
    },
    {
      why: "a sign-in name with a colon",
      change: { signInName: "a:b" },
      problems: [{ field: "signInName", kind: "pattern" }],
    },
    {
      why: "no sign-in name",
      change: { signInName: "" },
      problems: [{ field: "signInName", kind: "pattern" }],
    },
    {
      why: "a sign-in name is not checked without a sign-in",
      change: {
        ask: false,
        signInName: "",
        who: { choice: "one" as const, text: "192.0.2.10" },
      },
      problems: [],
    },
    {
      why: "without a sign-in, any computer with the password is refused",
      change: { ask: false },
      problems: [{ field: "who", kind: "required" }],
    },
    {
      why: "without a sign-in, nothing chosen is refused",
      change: { ask: false, who: { choice: null, text: "" } },
      problems: [{ field: "who", kind: "required" }],
    },
    {
      why: "a network not at its start",
      change: { who: { choice: "network" as const, text: "192.0.2.5/24" } },
      problems: [
        {
          field: "who",
          kind: "client",
          problem: {
            kind: "start",
            value: "192.0.2.5/24",
            suggestion: "192.0.2.0/24",
          },
        },
      ],
    },
    {
      why: "a classic value not replaced",
      change: { who: { choice: null, text: "" } },
      problems: [{ field: "who", kind: "client", problem: { kind: "choose" } }],
    },
  ])("$why", ({ change, problems }) => {
    const modules = [row({ uuid: "other", name: "Media" })];
    expect(moduleProblems({ ...base, ...change }, modules)).toEqual(problems);
  });

  it("unticking the sign-in moves off the choice it offered", () => {
    expect(withAsk(base, false).who).toEqual({ choice: "one", text: "" });
    expect(withAsk(base, false).ask).toBe(false);
    expect(withAsk({ ...base, ask: false }, true).ask).toBe(true);
    const network = { ...base, who: { choice: "network" as const, text: "x" } };
    expect(withAsk(network, false).who).toBe(network.who);
  });

  it("a new module's defaults: read only, a sign-in, any computer with it", () => {
    expect(newModuleChoices(folder({ name: "My Photos" }))).toEqual({
      folder: FOLDER,
      name: "",
      may: "ro",
      ask: true,
      signInName: "",
      who: { choice: "anyWithPassword", text: "" },
    });
  });

  it("an existing module opens as stored; '*' and classic values open with no choice", () => {
    expect(moduleChoicesOf(module({ hostsallow: "192.0.2.10" })).who).toEqual({
      choice: "one",
      text: "192.0.2.10",
    });
    expect(moduleChoicesOf(module({ hostsallow: "*" })).who.choice).toBeNull();
    expect(
      moduleChoicesOf(module({ hostsallow: "a.example.org b.example.org" })).who
        .choice,
    ).toBeNull();
    expect(
      moduleChoicesOf(module({ authusers: false, hostsallow: "" })).who.choice,
    ).toBeNull();
  });

  it("offers only folders that are OK and not offered", () => {
    const folders = [
      folder(),
      folder({ uuid: OTHER, name: "Media" }),
      folder({
        uuid: "x",
        name: "Gone",
        status: "ENOENT",
      } as Partial<SharedFolder>),
    ];
    expect(offerableFolders(folders, [row()]).map((f) => f.name)).toEqual([
      "Media",
    ]);
  });

  it("refuses offering a folder that is not OK or offered already", () => {
    expect(offerRefusal(OTHER, [folder({ uuid: OTHER })], [row()])).toBeNull();
    expect(offerRefusal(FOLDER, [folder()], [row()])).toEqual({
      kind: "offered",
      name: "Photos",
    });
    expect(
      offerRefusal(
        FOLDER,
        [folder({ status: "ENOENT" } as Partial<SharedFolder>)],
        [],
      ),
    ).toEqual({ kind: "folderNotOk" });
    expect(offerRefusal(FOLDER, [], [])).toEqual({ kind: "folderNotOk" });
  });

  it("refuses a change when the module changed, went, or cannot be saved here", () => {
    const before = module();
    expect(changeRefusal(before, module())).toBeNull();
    expect(changeRefusal(before, undefined)).toEqual({ kind: "gone" });
    expect(changeRefusal(before, module({ readonly: false }))).toEqual({
      kind: "changed",
    });
    const many = module({
      users: [{ name: "a" }, { name: "b" }],
    });
    expect(changeRefusal(many, many)).toEqual({
      kind: "manySignIns",
      count: 2,
    });
  });

  it.each([
    [module(), null],
    [
      module({ users: [{ name: "a" }, { name: "b" }, { name: "c" }] }),
      { kind: "manySignIns", count: 3 },
    ],
    [module({ name: "My Photos" }), { kind: "classicValues" }],
    [module({ uid: "bad user" }), { kind: "classicValues" }],
    [module({ comment: "two\nlines" }), { kind: "classicValues" }],
    [module({ users: [{ name: "a:b" }] }), { kind: "classicValues" }],
  ])("read-only: %#", (input, reason) => {
    expect(readOnlyModule(input)).toEqual(reason);
  });
});
