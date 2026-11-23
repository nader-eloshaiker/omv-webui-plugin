// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import {
  SmbSetSettingsRequestSchema,
  SmbSetShareRequestSchema,
} from "@omv-webui/react-api-omv/forms";
import type {
  ServiceStatus,
  SmbSettings,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  changedShareRequest,
  folderShareState,
  guestMode,
  hostRule,
  NEW_OBJECT_UUID,
  newShareRequest,
  otherOptionsDiffer,
  settingsRequest,
  shareAddresses,
  shareChoicesOf,
  sharingCell,
  shortHostName,
  smbOn,
  smbState,
} from "./smbModel.ts";

const SHARE = CONTRACT_EXAMPLES.smbGetShareList.one.value
  .data[0] as SmbShareRow;
const CLASSIC = CONTRACT_EXAMPLES.smbGetShareList.classicOptions.value
  .data[0] as SmbShareRow;
const SETTINGS = CONTRACT_EXAMPLES.smbGetSettings.on.value as SmbSettings;
const FOLDER = "00000000-0000-4000-8000-000000000005";

const services = (samba: Partial<ServiceStatus> | null): ServiceStatus[] => [
  { name: "ssh", title: "SSH", enabled: true, running: true },
  ...(samba === null
    ? []
    : [
        {
          name: "samba",
          title: "SMB/CIFS",
          enabled: true,
          running: true,
          ...samba,
        },
      ]),
];
const read = <T>(data: T | undefined, failed = false) => ({
  data,
  failed,
  error: failed ? new Error("x") : undefined,
});

function validates(
  schema: typeof SmbSetShareRequestSchema | typeof SmbSetSettingsRequestSchema,
  value: unknown,
) {
  const result = schema["~standard"].validate(value);
  return result instanceof Promise ? ["async"] : (result.issues ?? []);
}

describe("Windows and Mac sharing's state (0.3)", () => {
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
      "on, not running, samba pending",
      { enable: true },
      services({ running: false }),
      ["samba", "avahi"],
      "pendingOn",
    ],
    ["no samba row", { enable: true }, services(null), [], "unread"],
  ] as const)("%s", (_label, settings, rows, pending, kind) => {
    expect(smbState(read(settings), read(rows), pending).kind).toBe(kind);
  });

  it("is Unknown when either read failed, and loading until both arrive", () => {
    expect(smbState(read(undefined, true), read(services({})), []).kind).toBe(
      "unread",
    );
    expect(
      smbState(read({ enable: true }), read(undefined, true), []).kind,
    ).toBe("unread");
    expect(smbState(read(undefined), read(services({})), []).kind).toBe(
      "loading",
    );
    expect(smbState(read({ enable: true }), read(undefined), []).kind).toBe(
      "loading",
    );
    // Off needs no service status.
    expect(smbState(read({ enable: false }), read(undefined), []).kind).toBe(
      "off",
    );
  });

  it("says whether SMB is on, as far as is known", () => {
    expect(smbOn({ kind: "on" })).toBe(true);
    expect(smbOn({ kind: "down" })).toBe(true);
    expect(smbOn({ kind: "pendingOn" })).toBe(true);
    expect(smbOn({ kind: "off" })).toBe(false);
    expect(smbOn({ kind: "loading" })).toBeUndefined();
    expect(smbOn({ kind: "unread", error: null })).toBeUndefined();
  });
});

describe("one folder's share (0.3, 1.3)", () => {
  it.each([
    [undefined, true, "notShared"],
    [SHARE, true, "shared"],
    [SHARE, undefined, "shared"],
    [SHARE, false, "smbOff"],
    [{ ...SHARE, enable: false }, true, "disabled"],
    [{ ...SHARE, enable: false }, false, "disabled"],
  ] as const)("%#", (share, on, kind) => {
    expect(folderShareState(share, on).kind).toBe(kind);
  });

  it("fills the Sharing column", () => {
    const shares = read([
      SHARE,
      { ...SHARE, uuid: "x", sharedfolderref: "other", guest: "allow" },
    ]);
    expect(sharingCell(FOLDER, shares, true)).toEqual({
      kind: "smb",
      guests: false,
    });
    expect(sharingCell(FOLDER, shares, false)).toEqual({
      kind: "smbOff",
      guests: false,
    });
    expect(sharingCell("other", shares, true)).toEqual({
      kind: "smb",
      guests: true,
    });
    expect(sharingCell("none", shares, true)).toEqual({ kind: "none" });
    expect(
      sharingCell(FOLDER, read([{ ...SHARE, enable: false }]), true),
    ).toEqual({ kind: "smbOff", guests: false });
    expect(sharingCell(FOLDER, read(undefined, true), true)).toEqual({
      kind: "unknown",
    });
  });

  it.each([
    ["no", "no"],
    ["allow", "allow"],
    ["only", "only"],
    ["future", "only"],
  ])("reads guest %j as %s", (stored, mode) => {
    expect(guestMode(stored)).toBe(mode);
  });
});

