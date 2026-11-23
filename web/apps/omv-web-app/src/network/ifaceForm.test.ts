// SPDX-License-Identifier: GPL-3.0-or-later
// The interface form's model (phase 5 network design 5 to 9, 0.8, 0.9, 1.4): first values, every
// check, what the save sends for each kind, the members a bond or bridge may take, and the change
// flow's comparison, which never holds a password.
import { describe, expect, it } from "vitest";
import type { Connection } from "./connection.ts";
import { NEW_OBJECT_UUID } from "./dto.ts";
import { bare, device, KNOWN, settings } from "./fixtures.testing.ts";
import {
  advancedSet,
  afterOf,
  checkContext,
  devicenameOf,
  effectiveAddress,
  formProblems,
  initialDraft,
  memberChoices,
  nextFreeName,
  showsMetric,
  summaryRows,
  toggleMember,
  writeOf,
  type IfaceFormDraft,
} from "./ifaceForm.ts";

const NO_CONTEXT = { others: [] };
const codes = (
  draft: IfaceFormDraft,
  over: Partial<Parameters<typeof formProblems>[0]> = {},
) =>
  formProblems({
    kind: "ethernet",
    isNew: false,
    draft,
    context: NO_CONTEXT,
    stored: [],
    password: "",
    ...over,
  }).map((p) => p.code);

describe("initialDraft", () => {
  it("gives a new interface the classic defaults (D4): IPv4 automatic, IPv6 off, Standard size", () => {
    const draft = initialDraft(null, "enp3s0");
    expect(draft.port).toBe("enp3s0");
    expect(draft.address).toMatchObject({
      method: "dhcp",
      method6: "manual",
      prefix6: "64",
      routemetric: "0",
      routemetric6: "1",
      wol: false,
      altmacaddress: "",
      comment: "",
    });
    expect(draft.mtuChoice).toBe("standard");
    expect(draft.bondmode).toBe(1);
    expect(draft.keymanagement).toBe("psk");
    expect(draft.band).toBe("auto");
    expect(advancedSet(draft)).toBe(false);
  });

  it.each([
    [0, "standard", ""],
    [9000, "jumbo", ""],
    [1400, "other", "1400"],
  ] as const)("reads a packet size of %i as %s", (mtu, choice, text) => {
    const draft = initialDraft(settings("enp2s0", { mtu }));
    expect(draft.mtuChoice).toBe(choice);
    expect(draft.address.mtu).toBe(text);
    expect(advancedSet(draft)).toBe(mtu !== 0);
  });

  it("keeps a bond mode set in the classic interface", () => {
    const draft = initialDraft(
      settings("bond0", { type: "bond", bondmode: 0, slaves: ["enp3s0"] }),
    );
    expect(draft.bondmode).toBe(0);
    expect(draft.slaves).toEqual(["enp3s0"]);
  });

  it("never holds a Wi-Fi password", () => {
    const draft = initialDraft(
      settings("wlp3s0", { type: "wifi", wpassid: "EXAMPLE-NETWORK" }),
    );
    expect(JSON.stringify(draft)).not.toContain("wpapsk");
  });
});

describe("effectiveAddress", () => {
  it.each([
    ["standard", "1400", "0"],
    ["jumbo", "", "9000"],
    ["other", "1400", "1400"],
  ] as const)("%s sends %s as %s", (mtuChoice, typed, sent) => {
    const draft = initialDraft(null);
    expect(
      effectiveAddress({
        ...draft,
        mtuChoice,
        address: { ...draft.address, mtu: typed },
      }).mtu,
    ).toBe(sent);
  });
});

