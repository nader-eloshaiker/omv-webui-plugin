// SPDX-License-Identifier: GPL-3.0-or-later
// network/firewallModel.ts: reading a stored rule's fields (11.2), the dialog's draft and checks
// (11.4, 0.8), the bodies of setRule and setRules (0.9), order (11.7) and Block everything else (11.6).
import { describe, expect, it } from "vitest";
import { NEW_OBJECT_UUID } from "./dto.ts";
import {
  allowPageDraft,
  blockEverythingElseRules,
  changedRuleRequest,
  checkPortText,
  checkRuleDraft,
  draftOf,
  moveRule,
  NEW_RULE_DRAFT,
  newRuleRequest,
  offersBlockEverythingElse,
  parseAddressSpec,
  parseOptions,
  parsePort,
  parseProtocol,
  placeRule,
  readRule,
  replaceRule,
  REPLIES_OPTIONS,
  sameRules,
  SELF_OPTIONS,
  setRulesRequest,
  sortRules,
  withoutRule,
  type RuleDraft,
} from "./firewallModel.ts";
import { rule, rules } from "./fixtures.testing.ts";

describe("reading a stored rule (11.2)", () => {
  it.each([
    ["tcp", { kind: "known", negated: false, name: "tcp" }],
    ["!tcp", { kind: "known", negated: true, name: "tcp" }],
    ["! udp", { kind: "known", negated: true, name: "udp" }],
    ["ALL", { kind: "known", negated: false, name: "all" }],
    ["icmpv6", { kind: "known", negated: false, name: "icmpv6" }],
    ["6", { kind: "classic", text: "6" }],
  ])("the kind %j", (text, expected) => {
    expect(parseProtocol(text)).toEqual(expected);
  });

  it.each([
    ["", { kind: "any" }],
    ["22", { kind: "ports", negated: false, from: 22, to: 22 }],
    ["1024-65535", { kind: "ports", negated: false, from: 1024, to: 65535 }],
    ["1024:65535", { kind: "ports", negated: false, from: 1024, to: 65535 }],
    ["!22", { kind: "ports", negated: true, from: 22, to: 22 }],
    ["65536", { kind: "classic", text: "65536" }],
    ["30-20", { kind: "classic", text: "30-20" }],
    ["ssh", { kind: "classic", text: "ssh" }],
    ["22,80", { kind: "classic", text: "22,80" }],
  ])("the port %j", (text, expected) => {
    expect(parsePort(text)).toEqual(expected);
  });

  it.each([
    ["", "any"],
    ["192.0.2.10", "address"],
    ["!192.0.2.10", "address"],
    ["192.0.2.0/24", "network"],
    ["192.0.2.0/255.255.255.0", "network"],
    ["192.0.2.10-192.0.2.20", "range"],
    ["! 192.0.2.10-192.0.2.20", "range"],
    ["files.example.org", "classic"],
    ["192.0.2.0/33", "classic"],
    ["2001:db8::1", "classic"],
    ["192.0.2.1,192.0.2.2", "classic"],
  ])("the IPv4 list's address %j is %s", (text, kind) => {
    expect(parseAddressSpec(text, 4).kind).toBe(kind);
  });

  it("an IPv6 network on the IPv6 list", () => {
    expect(parseAddressSpec("2001:db8::/32", 6)).toMatchObject({
      kind: "network",
      negated: false,
    });
  });

  it.each([
    ["", { kind: "none" }],
    [SELF_OPTIONS, { kind: "self" }],
    [REPLIES_OPTIONS, { kind: "replies" }],
    [
      "-m conntrack --ctstate RELATED,ESTABLISHED",
      { kind: "classic", text: "-m conntrack --ctstate RELATED,ESTABLISHED" },
    ],
  ])("other options %j", (text, expected) => {
    expect(parseOptions(text)).toEqual(expected);
  });

  it("coming in, the NAS is the destination; going out, the source", () => {
    const inRule = readRule(
      rule({
        source: "198.51.100.1",
        destination: "192.0.2.10",
        sport: "1024",
        dport: "80",
      }),
      1,
    );
    expect(inRule).toMatchObject({
      direction: "in",
      other: { kind: "address" },
      nasSide: { kind: "address" },
      nasPort: { from: 80 },
      otherPort: { from: 1024 },
    });
    const outRule = readRule(
      rule({
        chain: "OUTPUT",
        source: "192.0.2.10",
        destination: "198.51.100.1",
        sport: "80",
        dport: "1024",
      }),
      1,
    );
    expect(outRule).toMatchObject({
      direction: "out",
      nasPort: { from: 80 },
      otherPort: { from: 1024 },
    });
  });

  it.each([
    ["ACCEPT", "accept"],
    ["REJECT", "reject"],
    ["DROP", "drop"],
    ["LOG", "log"],
    ["", "count"],
    ["RETURN", null],
  ])("the action %j", (action, expected) => {
    expect(readRule(rule({ action }), 1).action).toBe(expected);
  });

  it("sorts by rulenum, equal numbers in the order read", () => {
    const a = rule({ rulenum: 2, comment: "a" });
    const b = rule({ rulenum: 0, comment: "b" });
    const c = rule({ rulenum: 2, comment: "c" });
    expect(sortRules([a, b, c]).map((r) => r.comment)).toEqual(["b", "a", "c"]);
  });
});

