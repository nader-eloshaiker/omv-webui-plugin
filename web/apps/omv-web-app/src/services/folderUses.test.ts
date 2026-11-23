// SPDX-License-Identifier: GPL-3.0-or-later
// What uses a shared folder among this slice's settings (phase 5 services design 2.7): the uses found,
// Used by's verdict, and the delete's blockers, for each kind, failing closed on a failed read.
import type {
  NfsShareRow,
  RsyncdModuleRow,
  RsyncJobRow,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import { folderUse } from "../sharedFolders/folderPage.ts";
import { deleteBlockers } from "../sharedFolders/shareActions.ts";
import { serviceUses, type ServiceReads } from "./folderUses.ts";

const FOLDER = "00000000-0000-4000-8000-000000000201";
const OTHER = "00000000-0000-4000-8000-000000000202";

const nfs = (folder: string) =>
  ({ uuid: "n1", sharedfolderref: folder, client: "*" }) as NfsShareRow;
const module = (folder: string) =>
  ({
    uuid: "m1",
    sharedfolderref: folder,
    name: "photos",
    users: [],
    authusers: false,
    readonly: true,
    writeonly: false,
    enable: true,
    sharedfoldername: "Photos",
  }) as RsyncdModuleRow;
const job = (uuid: string, src: string, dest: string, comment = "") =>
  ({
    uuid,
    comment,
    src: { sharedfolderref: src, uri: "" },
    dest: { sharedfolderref: dest, uri: "" },
    srcname: "Photos",
    destname: "Backup",
  }) as RsyncJobRow;

const ok = <T>(data: T[]) => ({ data, failed: false });
const none: ServiceReads = { nfs: ok([]), modules: ok([]), jobs: ok([]) };

describe("serviceUses", () => {
  it("finds the module and the jobs from and into the folder, and its NFS entries", () => {
    const uses = serviceUses(FOLDER, {
      nfs: ok([nfs(FOLDER), nfs(OTHER)]),
      modules: ok([module(FOLDER), module(OTHER)]),
      jobs: ok([
        job("j1", FOLDER, OTHER),
        job("j2", OTHER, FOLDER),
        job("j3", OTHER, OTHER),
      ]),
    });
    expect(uses.kind).toBe("read");
    if (uses.kind !== "read") {
      return;
    }
    expect(uses.nfs).toHaveLength(1);
    expect(
      uses.uses.map((u) =>
        u.kind === "job" ? `${u.job.uuid}:${String(u.into)}` : u.kind,
      ),
    ).toEqual(["rsyncModule", "j1:false", "j2:true"]);
  });

  it.each(["nfs", "modules", "jobs"] as const)(
    "a failed %s read fails the whole",
    (which) => {
      const reads = {
        ...none,
        [which]: { data: undefined, failed: true, error: "x" },
      };
      expect(serviceUses(FOLDER, reads)).toEqual({
        kind: "unread",
        error: "x",
      });
    },
  );

  it("waits for every read", () => {
    expect(
      serviceUses(FOLDER, {
        ...none,
        jobs: { data: undefined, failed: false },
      }),
    ).toEqual({ kind: "loading" });
  });
});

describe("Used by (2.7)", () => {
  const base = {
    used: true,
    hasShare: false,
    shares: { ready: true, failed: false },
  };
  it("names the module and the jobs, with the home folders", () => {
    const services = serviceUses(FOLDER, {
      ...none,
      modules: ok([module(FOLDER)]),
    });
    expect(folderUse({ ...base, services })).toMatchObject({
      kind: "named",
      home: false,
    });
    expect(folderUse({ ...base, homeFolders: true, services })).toMatchObject({
      kind: "named",
      home: true,
    });
  });

  it("an NFS entry alone is not repeated: its section shows it", () => {
    const services = serviceUses(FOLDER, { ...none, nfs: ok([nfs(FOLDER)]) });
    expect(folderUse({ ...base, services })).toBeNull();
  });

  it("`_used` with nothing found is an add-on", () => {
    expect(folderUse({ ...base, services: serviceUses(FOLDER, none) })).toEqual(
      { kind: "other" },
    );
  });

  it("a failed read is the retry form, and a read on its way shows nothing yet", () => {
    expect(
      folderUse({
        ...base,
        services: serviceUses(FOLDER, {
          ...none,
          jobs: { data: undefined, failed: true, error: "e" },
        }),
      }),
    ).toEqual({ kind: "unread", error: "e" });
    expect(folderUse({ ...base, services: { kind: "loading" } })).toBeNull();
  });
});

describe("the delete's blockers (2.7)", () => {
  const folder = {
    uuid: FOLDER,
    name: "Photos",
    status: "OK",
    _used: true,
    mntentref: "e1",
    reldirpath: "Photos/",
  } as SharedFolder;
  const input = (services: ServiceReads) => ({
    folder,
    folders: ok([folder]),
    shares: ok([]),
    fileSystems: { data: undefined, failed: false },
    services,
  });

  it("refuses for each kind, naming each job, and not as an add-on", () => {
    const { keep } = deleteBlockers(
      input({
        nfs: ok([nfs(FOLDER)]),
        modules: ok([module(FOLDER)]),
        jobs: ok([job("j1", FOLDER, OTHER), job("j2", OTHER, FOLDER)]),
      }),
    );
    expect(
      keep.map((b) =>
        b.kind === "job" ? `job:${b.job.uuid}:${String(b.into)}` : b.kind,
      ),
    ).toEqual(["nfs", "rsyncModule", "job:j1:false", "job:j2:true"]);
  });

  it("an add-on when `_used` and nothing is found", () => {
    expect(deleteBlockers(input(none)).keep).toEqual([{ kind: "other" }]);
  });

  it("fails closed when a list cannot be read, and waits for one on its way", () => {
    expect(
      deleteBlockers(
        input({
          ...none,
          modules: { data: undefined, failed: true, error: "x" },
        }),
      ).keep,
    ).toEqual([{ kind: "unread", error: "x" }]);
    expect(
      deleteBlockers(
        input({ ...none, nfs: { data: undefined, failed: false } }),
      ).keep,
    ).toEqual([{ kind: "loading" }]);
  });

  it("nothing in use: no keep blocker", () => {
    expect(
      deleteBlockers({ ...input(none), folder: { ...folder, _used: false } })
        .keep,
    ).toEqual([]);
  });
});