describe("formProblems", () => {
  const base = initialDraft(null);

  it("asks for a port or Wi-Fi hardware for a new one", () => {
    expect(codes(base, { isNew: true })).toEqual(["ifaceForm.err.port"]);
    expect(
      codes(base, { isNew: true, kind: "wifi", password: "long enough" }),
    ).toEqual(["wifi.err.hardware", "wifi.err.name"]);
  });

  it("checks the Wi-Fi name in bytes and the password's length", () => {
    const named = { ...base, port: "wlp4s0", wpassid: "é".repeat(17) };
    expect(codes(named, { kind: "wifi", password: "1234567" })).toEqual([
      "wifi.err.name",
      "wifi.err.password",
    ]);
    expect(
      codes(
        { ...named, wpassid: "é".repeat(16) },
        { kind: "wifi", password: "12345678" },
      ),
    ).toEqual([]);
  });

  it("asks a bond for a port and, in modes 1 and 6, a main port (OMV's rule)", () => {
    expect(codes(base, { kind: "bond" })).toEqual([
      "bond.err.noPort",
      "bond.err.primary",
    ]);
    const ports = { ...base, slaves: ["enp3s0", "enp26s0"] };
    expect(codes({ ...ports, bondmode: 6 }, { kind: "bond" })).toEqual([
      "bond.err.primary",
    ]);
    expect(codes({ ...ports, bondmode: 4 }, { kind: "bond" })).toEqual([]);
    expect(
      codes({ ...ports, bondprimary: "enp3s0" }, { kind: "bond" }),
    ).toEqual([]);
  });

  it("checks a new VLAN's parent and ID, and refuses a taken ID", () => {
    expect(codes(base, { kind: "vlan", isNew: true })).toEqual([
      "vlan.err.runsOn",
      "vlan.err.id",
    ]);
    expect(
      codes(
        { ...base, vlanrawdevice: "enp2s0", vlanid: "4095" },
        { kind: "vlan", isNew: true },
      ),
    ).toEqual(["vlan.err.id"]);
    const taken = settings("enp2s0.10", {
      type: "vlan",
      vlanid: 10,
      vlanrawdevice: "enp2s0",
    });
    expect(
      codes(
        { ...base, vlanrawdevice: "enp2s0", vlanid: "10" },
        { kind: "vlan", isNew: true, stored: [taken] },
      ),
    ).toEqual(["vlan.err.taken"]);
  });

  it("refuses Another size with nothing typed, which would otherwise be sent as Standard", () => {
    expect(codes({ ...base, mtuChoice: "other" })).toEqual([
      "ifaceForm.err.mtu",
    ]);
    expect(
      codes({
        ...base,
        mtuChoice: "other",
        address: { ...base.address, mtu: "100" },
      }),
    ).toEqual(["ifaceForm.err.mtu"]);
  });

  it("passes the address part's checks on (5.3), with the duplicate and same-network context", () => {
    const fixed = {
      ...base,
      address: {
        ...base.address,
        method: "static" as const,
        address: "192.0.2.10",
        size: "24",
      },
    };
    const context = checkContext({
      devicename: "enp2s0.10",
      devices: [device("enp2s0", { address: "192.0.2.10", prefix: 24 })],
      stored: [],
      vlanParent: "enp2s0",
    });
    expect(codes(fixed, { kind: "vlan", context })).toEqual([
      "ifaceForm.err.duplicate",
      "vlan.err.sameNetwork",
    ]);
  });
});

describe("names", () => {
  it("names a VLAN {{parent}}.{{id}} once both are valid, and a new bond or bridge not at all", () => {
    const draft = { ...initialDraft(null), vlanrawdevice: "bond0" };
    expect(devicenameOf("vlan", null, draft)).toBe("");
    expect(devicenameOf("vlan", null, { ...draft, vlanid: "10" })).toBe(
      "bond0.10",
    );
    expect(devicenameOf("bond", null, draft)).toBe("");
  });

  it("says the next free name OMV will give", () => {
    expect(nextFreeName([settings("bond0")], [device("bond1")], "bond")).toBe(
      "bond2",
    );
    expect(nextFreeName([], [], "br")).toBe("br0");
  });
});