describe("the dialog's draft and checks (11.4, 0.8)", () => {
  const draft = (over: Partial<RuleDraft>): RuleDraft => ({
    ...NEW_RULE_DRAFT,
    action: "accept",
    ...over,
  });

  it("a new rule has no action chosen", () => {
    expect(checkRuleDraft(NEW_RULE_DRAFT, 4)).toEqual([
      { field: "action", code: "fwRule.err.then" },
    ]);
  });

  it.each<[string, Partial<RuleDraft>, string[]]>([
    ["a port", { port: { kind: "text", text: "22" } }, []],
    ["a range", { port: { kind: "text", text: "1024-65535" } }, []],
    ["port 0", { port: { kind: "text", text: "0" } }, ["fwRule.err.port"]],
    [
      "port 65536",
      { port: { kind: "text", text: "65536" } },
      ["fwRule.err.port"],
    ],
    [
      "a range backwards",
      { port: { kind: "text", text: "30-20" } },
      ["fwRule.err.port"],
    ],
    [
      "the iptables form",
      { port: { kind: "text", text: "1:2" } },
      ["fwRule.err.port"],
    ],
    ["a name", { port: { kind: "text", text: "ssh" } }, ["fwRule.err.port"]],
    [
      "a negated port typed",
      { port: { kind: "text", text: "!22" } },
      ["fwRule.err.port"],
    ],
    [
      "a port with ping",
      { kind: { kind: "icmp" }, port: { kind: "text", text: "22" } },
      ["fwRule.portOnlyTcpUdp"],
    ],
    [
      "a port with any kind",
      { kind: { kind: "all" }, port: { kind: "text", text: "22" } },
      ["fwRule.portOnlyTcpUdp"],
    ],
    [
      "a port with a classic not-TCP",
      {
        kind: { kind: "classic", text: "!tcp" },
        port: { kind: "text", text: "22" },
      },
      ["fwRule.portOnlyTcpUdp"],
    ],
    [
      "UDP and a port",
      { kind: { kind: "udp" }, port: { kind: "text", text: "53" } },
      [],
    ],
    ["one computer", { other: { kind: "one", text: "198.51.100.7" } }, []],
    [
      "one computer of IPv6 on the IPv4 list",
      { other: { kind: "one", text: "2001:db8::7" } },
      ["fwRule.err.address"],
    ],
    [
      "a name for one computer",
      { other: { kind: "one", text: "files.example.org" } },
      ["fwRule.err.address"],
    ],
    ["a network", { other: { kind: "network", text: "198.51.100.0/24" } }, []],
    [
      "a network that is an address",
      { other: { kind: "network", text: "198.51.100.7" } },
      ["fwRule.err.address"],
    ],
    [
      "a negated network typed",
      { other: { kind: "network", text: "!198.51.100.0/24" } },
      ["fwRule.err.address"],
    ],
    [
      "a range",
      { other: { kind: "range", first: "198.51.100.1", last: "198.51.100.9" } },
      [],
    ],
    [
      "a range backwards",
      { other: { kind: "range", first: "198.51.100.9", last: "198.51.100.1" } },
      ["fwRule.err.range"],
    ],
    [
      "a range not of addresses",
      { other: { kind: "range", first: "x", last: "198.51.100.1" } },
      ["fwRule.err.address"],
    ],
    [
      "a classic value kept",
      { other: { kind: "classic", text: "!198.51.100.7" } },
      [],
    ],
  ])("%s", (_what, over, codes) => {
    expect(checkRuleDraft(draft(over), 4).map((p) => p.code)).toEqual(codes);
  });

  it("a stored rule's draft keeps what the choices cannot show", () => {
    const stored = rule({
      protocol: "!tcp",
      source: "!198.51.100.7",
      sport: "1024-65535",
      destination: "192.0.2.10",
      extraoptions: "-m limit",
      action: "",
    });
    expect(draftOf(stored)).toEqual({
      direction: "in",
      action: "count",
      kind: { kind: "classic", text: "!tcp" },
      port: { kind: "any" },
      other: { kind: "classic", text: "!198.51.100.7" },
      otherPort: "1024-65535",
      nasSide: "192.0.2.10",
      extraoptions: "-m limit",
      comment: "",
    });
  });

  it.each([
    [rule({ dport: "22" }), { kind: "text", text: "22" }],
    [rule({ dport: "!22" }), { kind: "classic", text: "!22" }],
    [
      rule({ chain: "OUTPUT", sport: "80", dport: "53" }),
      { kind: "text", text: "80" },
    ],
  ])("the port of %o", (stored, port) => {
    expect(draftOf(stored).port).toEqual(port);
  });

  it.each([
    ["22", true],
    [" 1024-65535 ", true],
    ["1-65535", true],
    ["0", false],
    ["70000", false],
    ["", false],
  ])("checkPortText(%j)", (text, expected) => {
    expect(checkPortText(text)).toBe(expected);
  });
});

