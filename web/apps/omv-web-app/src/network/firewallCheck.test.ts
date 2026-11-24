// SPDX-License-Identifier: GPL-3.0-or-later
// network/firewallCheck.ts: every row of both tables of phase 5 network design 11.5 (which rules fit
// this page's traffic, and what the walk concludes), `!` values, ranges, Note in the log and Count
// only, 11.6's two fixed rules, other options, a port on the other side, replies going out, SSH as
// lines, the other web port, the same-network hint, and the IPv6 page.
import { describe, expect, it } from "vitest";
import type { Connection, SshPort, WebPorts } from "./connection.ts";
import { failed, ok, type FirewallRule } from "./dto.ts";
import {
  checkBothLists,
  checkList,
  impactOf,
  ruleFits,
  sshBlockedForAll,
  walk,
  type Traffic,
} from "./firewallCheck.ts";
import {
  readRule,
  readRules,
  REPLIES_OPTIONS,
  SELF_OPTIONS,
} from "./firewallModel.ts";
import { KNOWN, rule, rules } from "./fixtures.testing.ts";

const NAS = { family: 4, value: 0xc000020a } as const; // 192.0.2.10
const LOOPBACK = { family: 4, value: 0x7f000001 } as const;

const traffic = (over: Partial<Traffic> = {}): Traffic => ({
  direction: "in",
  port: 80,
  family: 4,
  nas: NAS,
  peer: null,
  ...over,
});

const fit = (over: Partial<FirewallRule>, t: Partial<Traffic> = {}) =>
  ruleFits(readRule(rule(over), 1), traffic(t)).kind;

