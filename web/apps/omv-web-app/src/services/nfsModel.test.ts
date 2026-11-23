// SPDX-License-Identifier: GPL-3.0-or-later
// The NFS model (phase 5 services design 0.3, 0.5, 0.10, 0.11, 1, 2, 12.1) on the contract's captured
// examples, and every write body checked against the contract's request schema.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import {
  NfsSetSettingsRequestSchema,
  NfsSetShareRequestSchema,
} from "@omv-webui/react-api-omv/forms";
import type {
  NfsShare,
  NfsShareRow,
  ServiceStatus,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  changedShareRequest,
  DEFAULT_EXTRA_OPTIONS,
  entriesByFolder,
  entriesOf,
  entryAccess,
  entryClient,
  entryRefusal,
  folderRefusal,
  givesRoot,
  hasVersions,
  NEW_OBJECT_UUID,
  newShareRequest,
  nfsAddresses,
  nfsSharingCell,
  nfsState,
  offersV4,
  otherOptionsDiffer,
  settingsRequest,
  sharedFolderNames,
  versionsText,
} from "./nfsModel.ts";

const ROWS = structuredClone(
  CONTRACT_EXAMPLES.nfsGetShareList.several.value.data,
) as unknown as NfsShareRow[];
const ONE = CONTRACT_EXAMPLES.nfsGetShare.one.value as NfsShare;
const MEDIA = "00000000-0000-4000-8000-000000000002";
const BACKUP = "00000000-0000-4000-8000-000000000006";

function validates(
  schema: typeof NfsSetShareRequestSchema | typeof NfsSetSettingsRequestSchema,
  value: unknown,
) {
  const result = schema["~standard"].validate(value);
  return result instanceof Promise ? ["async"] : (result.issues ?? []);
}

const services = (nfs: Partial<ServiceStatus> | null): ServiceStatus[] => [
  { name: "ssh", title: "SSH", enabled: true, running: true },
  ...(nfs === null
    ? []
    : [{ name: "nfs", title: "NFS", enabled: true, running: true, ...nfs }]),
];
const read = <T>(data: T | undefined, failed = false) => ({
  data,
  failed,
  error: failed ? new Error("x") : undefined,
});

const folder = (over: Partial<SharedFolder> = {}): SharedFolder => ({
  uuid: MEDIA,
  name: "Media",
  comment: "",
  mntentref: "00000000-0000-4000-8000-000000000009",
  reldirpath: "Media/",
  _used: true,
  device: "/dev/sdb1",
  description: "Media [on /dev/sdb1, Media/]",
  status: "OK",
  ...over,
});

describe("Linux and Unix sharing's state (0.3)", () => {
  it.each([
    ["off", { enable: false }, services({ running: false }), [], "off"],
    ["on and running", { enable: true }, services({}), [], "on"],
    [
      "on, not running",
      { enable: true },
      services({ running: false }),
      [],
      "down",
    ],
    [
      "on, not running, pending",
      { enable: true },
      services({ running: false }),
      ["nfs"],
      "pendingOn",
    ],
    ["on, no NFS row", { enable: true }, services(null), [], "unread"],
  ])("%s", (_name, settings, rows, pending, kind) => {
    expect(nfsState(read(settings), read(rows), pending).kind).toBe(kind);
  });

  it("is Unknown when a read failed, and loading while one is on its way", () => {
    expect(nfsState(read(undefined, true), read([]), []).kind).toBe("unread");
    expect(
      nfsState(read({ enable: true }), read(undefined, true), []).kind,
    ).toBe("unread");
    expect(nfsState(read(undefined), read([]), []).kind).toBe("loading");
    expect(nfsState(read({ enable: true }), read(undefined), []).kind).toBe(
      "loading",
    );
    // Off needs no status read.
    expect(nfsState(read({ enable: false }), read(undefined), []).kind).toBe(
      "off",
    );
  });
});

describe("versions (1.2)", () => {
  it("says the versions offered, and whether NFSv4 is among them", () => {
    const versions = [...CONTRACT_EXAMPLES.nfsGetSettings.on.value.versions];
    expect(versionsText(versions)).toBe("NFSv3, NFSv4, NFSv4.1, NFSv4.2");
    expect(hasVersions({ versions })).toBe(true);
    expect(hasVersions({ versions: [] })).toBe(false);
    expect(offersV4(versions)).toBe(true);
    expect(offersV4(["3"])).toBe(false);
    expect(offersV4(["4.2"])).toBe(true);
  });

  it("turns it on or off with the versions as read (0.11)", () => {
    const settings = { enable: false, versions: ["3", "4.1"] };
    const on = settingsRequest(settings, true);
    expect(on).toEqual({ enable: true, versions: ["3", "4.1"] });
    expect(validates(NfsSetSettingsRequestSchema, on)).toEqual([]);
    expect(settingsRequest(settings, false).enable).toBe(false);
  });
});