describe("writing back (0.9)", () => {
  it("a new rule: rulenum -1, the new-object identifier, family inet, no other options", () => {
    const request = newRuleRequest(
      {
        ...NEW_RULE_DRAFT,
        action: "reject",
        port: { kind: "text", text: "445" },
        other: { kind: "network", text: "203.0.113.0/24" },
        comment: "No sharing from there",
      },
      4,
    );
    expect(request).toEqual({
      uuid: NEW_OBJECT_UUID,
      rulenum: -1,
      chain: "INPUT",
      action: "REJECT",
      family: "inet",
      source: "203.0.113.0/24",
      sport: "",
      destination: "",
      dport: "445",
      protocol: "tcp",
      extraoptions: "",
      comment: "No sharing from there",
    });
  });

  it("a rule going out: the NAS's port is the source port, the other computer the destination", () => {
    const request = newRuleRequest(
      {
        ...NEW_RULE_DRAFT,
        direction: "out",
        action: "drop",
        kind: { kind: "udp" },
        port: { kind: "text", text: "53" },
        other: { kind: "one", text: "198.51.100.53" },
      },
      4,
    );
    expect(request).toMatchObject({
      chain: "OUTPUT",
      sport: "53",
      dport: "",
      destination: "198.51.100.53",
      source: "",
      protocol: "udp",
    });
  });

  it("ping on the IPv6 list is icmpv6", () => {
    expect(
      newRuleRequest(
        { ...NEW_RULE_DRAFT, action: "accept", kind: { kind: "icmp" } },
        6,
      ),
    ).toMatchObject({ protocol: "icmpv6", family: "inet6" });
  });

  it("refuses to write a draft that did not pass its checks", () => {
    expect(() => newRuleRequest(NEW_RULE_DRAFT, 4)).toThrow(Error);
  });

  it("a changed rule is the rule as read with only the changed fields", () => {
    const stored = rule({
      rulenum: 3,
      comment: "old",
      sport: "1024-65535",
      extraoptions: "-m limit",
    });
    const request = changedRuleRequest(stored, {
      ...draftOf(stored),
      comment: "new",
    });
    expect(request).toEqual({ ...stored, comment: "new" });
  });

  it("a classic value removed by the reader is sent empty", () => {
    const stored = rule({ sport: "1024-65535" });
    expect(
      changedRuleRequest(stored, { ...draftOf(stored), otherPort: "" }).sport,
    ).toBe("");
  });

  it("setRules: every field as read, renumbered 0 to n-1 in the new order", () => {
    const list = [
      rule({ rulenum: 4, comment: "a" }),
      rule({ rulenum: 9, comment: "b" }),
    ];
    const write = setRulesRequest(moveRule(list, 0, 1), 4);
    expect(write.ok).toBe(true);
    if (write.ok) {
      expect(write.family).toBe(4);
      expect(
        write.request.map((r) => [r.comment, r.rulenum, r.uuid, r.family]),
      ).toEqual([
        ["b", 0, list[1]?.uuid, "inet"],
        ["a", 1, list[0]?.uuid, "inet"],
      ]);
    }
  });

  it("setRules6 for the IPv6 list", () => {
    const write = setRulesRequest(
      rules({ family: "inet6", protocol: "icmpv6" }),
      6,
    );
    expect(write).toMatchObject({
      ok: true,
      family: 6,
      request: [{ family: "inet6", rulenum: 0 }],
    });
  });

  it.each([
    ["a chain OMV does not write", { chain: "FORWARD" }],
    ["an action OMV does not write", { action: "RETURN" }],
    ["a rule of the other list", { family: "inet6" }],
  ])("setRules refuses to send back %s, naming its position", (_what, over) => {
    expect(setRulesRequest(rules({}, over), 4)).toEqual({
      ok: false,
      position: 2,
    });
  });

  it.each([
    [{ kind: "end" }, ["a", "b", "new"]],
    [{ kind: "top" }, ["new", "a", "b"]],
    [{ kind: "before", position: 2 }, ["a", "new", "b"]],
    [{ kind: "before", position: 9 }, ["a", "b", "new"]],
  ] as const)("places a new rule %o", (where, order) => {
    const list = rules({ comment: "a" }, { comment: "b" });
    expect(
      placeRule(list, rule({ comment: "new" }), where).map((r) => r.comment),
    ).toEqual(order);
  });

  it("replaces and removes one rule", () => {
    const list = rules({ comment: "a" }, { comment: "b" });
    const changed = { ...list[1]!, comment: "B" };
    expect(replaceRule(list, changed).map((r) => r.comment)).toEqual([
      "a",
      "B",
    ]);
    expect(withoutRule(list, list[0]!.uuid).map((r) => r.comment)).toEqual([
      "b",
    ]);
  });

  it.each([
    [0, -1, ["a", "b", "c"]],
    [0, 1, ["b", "a", "c"]],
    [2, 1, ["a", "b", "c"]],
    [2, -1, ["a", "c", "b"]],
  ] as const)("moves rule %i by %i on the page only", (index, by, order) => {
    const list = rules({ comment: "a" }, { comment: "b" }, { comment: "c" });
    expect(moveRule(list, index, by).map((r) => r.comment)).toEqual(order);
    expect(list.map((r) => r.comment)).toEqual(["a", "b", "c"]);
  });

  it("two reads of the same list are the same; a changed field or order is not", () => {
    const list = rules({ comment: "a" }, { comment: "b" });
    expect(sameRules(list, [...list].reverse())).toBe(true);
    expect(sameRules(list, [list[0]!, { ...list[1]!, comment: "x" }])).toBe(
      false,
    );
    expect(sameRules(list, [list[0]!])).toBe(false);
  });
});