describe("11.5, which rules fit this page's traffic", () => {
  it.each<[string, Partial<FirewallRule>, Partial<Traffic>, string]>([
    // Wrong direction, kind or port: nobody.
    [
      "a rule going out, for traffic coming in",
      { chain: "OUTPUT" },
      {},
      "skip",
    ],
    [
      "a rule coming in, for replies going out",
      { chain: "INPUT" },
      { direction: "out" },
      "skip",
    ],
    ["UDP", { protocol: "udp" }, {}, "skip"],
    ["ping", { protocol: "icmp" }, {}, "skip"],
    ["ping over IPv6", { protocol: "icmpv6" }, {}, "skip"],
    ["not TCP", { protocol: "!tcp" }, {}, "skip"],
    ["not any kind", { protocol: "!all" }, {}, "skip"],
    ["another port", { dport: "22" }, {}, "skip"],
    ["a range without the port", { dport: "1-79" }, {}, "skip"],
    ["every port except this one", { dport: "!80" }, {}, "skip"],
    ["every port except this range", { dport: "! 1-1024" }, {}, "skip"],
    [
      "the NAS's side another address",
      { destination: "192.0.2.11" },
      {},
      "skip",
    ],
    [
      "the NAS's side another network",
      { destination: "198.51.100.0/24" },
      {},
      "skip",
    ],
    [
      "the NAS's side every address except the NAS's",
      { destination: "!192.0.2.10" },
      {},
      "skip",
    ],
    // TCP, any kind, not UDP, not ping; the port empty or including it: fits.
    ["TCP, any port, any computer", { protocol: "tcp" }, {}, "every"],
    ["any kind", { protocol: "all" }, {}, "every"],
    ["not UDP", { protocol: "!udp" }, {}, "every"],
    ["not ping", { protocol: "!icmp" }, {}, "every"],
    ["TCP in capitals", { protocol: "TCP" }, {}, "every"],
    ["this port", { dport: "80" }, {}, "every"],
    ["a range with it", { dport: "1-1024" }, {}, "every"],
    ["an iptables range with it", { dport: "1:1024" }, {}, "every"],
    ["every port except another", { dport: "!22" }, {}, "every"],
    ["the NAS's side its address", { destination: "192.0.2.10" }, {}, "every"],
    [
      "the NAS's side its network",
      { destination: "192.0.2.0/24" },
      {},
      "every",
    ],
    [
      "the NAS's side a range with it",
      { destination: "192.0.2.1-192.0.2.20" },
      {},
      "every",
    ],
    [
      "the NAS's side every address except another",
      { destination: "!192.0.2.99" },
      {},
      "every",
    ],
    [
      "the NAS's side set, its address not known: some",
      { destination: "192.0.2.10" },
      { nas: null },
      "some",
    ],
    // The other computer set: some, named.
    ["one computer", { source: "198.51.100.7" }, {}, "some"],
    ["a network", { source: "198.51.100.0/24" }, {}, "some"],
    [
      "a network written with a mask",
      { source: "198.51.100.0/255.255.255.0" },
      {},
      "some",
    ],
    ["a range", { source: "198.51.100.1-198.51.100.9" }, {}, "some"],
    ["every computer except one", { source: "!198.51.100.7" }, {}, "some"],
    // Cannot tell.
    ["a port on the other side", { sport: "1024-65535" }, {}, "cannotTell"],
    [
      "other options",
      { extraoptions: "-m limit --limit 5/min" },
      {},
      "cannotTell",
    ],
    ["a protocol the page cannot read", { protocol: "sctp" }, {}, "cannotTell"],
    ["a port the page cannot read", { dport: "http" }, {}, "cannotTell"],
    [
      "an address the page cannot read",
      { source: "files.example.org" },
      {},
      "cannotTell",
    ],
    [
      "an address of the other family",
      { source: "2001:db8::/32" },
      {},
      "cannotTell",
    ],
    ["a chain OMV does not write", { chain: "FORWARD" }, {}, "cannotTell"],
    ["an action OMV does not write", { action: "RETURN" }, {}, "cannotTell"],
    // What rules out the traffic decides before what cannot be read.
    [
      "UDP with other options",
      { protocol: "udp", extraoptions: "-m state --state NEW" },
      {},
      "skip",
    ],
    // 11.6's two fixed rules.
    [
      "replies, coming in: nobody for a new connection",
      { protocol: "all", extraoptions: REPLIES_OPTIONS },
      {},
      "skip",
    ],
    [
      "replies, going out: the page's replies belong to its connection",
      { chain: "OUTPUT", protocol: "all", extraoptions: REPLIES_OPTIONS },
      { direction: "out" },
      "every",
    ],
    [
      "talking to itself: nobody",
      { protocol: "all", extraoptions: SELF_OPTIONS },
      {},
      "skip",
    ],
    [
      "talking to itself, through a tunnel: fits",
      { protocol: "all", extraoptions: SELF_OPTIONS },
      { nas: LOOPBACK, peer: LOOPBACK },
      "every",
    ],
    [
      "the fixed value with a space more is other options",
      { protocol: "all", extraoptions: "-i  lo" },
      {},
      "cannotTell",
    ],
    // Through a tunnel the other computer is this NAS itself.
    [
      "a network that is not loopback, through a tunnel",
      { source: "198.51.100.0/24" },
      { nas: LOOPBACK, peer: LOOPBACK },
      "skip",
    ],
    // Replies going out: the NAS is the source, the other computer the destination.
    [
      "replies: from this port",
      { chain: "OUTPUT", sport: "80" },
      { direction: "out" },
      "every",
    ],
    [
      "replies: from another port",
      { chain: "OUTPUT", sport: "22" },
      { direction: "out" },
      "skip",
    ],
    [
      "replies: to some computers",
      { chain: "OUTPUT", destination: "198.51.100.0/24" },
      { direction: "out" },
      "some",
    ],
    [
      "replies: to the other side's port",
      { chain: "OUTPUT", dport: "53" },
      { direction: "out" },
      "cannotTell",
    ],
  ])("%s", (_what, over, t, expected) => {
    expect(fit(over, t)).toBe(expected);
  });
});

describe("11.5, the walk", () => {
  const walkOf = (list: FirewallRule[], t: Partial<Traffic> = {}) =>
    walk(readRules(list), traffic(t));

  it("the end of the list lets in", () => {
    expect(walkOf([])).toEqual({ rest: "letIn", endedBy: null, recorded: [] });
  });

  it.each([
    [
      "Allow for every computer ends it, let in",
      [{ action: "ACCEPT" }, { action: "REJECT" }],
      "letIn",
      1,
    ],
    [
      "Refuse for every computer ends it, blocked",
      [{ action: "REJECT" }, { action: "ACCEPT" }],
      "blocked",
      1,
    ],
    [
      "Ignore for every computer ends it, blocked",
      [{ action: "DROP" }],
      "blocked",
      1,
    ],
    [
      "Note in the log goes on",
      [{ action: "LOG" }, { action: "DROP" }],
      "blocked",
      2,
    ],
    [
      "Count only goes on",
      [{ action: "" }, { action: "ACCEPT" }, { action: "DROP" }],
      "letIn",
      2,
    ],
    [
      "a rule that does not fit is skipped",
      [{ action: "DROP", protocol: "udp" }],
      "letIn",
      null,
    ],
  ] as const)("%s", (_what, list, rest, endedBy) => {
    const w = walkOf(rules(...list));
    expect(w.rest).toBe(rest);
    expect(w.endedBy).toBe(endedBy);
  });

  it("a rule for some computers is recorded and the walk goes on; only those doing the opposite of the rest matter", () => {
    const w = walkOf(
      rules(
        { action: "ACCEPT", source: "198.51.100.0/24" },
        { action: "DROP", source: "203.0.113.0/24" },
        { action: "REJECT" },
      ),
    );
    expect(w.rest).toBe("blocked");
    expect(w.recorded.map((r) => r.position)).toEqual([1]);
  });

  it("rules sort by rulenum, not by the order read", () => {
    const w = walkOf([
      rule({ rulenum: 5, action: "REJECT" }),
      rule({ rulenum: 1, action: "ACCEPT" }),
    ]);
    expect(w).toMatchObject({ rest: "letIn", endedBy: 1 });
  });
});

