// SPDX-License-Identifier: GPL-3.0-or-later
// network/ruleWords.ts: 11.3's words and known ports (D20), {{who}} (at most three, then "and n
// more"), the check's words and what deleting a rule loses (11.8).
import { describe, expect, it } from "vitest";
import type { Recorded } from "./firewallCheck.ts";
import {
  parseAddressSpec,
  readRule,
  REPLIES_OPTIONS,
  SELF_OPTIONS,
} from "./firewallModel.ts";
import { rule, rules } from "./fixtures.testing.ts";
import {
  countsLine,
  deleteLoss,
  knownPorts,
  portName,
  ruleRow,
  verdictWords,
  whoList,
  whoWord,
  type PortNames,
} from "./ruleWords.ts";

const NAMES: PortNames = { pagePort: 80, otherWebPorts: [443], sshPort: 22 };

describe("known ports (11.3, D20)", () => {
  it.each([
    [80, NAMES, "firewall.service.thisPage"],
    [443, NAMES, "firewall.service.web"],
    [
      443,
      { pagePort: 80, otherWebPorts: [], sshPort: 22 },
      "firewall.service.secureWeb",
    ],
    [22, NAMES, "firewall.service.ssh"],
    [2222, { ...NAMES, sshPort: 2222 }, "firewall.service.ssh"],
    [22, { ...NAMES, sshPort: null }, "firewall.service.ssh"],
    [445, NAMES, "firewall.service.smb"],
    [139, NAMES, "firewall.service.netbios"],
    [2049, NAMES, "firewall.service.nfs"],
    [111, NAMES, "firewall.service.rpcbind"],
    [873, NAMES, "firewall.service.rsyncd"],
    [53, NAMES, "firewall.service.dns"],
    [123, NAMES, "firewall.service.ntp"],
    [25, NAMES, "firewall.service.mail"],
    [587, NAMES, "firewall.service.mail"],
    [8080, NAMES, null],
  ])("port %i is %s", (port, names, expected) => {
    expect(portName(port, names)).toBe(expected);
  });

  it("this page's port wins over a fixed name, and each port is listed once", () => {
    const list = knownPorts({
      pagePort: 443,
      otherWebPorts: [80],
      sshPort: 22,
    });
    expect(list[0]).toEqual({
      port: 443,
      service: "firewall.service.thisPage",
    });
    expect(list.filter((k) => k.port === 443)).toHaveLength(1);
  });
});

describe("a row in words (11.3 item 7)", () => {
  const row = (over: Parameters<typeof rule>[0]) =>
    ruleRow(readRule(rule(over), 1), NAMES);

  it("Coming in, TCP to port 22 (SSH), any computer", () => {
    expect(row({ dport: "22" })).toMatchObject({
      then: { key: "firewall.action.accept" },
      traffic: {
        key: "firewall.trafficPort",
        direction: { key: "firewall.dir.in" },
        kind: { key: "firewall.kind.tcp" },
        port: {
          key: "firewall.port_one",
          port: 22,
          service: "firewall.service.ssh",
        },
      },
      who: { key: "firewall.who.any" },
      nasSide: null,
      otherPort: null,
      options: null,
    });
  });

  it("Going out, UDP to port 53 (name servers)", () => {
    expect(
      row({ chain: "OUTPUT", protocol: "udp", sport: "53" }).traffic,
    ).toMatchObject({
      direction: { key: "firewall.dir.out" },
      kind: { key: "firewall.kind.udp" },
      port: { port: 53, service: "firewall.service.dns" },
    });
  });

  it.each([
    ["", { key: "firewall.traffic" }],
    [
      "1024-65535",
      {
        key: "firewall.trafficPort",
        port: { key: "firewall.portRange", from: 1024, to: 65535 },
      },
    ],
    [
      "!22",
      {
        key: "firewall.trafficPort",
        port: { key: "fwRule.classicValue", value: "!22" },
      },
    ],
  ])("the port %j", (dport, expected) => {
    expect(row({ dport }).traffic).toMatchObject(expected);
  });

  it.each([
    ["tcp", { key: "firewall.kind.tcp" }],
    ["all", { key: "firewall.kind.all" }],
    ["icmpv6", { key: "firewall.kind.icmp" }],
    ["!tcp", { key: "firewall.kind.classic", kind: "!tcp" }],
    ["sctp", { key: "firewall.kind.classic", kind: "sctp" }],
  ])("the kind %j", (protocol, expected) => {
    expect(row({ protocol }).traffic.kind).toEqual(expected);
  });

  it.each([
    ["ACCEPT", { key: "firewall.action.accept" }],
    ["REJECT", { key: "firewall.action.reject" }],
    ["DROP", { key: "firewall.action.drop" }],
    ["LOG", { key: "firewall.action.log" }],
    ["", { key: "firewall.action.count" }],
    ["RETURN", { key: "fwRule.classicValue", value: "RETURN" }],
  ])("the action %j", (action, expected) => {
    expect(row({ action }).then).toEqual(expected);
  });

  it.each([
    ["", { key: "firewall.who.any" }],
    ["192.0.2.10", { key: "firewall.who.one", address: "192.0.2.10" }],
    [
      "192.0.2.0/24",
      {
        key: "firewall.who.network",
        network: "192.0.2.0/24",
        count: { kind: "count", count: 256 },
      },
    ],
    [
      "192.0.2.10-192.0.2.20",
      { key: "firewall.who.range", first: "192.0.2.10", last: "192.0.2.20" },
    ],
    [
      "!192.0.2.10",
      {
        key: "firewall.who.except",
        who: { key: "firewall.who.one", address: "192.0.2.10" },
      },
    ],
    [
      "files.example.org",
      { key: "fwRule.classicValue", value: "files.example.org" },
    ],
  ])("the other computer %j", (source, expected) => {
    expect(whoWord(parseAddressSpec(source, 4))).toEqual(expected);
  });

  it("the NAS's side when set, and a far-side port as set in the classic interface", () => {
    expect(
      row({ destination: "192.0.2.10", sport: "1024-65535" }),
    ).toMatchObject({
      nasSide: {
        key: "firewall.who.nasSide",
        address: { key: "firewall.who.one", address: "192.0.2.10" },
      },
      otherPort: { key: "fwRule.classicValue", value: "1024-65535" },
    });
  });

  it.each([
    [SELF_OPTIONS, { key: "firewall.note.self" }],
    [REPLIES_OPTIONS, { key: "firewall.note.replies" }],
    ["-m limit", { key: "firewall.note.classic", options: "-m limit" }],
  ])("other options %j", (extraoptions, expected) => {
    expect(row({ extraoptions }).options).toEqual(expected);
  });
});

