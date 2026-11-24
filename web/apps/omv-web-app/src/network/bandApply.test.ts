// SPDX-License-Identifier: GPL-3.0-or-later
// The band's escalated apply (1.8): its typed confirmation, the watch's expectation (1.5) and the
// recovery card's input.
import { describe, expect, it } from "vitest";
import {
  bandConfirmation,
  bandConfirmationMatches,
  bandExpectation,
  bandImpact,
  bandRecoveryChange,
  bandWaits,
} from "./bandApply.ts";
import type { BandCheck, BandLine } from "./impact.ts";

const check = (...lines: BandLine[]): BandCheck => ({
  class: "mayCut",
  lines,
  confirmation: "typed",
});
const MOVES: BandLine = {
  code: "netApply.lineMoves",
  class: "moves",
  iface: "enp2s0",
  old: "192.0.2.10",
  new: "192.0.2.20",
};
const NAME: BandLine = {
  code: "network.impact.moves",
  class: "moves",
  old: "nas",
  new: "nas-new",
};
const MAY_CUT: BandLine = {
  code: "netApply.lineMayCut",
  class: "mayCut",
  iface: "enp2s0",
};
const FIREWALL: BandLine = {
  code: "netApply.lineFirewall",
  class: "mayCut",
  who: [],
};
const UNKNOWN: BandLine = { code: "network.impact.mayCut", class: "mayCut" };

describe("the band's typed confirmation", () => {
  it.each<[string, BandLine[], string, string]>([
    ["a new address", [MAY_CUT, MOVES], "netChange.typeAddress", "192.0.2.20"],
    ["a new name", [NAME], "netChange.typeName", "nas-new"],
    [
      "an interface that may cut",
      [MAY_CUT, FIREWALL],
      "netChange.typeIface",
      "enp2s0",
    ],
    [
      "the firewall only",
      [FIREWALL, { code: "netApply.lineBrief", class: "brief" }],
      "netChange.typeFirewall",
      "firewall",
    ],
    ["the page cannot tell", [UNKNOWN], "netApply.typeApply", "apply"],
  ])("%s: %s %s", (_what, lines, code, value) => {
    expect(bandConfirmation(check(...lines))).toEqual({ code, value });
  });

  it("matches as the flow does, and 'apply' in any case", () => {
    expect(
      bandConfirmationMatches(
        { code: "netChange.typeAddress", value: "192.0.2.20" },
        " 192.0.2.20 ",
      ),
    ).toBe(true);
    expect(
      bandConfirmationMatches(
        { code: "netApply.typeApply", value: "apply" },
        "Apply",
      ),
    ).toBe(true);
    expect(
      bandConfirmationMatches(
        { code: "netApply.typeApply", value: "apply" },
        "",
      ),
    ).toBe(false);
  });
});

describe("what the band's watch expects (1.5)", () => {
  it.each<[string, BandLine[], string, number]>([
    ["a move: 30 seconds at the old address", [MOVES], "moved", 30],
    ["a new name: 60 seconds by the old name", [NAME], "movedName", 60],
    [
      "May cut: the router may give a new address, 120 seconds",
      [MAY_CUT],
      "automatic",
      120,
    ],
    [
      "Brief interruption: 60 seconds",
      [{ code: "netApply.lineBrief", class: "brief" }],
      "same",
      60,
    ],
  ])("%s", (_what, lines, kind, timeout) => {
    expect(bandExpectation(check(...lines))).toMatchObject({ kind, timeout });
  });

  it("no check ran: 60 seconds", () => {
    expect(bandExpectation(null)).toEqual({ kind: "same", timeout: 60 });
  });

  it("waits whenever the network or the firewall is applied (13.1)", () => {
    expect(bandWaits(["systemd-networkd"])).toBe(true);
    expect(bandWaits(["iptables", "ssh"])).toBe(true);
    expect(bandWaits(["hostname", "samba"])).toBe(false);
  });
});

describe("the band's recovery card", () => {
  it("names what was applied: interfaces first, else the firewall, else the name", () => {
    expect(bandRecoveryChange(["iptables", "systemd-networkd"])).toBe("iface");
    expect(bandRecoveryChange(["iptables"])).toBe("firewall");
    expect(bandRecoveryChange(["hostname"])).toBe("name");
  });

  it("turns lines into findings: a move keeps its addresses", () => {
    expect(bandImpact(check(MOVES, FIREWALL)).findings).toEqual([
      {
        class: "moves",
        effect: "netChange.effect.newAddress",
        family: 4,
        old: "192.0.2.10",
        new: "192.0.2.20",
      },
      { class: "mayCut", effect: "netChange.effect.firewall", who: [] },
    ]);
  });
});