describe("read, change, write (0.10)", () => {
  it("makes a new share with the classic form's defaults (D5) and the three choices", () => {
    const request = newShareRequest(FOLDER, {
      browseable: false,
      readonly: true,
      guest: "allow",
    });
    expect(request).toEqual({
      uuid: NEW_OBJECT_UUID,
      sharedfolderref: FOLDER,
      enable: true,
      comment: "",
      guest: "allow",
      readonly: true,
      browseable: false,
      recyclebin: false,
      recyclemaxsize: 0,
      recyclemaxage: 0,
      hidedotfiles: true,
      inheritacls: false,
      inheritpermissions: false,
      easupport: true,
      storedosattributes: false,
      hostsallow: "",
      hostsdeny: "",
      audit: false,
      timemachine: false,
      extraoptions: "",
      followsymlinks: true,
      widelinks: false,
      macoscompat: false,
      transportencryption: false,
    });
    expect(validates(SmbSetShareRequestSchema, request)).toEqual([]);
  });

  it("makes the captured new share's stored object, apart from its UUID", () => {
    const { uuid: _new, ...made } = CONTRACT_EXAMPLES.smbSetShare.created.value;
    const {
      uuid: _marker,
      timemachinemaxsize: _size,
      ...sent
    } = newShareRequest(FOLDER, shareChoicesOf(undefined));
    const { timemachinemaxsize: _stored, ...stored } = made;
    expect(sent).toEqual(stored);
  });

  it("sends an existing share back whole, without sharedfoldername, changing only what is asked", () => {
    const request = changedShareRequest(CLASSIC, { browseable: false });
    expect(request).not.toHaveProperty("sharedfoldername");
    const { sharedfoldername: _name, ...stored } = CLASSIC;
    expect(request).toEqual({ ...stored, browseable: false });
    expect(validates(SmbSetShareRequestSchema, request)).toEqual([]);
    // What the VM answered for this very change.
    expect(request).toEqual(CONTRACT_EXAMPLES.smbSetShare.changed.value);
  });

  it("turns a share on for its folder, keeping a Guests only it holds", () => {
    const request = changedShareRequest(
      { ...SHARE, enable: false, guest: "only" },
      { enable: true },
    );
    expect(request.enable).toBe(true);
    expect(request.guest).toBe("only");
  });

  it("fills the form from the share, or with a new share's defaults", () => {
    // With the recycle bin (services design 11.3): 30 days for one that is off (D13).
    expect(shareChoicesOf(undefined)).toEqual({
      browseable: true,
      readonly: false,
      guest: "no",
      recycle: { on: false, days: "30" },
    });
    expect(shareChoicesOf({ ...SHARE, guest: "only", readonly: true })).toEqual(
      {
        browseable: true,
        readonly: true,
        guest: "only",
        recycle: { on: false, days: "30" },
      },
    );
  });

  it("finds the options set in the classic interface (4.2)", () => {
    expect(otherOptionsDiffer(SHARE)).toBe(false);
    expect(otherOptionsDiffer(CLASSIC)).toBe(true);
    expect(otherOptionsDiffer({ ...SHARE, hostsallow: "192.0.2.0/24" })).toBe(
      true,
    );
    expect(otherOptionsDiffer({ ...SHARE, timemachinemaxsize: "500G" })).toBe(
      true,
    );
    // The three choices this page offers are not "other options".
    expect(
      otherOptionsDiffer({
        ...SHARE,
        guest: "allow",
        readonly: true,
        browseable: false,
      }),
    ).toBe(false);
  });

  it("sends the whole settings back with only enable changed", () => {
    const request = settingsRequest(SETTINGS, false);
    expect(request).toEqual({ ...SETTINGS, enable: false });
    expect(request).toEqual(CONTRACT_EXAMPLES.smbSetSettings.turnedOff.value);
    expect(validates(SmbSetSettingsRequestSchema, request)).toEqual([]);
  });
});

describe("the NAS's name and the addresses (0.2, 4.4)", () => {
  it.each([
    ["nas", true, 3],
    ["NAS_HOST", true, 8],
    ["fifteen-chars-x", true, 15],
    ["nas-living-room1", false, 16],
    ["nas.example.lan", true, 3],
    ["sixteen-chars-xx.example.lan", false, 16],
  ])("%j: ok %s, %i characters", (hostname, ok, length) => {
    expect(hostRule(hostname)).toEqual({
      ok,
      length,
      host: shortHostName(hostname),
    });
  });

  it("builds both addresses as text, the Mac one percent-encoded", () => {
    expect(shareAddresses("NAS_HOST", "Photos")).toEqual({
      windows: "\\\\NAS_HOST\\Photos",
      mac: "smb://NAS_HOST/Photos",
    });
    expect(shareAddresses("nas", "Family photos")).toEqual({
      windows: "\\\\nas\\Family photos",
      mac: "smb://nas/Family%20photos",
    });
    expect(shareAddresses("nas", "תמונות").mac).toBe(
      "smb://nas/%D7%AA%D7%9E%D7%95%D7%A0%D7%95%D7%AA",
    );
    expect(shareAddresses("nas.example.lan", "a#b").mac).toBe(
      "smb://nas.example.lan/a%23b",
    );
  });
});