const PORTS: WebPorts = {
  scheme: "http",
  page: 80,
  others: [],
  othersUnread: false,
};
const SSH_OFF: SshPort = { kind: "off" };
const NAME_ONLY: Connection = {
  kind: "nameOnly",
  host: "nas-host",
  nameForm: "short",
};
const IPV6_PAGE: Connection = {
  kind: "known",
  host: "2001:db8::10",
  iface: "enp2s0",
  address: "2001:db8::10",
  family: 6,
  network: null,
  under: [],
};
const TUNNEL: Connection = { kind: "tunnel", host: "localhost", families: [4] };

const check = (
  list: FirewallRule[],
  connection: Connection = KNOWN,
  ports: WebPorts = PORTS,
  ssh: SshPort = SSH_OFF,
) => checkList(list, 4, { connection, ports, ssh });

describe("11.5, what the rules do to this page", () => {
  it.each<[string, Partial<FirewallRule>[], string, string]>([
    ["no rules: let in", [], "letIn", "none"],
    [
      "allowed for every computer",
      [{ action: "ACCEPT", dport: "80" }, { action: "REJECT" }],
      "letIn",
      "none",
    ],
    [
      "refused for every computer coming in",
      [{ action: "REJECT", dport: "80" }],
      "blockedAll",
      "refused",
    ],
    [
      "every reply going out dropped",
      [{ chain: "OUTPUT", action: "DROP", protocol: "all" }],
      "blockedAll",
      "refused",
    ],
    [
      "Block everything else with nothing above allowing the page",
      [
        { action: "ACCEPT", protocol: "all", extraoptions: SELF_OPTIONS },
        { action: "ACCEPT", protocol: "all", extraoptions: REPLIES_OPTIONS },
        { action: "REJECT", protocol: "all" },
      ],
      "blockedAll",
      "refused",
    ],
    [
      "let in only for some computers, blocked for the rest",
      [
        { action: "ACCEPT", source: "192.0.2.0/24" },
        { action: "REJECT", protocol: "all" },
      ],
      "onlySome",
      "mayCut",
    ],
    [
      "blocked for some computers, let in for the rest",
      [{ action: "DROP", source: "203.0.113.0/24" }],
      "blockedSome",
      "mayCut",
    ],
    [
      "every computer except one refused: some",
      [{ action: "REJECT", source: "!198.51.100.7" }],
      "blockedSome",
      "mayCut",
    ],
    [
      "a rule it cannot tell about decides",
      [{ action: "REJECT", extraoptions: "-m recent --update" }],
      "cannotTell",
      "mayCut",
    ],
    [
      "a far-side port decides",
      [{ action: "ACCEPT", sport: "1024-65535" }, { action: "REJECT" }],
      "cannotTell",
      "mayCut",
    ],
    [
      "a rule it cannot tell about that does not decide",
      [
        { action: "ACCEPT", extraoptions: "-m recent --update" },
        { action: "ACCEPT" },
      ],
      "letIn",
      "none",
    ],
    [
      "Note in the log with other options goes on",
      [{ action: "LOG", extraoptions: "--log-prefix x" }],
      "letIn",
      "none",
    ],
    [
      "a refusal for another port",
      [{ action: "REJECT", dport: "445" }],
      "letIn",
      "none",
    ],
  ])("%s", (_what, list, verdict, impact) => {
    const result = check(rules(...list));
    expect(result.page.verdict.kind).toBe(verdict);
    expect(result.impact).toBe(impact);
    expect(impactOf(result.page.verdict)).toBe(impact);
  });

  it("names the rule it cannot tell about", () => {
    const result = check(
      rules(
        { action: "LOG" },
        { action: "DROP", extraoptions: "-m string --string x" },
      ),
    );
    expect(result.page.verdict).toEqual({
      kind: "cannotTell",
      position: 2,
      reason: "options",
    });
  });

  it("blocked for every computer whatever the NAS's address stays Refused when the page cannot tell its interface", () => {
    expect(
      check(rules({ action: "REJECT", dport: "80" }), NAME_ONLY).impact,
    ).toBe("refused");
  });

  it("a block of the NAS's address is May cut, not Refused, when the page cannot tell its address", () => {
    const result = check(
      rules({ action: "REJECT", destination: "192.0.2.10" }),
      NAME_ONLY,
    );
    expect(result.page.verdict.kind).toBe("blockedSome");
    expect(result.impact).toBe("mayCut");
  });

  it("the same rule is Refused when the page knows it is that address", () => {
    expect(
      check(rules({ action: "REJECT", destination: "192.0.2.10" })).impact,
    ).toBe("refused");
  });

  it("through a tunnel, talking to itself lets the page in before Block everything else", () => {
    const list = rules(
      { action: "ACCEPT", protocol: "all", extraoptions: SELF_OPTIONS },
      { action: "ACCEPT", protocol: "all", extraoptions: REPLIES_OPTIONS },
      { action: "REJECT", protocol: "all" },
    );
    expect(check(list, TUNNEL).impact).toBe("none");
  });

  it("IPv4 rules do not check a page reached over IPv6", () => {
    const result = check(rules({ action: "REJECT" }), IPV6_PAGE);
    expect(result).toMatchObject({
      checked: false,
      impact: "none",
      lines: [{ code: "firewall.ipv6Page" }],
    });
  });

  it("the IPv6 list is checked the same way for a page reached over IPv6", () => {
    const list = rules({
      family: "inet6",
      action: "REJECT",
      destination: "2001:db8::/64",
    });
    const result = checkList(list, 6, {
      connection: IPV6_PAGE,
      ports: PORTS,
      ssh: SSH_OFF,
    });
    expect(result.impact).toBe("refused");
  });

  it("the IPv6 list does not check a page reached over IPv4", () => {
    const result = checkList(rules({ family: "inet6", action: "REJECT" }), 6, {
      connection: KNOWN,
      ports: PORTS,
      ssh: SSH_OFF,
    });
    expect(result).toMatchObject({
      checked: false,
      impact: "none",
      lines: [{ code: "firewall.ipv4Page" }],
    });
  });
});