describe("a folder's entries (0.3, 2.2)", () => {
  it("finds every entry of a folder, in OMV's order", () => {
    expect(entriesOf(ROWS, MEDIA).map((r) => r.client)).toEqual([
      "192.0.2.10",
      "192.0.2.0/24",
    ]);
    expect(entriesOf(ROWS, BACKUP).map((r) => r.client)).toEqual(["*"]);
    expect(entriesOf(ROWS, "nothing")).toEqual([]);
  });

  it("groups the entries by folder in the order each folder first appears", () => {
    const shuffled = [ROWS[0], ROWS[2], ROWS[1]] as NfsShareRow[];
    expect(
      entriesByFolder(shuffled).map((g) => [
        g.folderUuid,
        g.entries.map((e) => e.uuid),
      ]),
    ).toEqual([
      [MEDIA, [ROWS[0]?.uuid, ROWS[1]?.uuid]],
      [BACKUP, [ROWS[2]?.uuid]],
    ]);
  });

  it("reads who each entry lets in and its access", () => {
    expect(ROWS.map((r) => entryClient(r).kind)).toEqual([
      "one",
      "network",
      "any",
    ]);
    expect(entryClient({ client: "" }).kind).toBe("any");
    expect(entryClient({ client: "*.example.org" })).toEqual({
      kind: "classic",
      value: "*.example.org",
    });
    expect(entryAccess({ options: "ro" })).toEqual({ kind: "ro" });
    expect(entryAccess({ options: "rw" })).toEqual({ kind: "rw" });
    expect(entryAccess({ options: "rw,sync" })).toEqual({
      kind: "classic",
      value: "rw,sync",
    });
  });
});

describe("other NFS options (0.5)", () => {
  it.each([
    [DEFAULT_EXTRA_OPTIONS, false, false],
    ["insecure,subtree_check", false, false],
    [" subtree_check , insecure ", false, false],
    ["", false, false],
    [undefined, false, false],
    ["subtree_check", true, false],
    ["no_subtree_check,insecure", true, false],
    ["subtree_check,insecure,no_root_squash", true, true],
    ["no_root_squash", true, true],
    ["subtree_check,insecure,all_squash,anonuid=1000", true, false],
    ["subtree_check,insecure,root_squash", true, false],
  ])("%j: differs %s, root %s", (extraoptions, differs, root) => {
    expect(otherOptionsDiffer({ extraoptions })).toBe(differs);
    expect(givesRoot({ extraoptions })).toBe(root);
  });
});

describe("the NFS address (0.2)", () => {
  it("builds the export path, and the NFSv4 path when NFSv4 is offered", () => {
    expect(nfsAddresses("NAS_HOST", "Photos", ["3", "4", "4.1"])).toEqual([
      { kind: "export", text: "NAS_HOST:/export/Photos" },
      { kind: "v4", text: "NAS_HOST:/Photos" },
    ]);
    expect(nfsAddresses("NAS_HOST", "Photos", ["3"])).toEqual([
      { kind: "export", text: "NAS_HOST:/export/Photos" },
    ]);
    expect(nfsAddresses("nas.example.org", "Fotos", [])).toEqual([
      { kind: "export", text: "nas.example.org:/export/Fotos" },
    ]);
  });
});

