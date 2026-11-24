// SPDX-License-Identifier: GPL-3.0-or-later
// network/recovery.ts: which variant and which steps the recovery card shows (phase 5 network design
// 1.6), and that only values typed in this session become links (P7).
import { describe, expect, it } from "vitest";
import { loc } from "./fixtures.testing.ts";
import type { Impact } from "./impact.ts";
import { recoveryCard, type RecoveryInput } from "./recovery.ts";

const MOVES: Impact = {
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
};
const RENAMED: Impact = {
  class: "moves",
  findings: [
    {
      class: "moves",
      effect: "netChange.effect.newName",
      old: "nas-host",
      new: "new-nas",
    },
  ],
};
const AUTOMATIC: Impact = {
  class: "mayCut",
  findings: [{ class: "mayCut", effect: "netChange.effect.automatic" }],
};
const MTU: Impact = {
  class: "mayCut",
  findings: [{ class: "mayCut", effect: "netChange.effect.mtu", size: 9000 }],
};
const FIREWALL: Impact = {
  class: "mayCut",
  findings: [{ class: "mayCut", effect: "netChange.effect.firewall", who: [] }],
};

const input = (over: Partial<RecoveryInput>): RecoveryInput => ({
  variant: "lost",
  change: "iface",
  impact: MTU,
  certainty: "known",
  location: loc("192.0.2.10", "http:"),
  hostname: "nas-host",
  copied: false,
  ...over,
});
const steps = (over: Partial<RecoveryInput>) =>
  recoveryCard(input(over)).steps.map((s) => s.code);

describe("1.6: the variant", () => {
  it.each([
    ["lost", "netRecover.lost"],
    ["unknownAddress", "netRecover.unknownAddress"],
    ["newFails", "netRecover.newFails"],
    [null, null],
  ] as const)("%s", (variant, first) => {
    expect(recoveryCard(input({ variant })).first).toBe(first);
  });
});

describe("1.6: the steps, each only when it applies", () => {
  it.each<[string, Partial<RecoveryInput>, string[]]>([
    [
      "a packet size on a known interface",
      {},
      ["netRecover.wait", "netRecover.console"],
    ],
    [
      "a new fixed address",
      { impact: MOVES, variant: "newFails" },
      ["netRecover.wait", "netRecover.newAddress", "netRecover.console"],
    ],
    [
      "an automatic address",
      { impact: AUTOMATIC, variant: "unknownAddress" },
      ["netRecover.wait", "netRecover.find", "netRecover.console"],
    ],
    [
      "the connection not known",
      { certainty: "notKnown" },
      ["netRecover.wait", "netRecover.find", "netRecover.console"],
    ],
    [
      "a changed name",
      {
        change: "name",
        impact: RENAMED,
        newName: "new-nas",
        addressBefore: "192.0.2.10",
      },
      ["netRecover.wait", "netRecover.newName"],
    ],
    [
      "a firewall change",
      { change: "firewall", impact: FIREWALL },
      ["netRecover.wait", "netRecover.firewall", "netRecover.console"],
    ],
    [
      "the note copied",
      { copied: true },
      ["netRecover.wait", "netRecover.console", "netRecover.note"],
    ],
  ])("%s", (_what, over, expected) => {
    expect(steps(over)).toEqual(expected);
  });

  it("the console's command: omv-firstaid for interfaces, stopping the firewall for rules", () => {
    expect(recoveryCard(input({})).steps).toContainEqual({
      code: "netRecover.console",
      then: "netRecover.firstaid",
      command: "omv-firstaid",
    });
    expect(
      recoveryCard(input({ change: "firewall", impact: FIREWALL })).steps,
    ).toContainEqual({
      code: "netRecover.console",
      then: "netRecover.stopFirewall",
      command: "/etc/iptables/openmediavault-firewall.sh stop",
    });
  });

  it("the new address typed in this session is a link, with the page's scheme and port", () => {
    const card = recoveryCard(
      input({ impact: MOVES, location: loc("192.0.2.10", "https:", "8443") }),
    );
    expect(card.steps).toContainEqual({
      code: "netRecover.newAddress",
      url: "https://192.0.2.20:8443/ui/",
      link: true,
    });
  });

  it("the .local address comes from the NAS's name: text, never a link (UI-3)", () => {
    const card = recoveryCard(
      input({ impact: AUTOMATIC, hostname: "NAS-Host" }),
    );
    expect(card.steps).toContainEqual({
      code: "netRecover.find",
      name: "nas-host",
      url: "http://nas-host.local/ui/",
      link: false,
    });
  });

  it("the new name typed is a link; the address read from the NAS is text", () => {
    const card = recoveryCard(
      input({
        change: "name",
        impact: RENAMED,
        newName: "New-NAS",
        addressBefore: "192.0.2.10",
      }),
    );
    expect(card.steps).toContainEqual({
      code: "netRecover.newName",
      url: "http://new-nas/ui/",
      link: true,
      address: "http://192.0.2.10/ui/",
    });
  });

  it("without a name read, the find step is left out", () => {
    expect(steps({ impact: AUTOMATIC, hostname: "" })).not.toContain(
      "netRecover.find",
    );
  });
});
