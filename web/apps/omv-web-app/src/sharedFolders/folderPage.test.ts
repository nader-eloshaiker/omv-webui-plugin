// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  ConfiguredFilesystem,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  folderUse,
  fsPage,
  holdsUnsaved,
  NO_ACCESS_DRAFT,
  shareDraftChanged,
} from "./folderPage.ts";

const clone = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;
const EXT4 = clone<ConfiguredFilesystem>(
  CONTRACT_EXAMPLES.fileSystemMgmtGetList.withTags.value.data[0],
);
const ZFS = clone<ConfiguredFilesystem>(
  CONTRACT_EXAMPLES.fileSystemMgmtGetList.zfs.value.data[1],
);
const SHARE = clone<SmbShareRow>(
  CONTRACT_EXAMPLES.smbGetShareList.one.value.data[0],
);

describe("fsPage", () => {
  it("links a file system to its page, a ZFS one to its ZFS page", () => {
    expect(fsPage(EXT4)).toEqual({ kind: "fs", address: EXT4.uuid });
    expect(fsPage(ZFS)).toEqual({ kind: "zfs", name: ZFS.devicefile });
  });

  it("gives the system drive no page", () => {
    expect(fsPage({ ...EXT4, mountpoint: "/" })).toBeNull();
  });
});

describe("folderUse (2.5)", () => {
  const read = { ready: true, failed: false };
  it("is shown only for a use besides its SMB share, or a failed read", () => {
    expect(folderUse({ used: true, hasShare: false, shares: read })).toEqual({
      kind: "other",
    });
    expect(folderUse({ used: true, hasShare: true, shares: read })).toBeNull();
    expect(
      folderUse({ used: false, hasShare: false, shares: read }),
    ).toBeNull();
    expect(
      folderUse({
        used: false,
        hasShare: false,
        shares: { ready: false, failed: true, error: "x" },
      }),
    ).toEqual({ kind: "unread", error: "x" });
    expect(
      folderUse({
        used: true,
        hasShare: false,
        shares: { ready: false, failed: false },
      }),
    ).toBeNull();
  });
});

describe("unsaved work (2.8)", () => {
  it("counts an open form only once its values changed", () => {
    expect(shareDraftChanged(null, SHARE)).toBe(false);
    const first = {
      browseable: SHARE.browseable,
      readonly: SHARE.readonly,
      guest: "no" as const,
    };
    expect(shareDraftChanged(first, { ...SHARE, guest: "no" })).toBe(false);
    expect(
      shareDraftChanged({ ...first, readonly: !first.readonly }, SHARE),
    ).toBe(true);
    expect(
      shareDraftChanged(
        { browseable: true, readonly: false, guest: "allow" },
        undefined,
      ),
    ).toBe(true);
  });

  it("counts the grid's choices", () => {
    expect(holdsUnsaved(NO_ACCESS_DRAFT, null, undefined)).toBe(false);
    expect(
      holdsUnsaved(
        { choices: { "user:alex": "ro" }, base: { privileges: "" } },
        null,
        undefined,
      ),
    ).toBe(true);
  });
});