describe("the interface's own refusals (0.10)", () => {
  it.each([
    [folder(), true, null],
    [folder({ name: "Holiday Photos" }), true, "nameSpace"],
    [folder({ reldirpath: "Holiday Photos/" }), true, "pathSpace"],
    [folder({ name: "Tab\there" }), true, "nameSpace"],
    [folder(), false, "notOk"],
    [folder({ name: "Фото", reldirpath: "Фото/" }), true, null],
  ])("%#", (f, ok, refusal) => {
    expect(folderRefusal(f, ok)).toBe(refusal);
  });

  const settings = { enable: true, versions: ["3", "4"] };
  const base = {
    folderUuid: MEDIA,
    folders: [folder()],
    shares: ROWS,
    settings,
  };

  it("gives the client to send when nothing refuses", () => {
    expect(
      entryRefusal({ ...base, value: { choice: "one", text: "192.0.2.11" } }),
    ).toEqual({ client: "192.0.2.11" });
    expect(
      entryRefusal({ ...base, value: { choice: "any", text: "" } }),
    ).toEqual({ client: "*" });
  });

  it.each([
    ["the same address", "one", "192.0.2.10"],
    ["the same address with spaces", "one", " 192.0.2.10 "],
    ["the same network", "network", "192.0.2.0/24"],
  ] as const)("refuses %s let in already", (_what, choice, text) => {
    expect(entryRefusal({ ...base, value: { choice, text } })).toMatchObject({
      refusal: { kind: "duplicate" },
    });
  });

  it("does not count the entry being changed", () => {
    expect(
      entryRefusal({
        ...base,
        value: { choice: "one", text: "192.0.2.10" },
        exceptUuid: ROWS[0]?.uuid,
      }),
    ).toEqual({ client: "192.0.2.10" });
  });

  it("refuses a folder with a space, a folder that is not OK, and one that is gone", () => {
    const value = { choice: "one", text: "192.0.2.50" } as const;
    expect(
      entryRefusal({
        ...base,
        folders: [folder({ reldirpath: "My Media/" })],
        value,
      }),
    ).toEqual({ refusal: { kind: "folder", refusal: "pathSpace" } });
    expect(
      entryRefusal({
        ...base,
        folders: [folder({ status: "Missing" })],
        value,
      }),
    ).toEqual({ refusal: { kind: "folder", refusal: "notOk" } });
    expect(entryRefusal({ ...base, ok: false, value })).toEqual({
      refusal: { kind: "folder", refusal: "notOk" },
    });
    expect(entryRefusal({ ...base, folders: [], value })).toEqual({
      refusal: { kind: "gone" },
    });
  });

  it("refuses a client that fails 0.4, and no choice for a classic value", () => {
    expect(
      entryRefusal({
        ...base,
        value: { choice: "network", text: "10.1.2.3/8" },
      }),
    ).toEqual({
      refusal: {
        kind: "client",
        problem: {
          kind: "start",
          value: "10.1.2.3/8",
          suggestion: "10.0.0.0/8",
        },
      },
    });
    expect(
      entryRefusal({ ...base, value: { choice: null, text: "" } }),
    ).toEqual({ refusal: { kind: "client", problem: { kind: "choose" } } });
  });

  it("refuses turning NFS on with no version chosen, but not while it is on", () => {
    const value = { choice: "one", text: "192.0.2.50" } as const;
    expect(
      entryRefusal({
        ...base,
        settings: { enable: false, versions: [] },
        value,
      }),
    ).toEqual({ refusal: { kind: "noVersions" } });
    expect(
      entryRefusal({
        ...base,
        settings: { enable: true, versions: [] },
        value,
      }),
    ).toEqual({ client: "192.0.2.50" });
  });
});

describe("writing back (0.11)", () => {
  it("makes a new entry with the new-object marker and the classic options", () => {
    const request = newShareRequest(MEDIA, "192.0.2.0/24", "ro");
    expect(request).toEqual({
      uuid: NEW_OBJECT_UUID,
      sharedfolderref: MEDIA,
      mntentref: NEW_OBJECT_UUID,
      client: "192.0.2.0/24",
      options: "ro",
      extraoptions: "subtree_check,insecure",
      comment: "",
    });
    expect(validates(NfsSetShareRequestSchema, request)).toEqual([]);
  });

  it("changes an entry as read, with only who may connect and access changed", () => {
    const request = changedShareRequest(
      {
        ...ONE,
        extraoptions: "subtree_check,insecure,no_root_squash",
        comment: "Kept",
      },
      { client: "192.0.2.20", options: "ro" },
    );
    expect(request).toEqual({
      uuid: ONE.uuid,
      sharedfolderref: ONE.sharedfolderref,
      mntentref: ONE.mntentref,
      client: "192.0.2.20",
      options: "ro",
      extraoptions: "subtree_check,insecure,no_root_squash",
      comment: "Kept",
    });
    expect(validates(NfsSetShareRequestSchema, request)).toEqual([]);
  });

  it("sends a list row back without its computed folder name", () => {
    const row = ROWS[0] as NfsShareRow;
    const request = changedShareRequest(row, { options: "ro" });
    expect(request).not.toHaveProperty("sharedfoldername");
    expect(request.client).toBe(row.client);
    expect(validates(NfsSetShareRequestSchema, request)).toEqual([]);
  });
});

describe("the Shared folders list (12.1)", () => {
  it("says Linux and Unix for a folder with an entry, and Not known when the read failed", () => {
    expect(nfsSharingCell(MEDIA, read(ROWS))).toBe("nfs");
    expect(nfsSharingCell("other", read(ROWS))).toBe("none");
    expect(nfsSharingCell(MEDIA, read(undefined))).toBe("none");
    expect(nfsSharingCell(MEDIA, read(undefined, true))).toBe("unknown");
  });
});

describe("the turn-off confirmation (1.3)", () => {
  it("names each folder once, at most five, and counts the rest", () => {
    expect(sharedFolderNames(ROWS)).toEqual({
      names: ["Media", "Backup"],
      more: 0,
      count: 2,
    });
    const many = Array.from({ length: 7 }, (_, i) => ({
      ...ROWS[0],
      uuid: `u${String(i)}`,
      sharedfolderref: `f${String(i)}`,
      sharedfoldername: `Folder ${String(i)}`,
    })) as NfsShareRow[];
    expect(sharedFolderNames(many)).toMatchObject({ more: 2, count: 7 });
    expect(sharedFolderNames(many).names).toHaveLength(5);
  });
});