describe("advanced", () => {
  it("shows a route priority only with a fixed address and a router address", () => {
    const draft = initialDraft(null);
    expect(showsMetric(draft, 4)).toBe(false);
    const fixed = {
      ...draft,
      address: {
        ...draft.address,
        method: "static" as const,
        gateway: "192.0.2.1",
      },
    };
    expect(showsMetric(fixed, 4)).toBe(true);
    expect(showsMetric(fixed, 6)).toBe(false);
  });
});

describe("writeOf (0.9)", () => {
  const context = NO_CONTEXT;

  it("sends a new port with the classic defaults", () => {
    const write = writeOf({
      kind: "ethernet",
      read: null,
      draft: initialDraft(null, "enp3s0"),
      context,
      stored: [],
      password: "",
    });
    expect(write).toEqual({
      type: "ethernet",
      request: expect.objectContaining({
        uuid: NEW_OBJECT_UUID,
        devicename: "enp3s0",
        method: "dhcp",
        method6: "manual",
        netmask6: 64,
        routemetric: 0,
        routemetric6: 1,
        mtu: 0,
        wol: false,
        altmacaddress: "",
      }),
    });
  });

  it("sends a new bond with no name, the timing default and the transmit hash policy (VM fact)", () => {
    const write = writeOf({
      kind: "bond",
      read: null,
      draft: {
        ...initialDraft(null),
        slaves: ["enp3s0", "enp26s0"],
        bondprimary: "enp3s0",
      },
      context,
      stored: [],
      password: "",
    });
    expect(write.type).toBe("bond");
    expect(write.request).toMatchObject({
      devicename: "",
      slaves: ["enp3s0", "enp26s0"],
      bondmode: 1,
      bondprimary: "enp3s0",
      bondmiimon: 100,
      bondtransmithashpolicy: "layer2",
    });
  });

  it("sends the Wi-Fi password typed for this request, and refuses a draft that has not passed its checks", () => {
    const draft = {
      ...initialDraft(null, "wlp4s0"),
      wpassid: "EXAMPLE-NETWORK",
    };
    const write = writeOf({
      kind: "wifi",
      read: null,
      draft,
      context,
      stored: [],
      password: "typed-Pw-123",
    });
    expect(write.type === "wifi" && write.request.wpapsk).toBe("typed-Pw-123");
    expect(() =>
      writeOf({
        kind: "wifi",
        read: null,
        draft,
        context,
        stored: [],
        password: "short",
      }),
    ).toThrow();
  });

  it("keeps a VLAN's parent and ID as read when it is changed", () => {
    const read = settings("bond0.10", {
      type: "vlan",
      vlanid: 10,
      vlanrawdevice: "bond0",
    });
    const write = writeOf({
      kind: "vlan",
      read,
      draft: initialDraft(read),
      context,
      stored: [read],
      password: "",
    });
    expect(write.request).toMatchObject({
      uuid: read.uuid,
      devicename: "bond0.10",
      vlanid: 10,
      vlanrawdevice: "bond0",
    });
  });
});