describe("Block everything else (11.6)", () => {
  it("adds the two fixed rules and then refuses the rest", () => {
    expect(
      blockEverythingElseRules(4).map((r) => [
        r.chain,
        r.action,
        r.protocol,
        r.extraoptions,
        r.rulenum,
        r.family,
      ]),
    ).toEqual([
      ["INPUT", "ACCEPT", "all", "-i lo", -1, "inet"],
      [
        "INPUT",
        "ACCEPT",
        "all",
        "-m conntrack --ctstate ESTABLISHED,RELATED",
        -1,
        "inet",
      ],
      ["INPUT", "REJECT", "all", "", -1, "inet"],
    ]);
  });

  it.each([
    [[], true],
    [rules({ action: "ACCEPT" }), true],
    [rules({ action: "REJECT", protocol: "all" }), false],
    [rules({ action: "DROP", protocol: "all" }), false],
    [rules({ action: "REJECT", protocol: "tcp" }), true],
    [
      rules({ action: "REJECT", protocol: "all", source: "198.51.100.0/24" }),
      true,
    ],
    [rules({ action: "REJECT", protocol: "all" }, { action: "ACCEPT" }), true],
    [rules({ chain: "OUTPUT", action: "REJECT", protocol: "all" }), true],
  ])("offered for %o: %s", (list, expected) => {
    expect(offersBlockEverythingElse(list)).toBe(expected);
  });

  it("Allow this page for its network: Allow, TCP, this page's port, the network, at the top", () => {
    const { draft, where } = allowPageDraft(
      { family: 4, start: 0xc0000200n, prefix: 24 },
      443,
    );
    expect(where).toEqual({ kind: "top" });
    expect(draft).toMatchObject({
      direction: "in",
      action: "accept",
      kind: { kind: "tcp" },
      port: { kind: "text", text: "443" },
      other: { kind: "network", text: "192.0.2.0/24" },
    });
    expect(checkRuleDraft(draft, 4)).toEqual([]);
  });
});