describe("11.5, the lines", () => {
  it("adds the same-network hint when the page's network is among the allowed", () => {
    const result = check(
      rules({ action: "ACCEPT", source: "192.0.2.0/23" }, { action: "REJECT" }),
    );
    expect(result.lines).toContainEqual({
      code: "firewall.sameNetwork",
      network: "192.0.2.0/24",
    });
  });

  it("adds it for a range that holds the whole network", () => {
    const result = check(
      rules(
        { action: "ACCEPT", source: "192.0.2.0-192.0.2.255" },
        { action: "REJECT" },
      ),
    );
    expect(result.lines).toContainEqual({
      code: "firewall.sameNetwork",
      network: "192.0.2.0/24",
    });
  });

  it.each([
    ["a smaller network", "192.0.2.0/25"],
    ["one computer", "192.0.2.20"],
    ["every computer except the network", "!192.0.2.0/24"],
    ["another network", "198.51.100.0/24"],
  ])("not for %s", (_what, source) => {
    const result = check(
      rules({ action: "ACCEPT", source }, { action: "REJECT" }),
    );
    expect(result.lines.some((l) => l.code === "firewall.sameNetwork")).toBe(
      false,
    );
  });

  it("not when the page cannot tell its interface", () => {
    const result = check(
      rules({ action: "ACCEPT", source: "192.0.2.0/24" }, { action: "REJECT" }),
      NAME_ONLY,
    );
    expect(result.page.verdict.kind).toBe("onlySome");
    expect(result.lines).toEqual([]);
  });

  it("the web interface's other port blocked is a line, not a class", () => {
    const ports: WebPorts = {
      scheme: "https",
      page: 443,
      others: [{ scheme: "http", port: 80 }],
      othersUnread: false,
    };
    const result = check(
      rules({ action: "REJECT", dport: "80" }),
      KNOWN,
      ports,
    );
    expect(result.impact).toBe("none");
    expect(result.lines).toContainEqual({
      code: "firewall.otherScheme",
      scheme: "http",
      current: "https",
    });
  });

  it.each<[string, Partial<FirewallRule>[], string | null]>([
    [
      "blocked for every computer",
      [{ action: "REJECT", dport: "22" }],
      "firewall.sshBlocked",
    ],
    [
      "blocked for some",
      [{ action: "REJECT", dport: "22", source: "203.0.113.0/24" }],
      "firewall.sshSome",
    ],
    [
      "let in only for some",
      [
        { action: "ACCEPT", dport: "22", source: "192.0.2.0/24" },
        { action: "REJECT", dport: "22" },
      ],
      "firewall.sshSome",
    ],
    [
      "a rule it cannot tell about",
      [{ action: "REJECT", dport: "22", sport: "1024-65535" }],
      "firewall.sshSome",
    ],
    ["let in", [{ action: "REJECT", dport: "445" }], null],
  ])("SSH %s: a line, never a refusal", (_what, list, code) => {
    const result = check(rules(...list), KNOWN, PORTS, {
      kind: "on",
      port: 22,
    });
    expect(result.impact).toBe("none");
    const ssh = result.lines.filter((l) => l.code.startsWith("firewall.ssh"));
    expect(ssh.map((l) => l.code)).toEqual(code === null ? [] : [code]);
  });

  it("SSH on its own port", () => {
    const result = check(
      rules({ action: "REJECT", dport: "2222" }),
      KNOWN,
      PORTS,
      { kind: "on", port: 2222 },
    );
    expect(result.lines).toContainEqual({ code: "firewall.sshBlocked" });
  });

  it("SSH not read: says so", () => {
    expect(check([], KNOWN, PORTS, { kind: "unread" }).lines).toContainEqual({
      code: "firewall.sshUnread",
    });
  });

  it("SSH off: no line", () => {
    expect(check(rules({ action: "REJECT", dport: "22" })).lines).toEqual([]);
  });
});