describe("memberChoices (0.8)", () => {
  const devices = [
    device("enp2s0", { address: "192.0.2.10", prefix: 24 }),
    bare("enp3s0"),
    device("bond0", { type: "bond", slaves: [] }),
  ];
  const stored = [settings("enp2s0"), settings("bond0", { type: "bond" })];

  it("lists this page's own port unavailable, and leaves out what has settings of its own", () => {
    const choices = memberChoices({
      kind: "bond",
      candidates: [bare("enp3s0")],
      connection: KNOWN,
      devices,
      stored,
      own: [],
    });
    expect(choices.map((c) => [c.candidate.devicename, c.thisPage])).toEqual([
      ["enp3s0", false],
      ["enp2s0", true],
    ]);
  });

  it("does not offer a bond with settings that OMV lists for a bridge (VM fact)", () => {
    const choices = memberChoices({
      kind: "bridge",
      candidates: [bare("enp3s0"), devices[2] ?? bare("bond0")],
      connection: KNOWN,
      devices,
      stored,
      own: [],
    });
    expect(choices.map((c) => c.candidate.devicename)).toEqual([
      "enp3s0",
      "enp2s0",
    ]);
  });

  it("keeps a bond's own ports choosable, even under this page's interface", () => {
    const onVlan: Connection = {
      ...(KNOWN as Extract<Connection, { kind: "known" }>),
      iface: "bond0.10",
      under: ["bond0", "enp3s0", "enp26s0"],
    };
    const choices = memberChoices({
      kind: "bond",
      candidates: [bare("enp3s0"), bare("enp26s0")],
      connection: onVlan,
      devices: [bare("enp3s0"), bare("enp26s0")],
      stored: [],
      own: ["enp3s0", "enp26s0"],
    });
    expect(choices.every((c) => !c.thisPage)).toBe(true);
  });

  it("clears the main port when it is no longer a member", () => {
    const draft = {
      ...initialDraft(null),
      slaves: ["enp3s0", "enp26s0"],
      bondprimary: "enp3s0",
    };
    expect(toggleMember(draft, "enp3s0", false)).toMatchObject({
      slaves: ["enp26s0"],
      bondprimary: "",
    });
    expect(toggleMember(draft, "enp4s0", true).bondprimary).toBe("enp3s0");
  });
});

describe("summaryRows (1.4)", () => {
  it("always has the address rows, and marks what changes", () => {
    const before = settings("enp2s0", {
      method: "static",
      address: "192.0.2.10",
      netmask: "255.255.255.0",
      gateway: "192.0.2.1",
      dnsnameservers: "192.0.2.1",
    });
    const draft = initialDraft(before);
    const after = afterOf("ethernet", before, {
      ...draft,
      address: { ...draft.address, address: "192.0.2.20" },
    });
    const rows = summaryRows({ kind: "ethernet", before, after, live: null });
    expect(rows.map((r) => [r.id, r.changed])).toEqual([
      ["ipv4How", false],
      ["ipv4Address", true],
      ["ipv4Gateway", false],
      ["ipv6How", false],
      ["ipv6Address", false],
      ["ipv6Gateway", false],
    ]);
    expect(rows[1]).toMatchObject({
      now: { kind: "text", text: "192.0.2.10/24" },
      after: { kind: "text", text: "192.0.2.20/24" },
    });
  });

  it("never shows the Wi-Fi password: Password: Set, then typed again", () => {
    const before = settings("wlp3s0", {
      type: "wifi",
      wpassid: "EXAMPLE-NETWORK",
    });
    const draft = initialDraft(before);
    const after = {
      ...afterOf("wifi", before, { ...draft, band: "5GHz" }),
      wpapsk: "typed-secret-9",
    };
    const rows = summaryRows({ kind: "wifi", before, after, live: null });
    expect(JSON.stringify(rows)).not.toContain("typed-secret-9");
    expect(rows.find((r) => r.id === "wpapsk")).toMatchObject({
      now: { kind: "key", key: "wifi.passwordSet" },
      after: { kind: "key", key: "wifi.typedAgain" },
    });
    expect(rows.find((r) => r.id === "band")?.changed).toBe(true);
  });

  it("shows a bond mode set in the classic interface by OMV's name", () => {
    const before = settings("bond0", {
      type: "bond",
      bondmode: 0,
      slaves: ["enp3s0"],
    });
    const draft = initialDraft(before);
    const rows = summaryRows({
      kind: "bond",
      before,
      after: afterOf("bond", before, {
        ...draft,
        bondmode: 1,
        bondprimary: "enp3s0",
      }),
      live: null,
    });
    expect(rows.find((r) => r.id === "bondmode")).toMatchObject({
      now: { kind: "classicMode", mode: "balance-rr" },
      after: { kind: "key", key: "bond.mode.backup" },
    });
  });
});