describe("{{who}}: at most three, then and n more (11.5)", () => {
  const recorded = (sources: string[]): Recorded[] =>
    sources.map((source, i) => ({
      position: i + 1,
      who: { other: parseAddressSpec(source, 4), nasSide: { kind: "any" } },
      allows: true,
      uncertain: null,
    }));

  it.each([
    [["192.0.2.1"], 1, 0],
    [["192.0.2.1", "192.0.2.2", "192.0.2.3"], 3, 0],
    [["192.0.2.1", "192.0.2.2", "192.0.2.3", "192.0.2.4", "192.0.2.5"], 3, 2],
    [["192.0.2.1", "192.0.2.1", "192.0.2.2"], 2, 0],
  ])("%o", (sources, shown, more) => {
    const list = whoList(recorded(sources));
    expect(list.shown).toHaveLength(shown);
    expect(list.more).toBe(more);
  });

  it.each([
    [{ kind: "letIn" }, { key: "firewall.pageLetIn" }],
    [
      { kind: "blockedAll", position: 1, direction: "in" },
      { key: "firewall.pageRefused" },
    ],
    [
      { kind: "cannotTell", position: 4, reason: "options" },
      { key: "firewall.pageCannotTell", n: 4 },
    ],
  ] as const)("the check's words for %o", (verdict, expected) => {
    expect(verdictWords(verdict)).toEqual(expected);
  });

  it("only some and blocked for some carry {{who}}", () => {
    expect(
      verdictWords({ kind: "onlySome", who: recorded(["192.0.2.0/24"]) }),
    ).toMatchObject({
      key: "firewall.pageOnlySome",
      who: { shown: [{ who: { key: "firewall.who.network" } }], more: 0 },
    });
    expect(
      verdictWords({ kind: "blockedSome", who: recorded(["192.0.2.1"]) }).key,
    ).toBe("firewall.pageBlockedSome");
  });
});

describe("the summary line and what deleting loses", () => {
  it.each([
    [[], { key: "firewall.none" }],
    [
      rules({}, { chain: "OUTPUT" }, {}),
      { key: "firewall.counts", in: 2, out: 1 },
    ],
  ])("%o", (list, expected) => {
    expect(countsLine(list)).toEqual(expected);
  });

  it.each([
    [
      { action: "REJECT", dport: "445", source: "203.0.113.0/24" },
      "fwDelete.lostBlock",
    ],
    [{ action: "DROP" }, "fwDelete.lostBlock"],
    [{ action: "ACCEPT" }, "fwDelete.lostAllow"],
    [{ action: "LOG" }, "fwDelete.lostLog"],
    [{ action: "" }, null],
  ])("%o", (over, key) => {
    expect(deleteLoss(readRule(rule(over), 1), NAMES)?.key ?? null).toBe(key);
  });

  it("a refusal deleted names who and what", () => {
    expect(
      deleteLoss(
        readRule(
          rule({ action: "REJECT", dport: "445", source: "203.0.113.0/24" }),
          1,
        ),
        NAMES,
      ),
    ).toMatchObject({
      who: { who: { key: "firewall.who.network", network: "203.0.113.0/24" } },
      what: { port: { port: 445, service: "firewall.service.smb" } },
    });
  });
});
