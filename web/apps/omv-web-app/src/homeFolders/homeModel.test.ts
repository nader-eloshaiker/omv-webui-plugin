// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  ConfiguredFilesystem,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  holdsHomeFolders,
  homeChoices,
  homeState,
  offeredOrder,
  turnOnCheck,
} from "./homeModel.ts";

const fs = (dir: string, over: Partial<ConfiguredFilesystem> = {}) =>
  ({
    devicefile: `/dev/${dir.replace(/\W/g, "")}`,
    mountpoint: dir,
    mounted: true,
    status: 1,
    ...over,
  }) as ConfiguredFilesystem;

const folder = (
  name: string,
  n: number,
  dir: string,
  over: Partial<SharedFolder> = {},
) =>
  ({
    uuid: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
    name,
    reldirpath: `${name}/`,
    status: "OK",
    mntent: { dir, fsname: "" },
    ...over,
  }) as SharedFolder;

const DATA = "/srv/dev-disk-by-uuid-data";
const GONE = "/srv/dev-disk-by-uuid-gone";
const ROWS = [fs(DATA), fs("/"), fs(GONE, { mounted: false })];

describe("homeChoices (12.4)", () => {
  it("offers OK folders on a mounted, non-system file system that are not a whole file system", () => {
    const folders = [
      folder("Homes", 1, DATA),
      folder("Whole", 2, DATA, { reldirpath: "/" }),
      folder("System", 3, "/"),
      folder("Unmounted", 4, GONE),
      folder("Broken", 5, DATA, { status: "ENOENT" }),
    ];
    const { offered, cannot } = homeChoices(folders, ROWS);
    expect(offered.map((f) => f.name)).toEqual(["Homes"]);
    expect(cannot.map((c) => [c.folder.name, c.reason])).toEqual([
      ["Broken", "notOk"],
      ["System", "system"],
      ["Unmounted", "notMounted"],
      ["Whole", "whole"],
    ]);
  });

  it("refuses a folder whose file system is not in the list", () => {
    const { offered, cannot } = homeChoices(
      [folder("Lost", 1, "/srv/elsewhere")],
      ROWS,
    );
    expect(offered).toEqual([]);
    expect(cannot[0]?.reason).toBe("notMounted");
  });
});

describe("homeState (12.3, 12.7)", () => {
  const homes = folder("Homes", 1, DATA);
  it("says off, on and gone", () => {
    expect(
      homeState({ enable: false, sharedfolderref: "" }, [homes], ROWS),
    ).toEqual({
      kind: "off",
      folder: undefined,
    });
    expect(
      homeState({ enable: true, sharedfolderref: homes.uuid }, [homes], ROWS),
    ).toEqual({
      kind: "on",
      folder: homes,
      state: { pill: "ok" },
    });
    expect(
      homeState(
        {
          enable: true,
          sharedfolderref: "00000000-0000-4000-8000-0000000000ff",
        },
        [homes],
        ROWS,
      ),
    ).toEqual({
      kind: "gone",
    });
  });

  it("knows the folder that holds them", () => {
    expect(
      holdsHomeFolders(
        { enable: true, sharedfolderref: homes.uuid },
        homes.uuid,
      ),
    ).toBe(true);
    expect(
      holdsHomeFolders(
        { enable: false, sharedfolderref: homes.uuid },
        homes.uuid,
      ),
    ).toBe(false);
    expect(holdsHomeFolders(undefined, homes.uuid)).toBe(false);
  });
});

describe("turnOnCheck (12.5)", () => {
  const folders = [
    folder("Homes", 1, DATA),
    folder("Whole", 2, DATA, { reldirpath: "/" }),
  ];
  const off = { enable: false, sharedfolderref: "" };

  it("passes a folder that may still hold them", () => {
    expect(turnOnCheck(folders[0]!.uuid, off, folders, ROWS)).toEqual({
      kind: "ok",
      folder: folders[0],
    });
  });

  it("refuses a folder that no longer may, with its reason", () => {
    const broken = [folder("Homes", 1, DATA, { status: "ENOENT" })];
    expect(turnOnCheck(broken[0]!.uuid, off, broken, ROWS)).toMatchObject({
      kind: "refused",
      reason: "notOk",
    });
    expect(turnOnCheck(folders[1]!.uuid, off, folders, ROWS)).toMatchObject({
      kind: "refused",
      reason: "whole",
    });
  });

  it("says when the folder is gone or the setting was changed elsewhere", () => {
    expect(
      turnOnCheck("00000000-0000-4000-8000-000000000099", off, folders, ROWS),
    ).toEqual({ kind: "gone" });
    expect(
      turnOnCheck(
        folders[0]!.uuid,
        { enable: true, sharedfolderref: folders[0]!.uuid },
        folders,
        ROWS,
      ),
    ).toEqual({ kind: "changed" });
  });
});

describe("offeredOrder (12.6)", () => {
  it("puts the folder kept from last time first", () => {
    const a = folder("A", 1, DATA);
    const b = folder("B", 2, DATA);
    expect(offeredOrder([a, b], b.uuid).map((f) => f.name)).toEqual(["B", "A"]);
    expect(offeredOrder([a, b], "").map((f) => f.name)).toEqual(["A", "B"]);
  });
});
