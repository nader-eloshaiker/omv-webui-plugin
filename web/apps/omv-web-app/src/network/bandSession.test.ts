// SPDX-License-Identifier: GPL-3.0-or-later
// The band's apply confirmation from what this session saved (1.8 as built): the session's classes
// when every pending network change was saved here; 1.8's server-state rules otherwise.
import { afterEach, describe, expect, it } from "vitest";
import { sameInterfaces, sessionInterfaceLines } from "./bandSession.ts";
import { failed, ok } from "./dto.ts";
import { KNOWN, device, settings } from "./fixtures.testing.ts";
import { bandCheck, type Impact } from "./impact.ts";
import {
  forgetNetworkPending,
  networkSession,
  recordNetworkSave,
} from "./networkSession.ts";

const DHCP = settings("enp2s0", { method: "dhcp" });
const DNS = { ...DHCP, dnsnameservers: "192.0.2.53" };
const OTHER = settings("enp3s0", { method: "dhcp" });
const BRIEF: Impact = { class: "brief", findings: [{ class: "brief" }] };
const LIVE = device("enp2s0", {
  uuid: DHCP.uuid,
  address: "192.0.2.10",
  netmask: "255.255.255.0",
  prefix: 24,
});

afterEach(() => networkSession.reset());

const save = (
  pendingBefore: string[],
  before: (typeof DHCP)[],
  after: (typeof DHCP)[] | null,
  impact: Impact | null = BRIEF,
) =>
  recordNetworkSave({
    pendingBefore,
    interfacesBefore: before,
    interfacesAfter: after,
    change: impact === null ? null : { devicename: "enp2s0", impact },
    same: sameInterfaces,
  });

describe("sameInterfaces", () => {
  it("ignores order and the Wi-Fi password's presence", () => {
    expect(sameInterfaces([DHCP, OTHER], [OTHER, DHCP])).toBe(true);
    expect(
      sameInterfaces([{ ...DHCP, wpapsk: true }], [{ ...DHCP, wpapsk: false }]),
    ).toBe(true);
    expect(sameInterfaces([DHCP], [DNS])).toBe(false);
    expect(sameInterfaces([DHCP], [DHCP, OTHER])).toBe(false);
  });
});

describe("the session's classes for the band (1.8 as built)", () => {
  const band = (stored: (typeof DHCP)[]) =>
    bandCheck({
      pending: ["systemd-networkd"],
      location: { protocol: "http:", hostname: "192.0.2.10", port: "" },
      connection: KNOWN,
      devices: ok([LIVE]),
      stored: ok(stored),
      general: ok({ hostname: "nas", domainname: "" }),
      firewall: null,
      session: sessionInterfaceLines(
        networkSession.getState().networkSaves,
        ok(stored),
      ),
    });

  it("without a session save, a stored automatic method on this page's interface is May cut (1.8)", () => {
    expect(band([DNS])).toMatchObject({
      class: "mayCut",
      confirmation: "typed",
    });
  });

  it("a name-server change saved here as Brief is applied with the ordinary confirmation", () => {
    save([], [DHCP], [DNS]);
    expect(band([DNS])).toMatchObject({
      class: "brief",
      confirmation: "ordinary",
      lines: [{ code: "netApply.lineBrief" }],
    });
  });

  it("falls back when something was pending before this session's first save", () => {
    save(["systemd-networkd"], [DHCP], [DNS]);
    expect(networkSession.getState().networkSaves?.owned).toBe(false);
    expect(band([DNS]).class).toBe("mayCut");
  });

  it("falls back when the stored interfaces changed since this session's last save (another administrator)", () => {
    save([], [DHCP], [DNS]);
    const theirs = { ...DNS, method: "static" as const, address: "192.0.2.30" };
    expect(band([theirs]).class).not.toBe("brief");
    expect(
      sessionInterfaceLines(
        networkSession.getState().networkSaves,
        ok([theirs]),
      ),
    ).toBeNull();
  });

  it("a later save after someone else's keeps it disowned until the next apply", () => {
    save([], [DHCP], [DNS]);
    const theirs = { ...DNS, comment: "theirs" };
    save(["systemd-networkd"], [theirs], [{ ...theirs, wol: true }]);
    expect(networkSession.getState().networkSaves?.owned).toBe(false);
    forgetNetworkPending([]);
    expect(networkSession.getState().networkSaves).toBeNull();
    save([], [DHCP], [DNS]);
    expect(networkSession.getState().networkSaves?.owned).toBe(true);
  });

  it("a reading of the pending modules from before the save forgets nothing (a page mounting on the shell's last read)", () => {
    const before = Date.now() - 1_000;
    save([], [DHCP], [DNS]);
    forgetNetworkPending([], before);
    expect(networkSession.getState().networkSaves?.owned).toBe(true);
    forgetNetworkPending([]);
    expect(networkSession.getState().networkSaves).toBeNull();
  });

  it("a failed read after the save disowns, and a failed read now falls back", () => {
    save([], [DHCP], null);
    expect(networkSession.getState().networkSaves?.owned).toBe(false);
    networkSession.reset();
    save([], [DHCP], [DNS]);
    expect(
      sessionInterfaceLines(networkSession.getState().networkSaves, failed),
    ).toBeNull();
  });

  it("uses each saved change's class: a move, a May cut, and Not affected on another interface", () => {
    save([], [DHCP], [DNS], {
      class: "moves",
      findings: [
        {
          class: "moves",
          effect: "netChange.effect.newAddress",
          family: 4,
          old: "192.0.2.10",
          new: "192.0.2.20",
        },
      ],
    });
    save(["systemd-networkd"], [DNS], [DNS], {
      class: "mayCut",
      findings: [
        { class: "mayCut", effect: "netChange.effect.mtu", size: 9000 },
      ],
    });
    save(["systemd-networkd"], [DNS], [DNS], { class: "none", findings: [] });
    expect(
      sessionInterfaceLines(networkSession.getState().networkSaves, ok([DNS])),
    ).toEqual([
      {
        code: "netApply.lineMoves",
        class: "moves",
        iface: "enp2s0",
        old: "192.0.2.10",
        new: "192.0.2.20",
      },
      { code: "netApply.lineMayCut", class: "mayCut", iface: "enp2s0" },
    ]);
  });

  it("a name saved here adds no interface line", () => {
    save([], [DHCP], [DHCP], null);
    expect(
      sessionInterfaceLines(networkSession.getState().networkSaves, ok([DHCP])),
    ).toEqual([]);
  });
});