describe("both lists, for the band (1.8)", () => {
  const context = { connection: NAME_ONLY, ports: PORTS, ssh: SSH_OFF };

  it("by name both lists count", () => {
    const both = checkBothLists(
      { 4: ok(rules()), 6: ok(rules({ family: "inet6", action: "REJECT" })) },
      context,
    );
    expect(both.impact).toBe("refused");
    expect(both.lists).toHaveLength(2);
  });

  it("a list the page's family needs that could not be read is May cut", () => {
    const both = checkBothLists({ 4: ok(rules()), 6: failed }, context);
    expect(both).toMatchObject({ impact: "mayCut", unread: [6] });
  });

  it("a list of a family the page does not use, unread, does not matter", () => {
    const both = checkBothLists(
      { 4: ok(rules()), 6: failed },
      { ...context, connection: KNOWN },
    );
    expect(both).toMatchObject({ impact: "none", unread: [] });
  });
});

describe("SSH blocked for every computer, for the SSH page (13.4)", () => {
  const SSH_ON: SshPort = { kind: "on", port: 22 };
  const known = { connection: KNOWN, ports: PORTS, ssh: SSH_ON };

  it("a refusal of port 22 for every computer blocks SSH", () => {
    expect(
      sshBlockedForAll(rules({ action: "REJECT", dport: "22" }), 4, known),
    ).toBe(true);
  });

  it("a refusal for some computers, or of another port, does not", () => {
    expect(
      sshBlockedForAll(
        rules({ action: "REJECT", dport: "22", source: "203.0.113.0/24" }),
        4,
        known,
      ),
    ).toBe(false);
    expect(
      sshBlockedForAll(rules({ action: "REJECT", dport: "80" }), 4, known),
    ).toBe(false);
  });

  it("checks a list of the family the page does not use too", () => {
    expect(
      sshBlockedForAll(
        rules({ family: "inet6", action: "DROP", dport: "22" }),
        6,
        known,
      ),
    ).toBe(true);
  });

  it("says nothing when SSH is off or was not read", () => {
    const list = rules({ action: "REJECT", dport: "22" });
    expect(sshBlockedForAll(list, 4, { ...known, ssh: SSH_OFF })).toBe(false);
    expect(
      sshBlockedForAll(list, 4, { ...known, ssh: { kind: "unread" } }),
    ).toBe(false);
  });
});
