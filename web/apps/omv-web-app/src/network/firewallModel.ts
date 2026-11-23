// SPDX-License-Identifier: GPL-3.0-or-later
// Firewall rules (phase 5 network design 11.2, 11.4, 11.6, 11.7, 0.8, 0.9): what each stored field
// means, the add-or-change dialog's draft and its checks, and the bodies of Iptables.setRule and
// setRules. The walk that says what the rules do to this page is in firewallCheck.ts; the words in
// ruleWords.ts. Pure.
//
// Read from OMV's source (8.6.x): a rule's from and to are one address, a network, a range or empty
// (any), each optionally preceded by "!"; a port is one port or a range, optionally with "!"; a port
// needs TCP or UDP; `rulenum` -1 adds a rule at the end; setRules replaces the whole list and gives
// every rule a new identifier. OMV checks none of the free-text fields, so a stored value this file
// cannot read is "classic": shown as stored and kept, never rewritten silently (P10).
import {
  NEW_OBJECT_UUID,
  type FirewallRule,
  type SetRuleRequest,
  type SetRules6Request,
  type SetRulesRequest,
} from "./dto.ts";
import {
  formatNetwork,
  networkOf,
  parseAddress,
  parseNetwork,
  parseNetworkSize,
  parseRange,
  type Family,
  type IpAddress,
  type IpNetwork,
  type IpRange,
} from "./ip.ts";

/** Coming in (`INPUT`) or going out (`OUTPUT`). */
export type Direction = "in" | "out";
/** Allow, Refuse, Ignore, Note in the log, Count only (the empty action). */
export type RuleAction = "accept" | "reject" | "drop" | "log" | "count";
/** The kinds of traffic this interface writes. */
export type Kind = "tcp" | "udp" | "icmp" | "all";

const CHAINS = { INPUT: "in", OUTPUT: "out" } as const satisfies Record<
  string,
  Direction
>;
const ACTIONS = {
  ACCEPT: "accept",
  REJECT: "reject",
  DROP: "drop",
  LOG: "log",
  "": "count",
} as const satisfies Record<string, RuleAction>;

/** 11.6's two fixed other options, recognised by their exact value. */
export const SELF_OPTIONS = "-i lo";
export const REPLIES_OPTIONS = "-m conntrack --ctstate ESTABLISHED,RELATED";

/** The list a rule belongs to. */
export const familyOf = (family: Family): "inet" | "inet6" =>
  family === 4 ? "inet" : "inet6";

// ---- Reading a stored rule -----------------------------------------------------------------------

export type ProtocolSpec =
  | {
      kind: "known";
      negated: boolean;
      name: "tcp" | "udp" | "icmp" | "icmpv6" | "all";
    }
  /** A protocol this file does not know (a number, sctp…): "(set in the classic interface)". */
  | { kind: "classic"; text: string };

export type PortSpec =
  | { kind: "any" }
  | { kind: "ports"; negated: boolean; from: number; to: number }
  | { kind: "classic"; text: string };

export type AddressSpec =
  | { kind: "any" }
  | { kind: "address"; negated: boolean; address: IpAddress }
  | { kind: "network"; negated: boolean; network: IpNetwork }
  | { kind: "range"; negated: boolean; range: IpRange }
  /** A name, a list, an address of the other family…: kept as stored. */
  | { kind: "classic"; text: string };

export type OptionsSpec =
  | { kind: "none" }
  /** `-i lo`: this NAS talking to itself. */
  | { kind: "self" }
  /** `-m conntrack --ctstate ESTABLISHED,RELATED`: replies to connections this NAS starts. */
  | { kind: "replies" }
  | { kind: "classic"; text: string };

/** A stored rule, read field by field, from the NAS's side: its port, its address, the other computer. */
export interface ReadRule {
  /** Its place in the list, 1 first. */
  position: number;
  rule: FirewallRule;
  /** Null for a chain other than INPUT or OUTPUT (not one OMV writes). */
  direction: Direction | null;
  /** Null for an action OMV does not write. */
  action: RuleAction | null;
  protocol: ProtocolSpec;
  /** The NAS's port: `dport` coming in, `sport` going out. */
  nasPort: PortSpec;
  /** The other computer's port: `sport` coming in, `dport` going out. */
  otherPort: PortSpec;
  /** The NAS's address: `destination` coming in, `source` going out. */
  nasSide: AddressSpec;
  /** The other computer: `source` coming in, `destination` going out. */
  other: AddressSpec;
  options: OptionsSpec;
}

/** "!" in front of a value, with or without a space. */
function negation(raw: string): { negated: boolean; text: string } {
  const text = raw.trim();
  return text.startsWith("!")
    ? { negated: true, text: text.slice(1).trim() }
    : { negated: false, text };
}

const PORT = /^(?:0|[1-9][0-9]{0,4})$/u;

export function parseProtocol(raw: string): ProtocolSpec {
  const { negated, text } = negation(raw.toLowerCase());
  return text === "tcp" ||
    text === "udp" ||
    text === "icmp" ||
    text === "icmpv6" ||
    text === "all"
    ? { kind: "known", negated, name: text }
    : { kind: "classic", text: raw };
}

/** One port or a range ("1024-65535", or iptables' "1024:65535"), optionally with "!". */
export function parsePort(raw: string): PortSpec {
  if (raw.trim() === "") {
    return { kind: "any" };
  }
  const { negated, text } = negation(raw);
  const parts = text.split(/[-:]/u);
  if (parts.length > 2 || !parts.every((p) => PORT.test(p.trim()))) {
    return { kind: "classic", text: raw };
  }
  const from = Number(parts[0]);
  const to = Number(parts[1] ?? parts[0]);
  if (from > 65535 || to > 65535 || from > to) {
    return { kind: "classic", text: raw };
  }
  return { kind: "ports", negated, from, to };
}

/** One address, a network ("192.0.2.0/24" or "192.0.2.0/255.255.255.0"), a range, or empty; of the list's family. */
export function parseAddressSpec(raw: string, family: Family): AddressSpec {
  if (raw.trim() === "") {
    return { kind: "any" };
  }
  const { negated, text } = negation(raw);
  const classic = { kind: "classic", text: raw } as const;
  const address = parseAddress(text);
  if (address !== null) {
    return address.family === family
      ? { kind: "address", negated, address }
      : classic;
  }
  if (text.includes("/")) {
    const network = parseNetwork(text);
    if (network !== null) {
      return network.family === family
        ? {
            kind: "network",
            negated,
            network: networkOf(network.family, network.address, network.prefix),
          }
        : classic;
    }
    const [base, mask] = text.split("/");
    const baseAddress = parseAddress(base ?? "");
    const prefix = family === 4 ? parseNetworkSize(mask ?? "") : null;
    if (
      baseAddress !== null &&
      baseAddress.family === 4 &&
      family === 4 &&
      prefix !== null &&
      (mask ?? "").includes(".")
    ) {
      return {
        kind: "network",
        negated,
        network: networkOf(4, BigInt(baseAddress.value), prefix),
      };
    }
    return classic;
  }
  const range = parseRange(text);
  if (range.ok) {
    return range.range.family === family
      ? { kind: "range", negated, range: range.range }
      : classic;
  }
  return classic;
}

export function parseOptions(raw: string): OptionsSpec {
  if (raw.trim() === "") {
    return { kind: "none" };
  }
  if (raw === SELF_OPTIONS) {
    return { kind: "self" };
  }
  if (raw === REPLIES_OPTIONS) {
    return { kind: "replies" };
  }
  return { kind: "classic", text: raw };
}

/** The list family a stored rule belongs to; IPv4 unless it says inet6. */
const ruleFamily = (rule: Pick<FirewallRule, "family">): Family =>
  rule.family === "inet6" ? 6 : 4;

/** A stored rule read field by field (11.2). `position` is its place in the sorted list, 1 first. */
export function readRule(rule: FirewallRule, position: number): ReadRule {
  const direction =
    rule.chain in CHAINS ? CHAINS[rule.chain as keyof typeof CHAINS] : null;
  const action =
    rule.action in ACTIONS
      ? ACTIONS[rule.action as keyof typeof ACTIONS]
      : null;
  const family = ruleFamily(rule);
  // Going out, the NAS is the source; coming in (or a chain this file does not know), the destination.
  const out = direction === "out";
  return {
    position,
    rule,
    direction,
    action,
    protocol: parseProtocol(rule.protocol),
    nasPort: parsePort(out ? rule.sport : rule.dport),
    otherPort: parsePort(out ? rule.dport : rule.sport),
    nasSide: parseAddressSpec(out ? rule.source : rule.destination, family),
    other: parseAddressSpec(out ? rule.destination : rule.source, family),
    options: parseOptions(rule.extraoptions),
  };
}

/** The rules in OMV's order: by `rulenum` (11.1), equal numbers in the order read. */
export function sortRules<T extends Pick<FirewallRule, "rulenum">>(
  rules: readonly T[],
): T[] {
  return rules
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => a.rule.rulenum - b.rule.rulenum || a.index - b.index)
    .map(({ rule }) => rule);
}

/** Every rule, sorted and read. */
export const readRules = (rules: readonly FirewallRule[]): ReadRule[] =>
  sortRules(rules).map((rule, i) => readRule(rule, i + 1));

// ---- The dialog's draft (11.4) -------------------------------------------------------------------

/** The other computer as the dialog holds it (ClientField with the range choice). */
export type OtherDraft =
  | { kind: "any" }
  | { kind: "one"; text: string }
  | { kind: "network"; text: string }
  | { kind: "range"; first: string; last: string }
  /** A stored value the choices cannot show ("!" values among them): kept as stored. */
  | { kind: "classic"; text: string };

/** The kind of traffic: one of the four, or a stored value kept ("!tcp" and the like). */
export type KindDraft = { kind: Kind } | { kind: "classic"; text: string };

/** The port: any, one port or range as typed (a known port is its number), or a stored value kept. */
export type PortDraft =
  | { kind: "any" }
  | { kind: "text"; text: string }
  | { kind: "classic"; text: string };

export interface RuleDraft {
  direction: Direction;
  /** None preselected for a new rule (D10). */
  action: RuleAction | null;
  kind: KindDraft;
  port: PortDraft;
  other: OtherDraft;
  /** Shown only when set in the classic interface, kept unless removed (11.4 item 6): "" is none. */
  otherPort: string;
  nasSide: string;
  extraoptions: string;
  comment: string;
}

/** A new rule's draft: coming in, no action, TCP, any port, any computer. */
export const NEW_RULE_DRAFT: RuleDraft = {
  direction: "in",
  action: null,
  kind: { kind: "tcp" },
  port: { kind: "any" },
  other: { kind: "any" },
  otherPort: "",
  nasSide: "",
  extraoptions: "",
  comment: "",
};

const kindDraftOf = (protocol: string): KindDraft => {
  const spec = parseProtocol(protocol);
  if (spec.kind === "known" && !spec.negated) {
    return { kind: spec.name === "icmpv6" ? "icmp" : spec.name };
  }
  return { kind: "classic", text: protocol };
};

const otherDraftOf = (raw: string, family: Family): OtherDraft => {
  const spec = parseAddressSpec(raw, family);
  switch (spec.kind) {
    case "any":
      return { kind: "any" };
    case "address":
      return spec.negated
        ? { kind: "classic", text: raw }
        : { kind: "one", text: raw.trim() };
    case "network":
      return spec.negated
        ? { kind: "classic", text: raw }
        : { kind: "network", text: raw.trim() };
    case "range": {
      if (spec.negated) {
        return { kind: "classic", text: raw };
      }
      const [first, last] = raw.trim().split("-");
      return {
        kind: "range",
        first: (first ?? "").trim(),
        last: (last ?? "").trim(),
      };
    }
    case "classic":
      return { kind: "classic", text: raw };
  }
};

/** The dialog's draft for a stored rule (11.4, "Change rule {{n}}"). */
export function draftOf(rule: FirewallRule): RuleDraft {
  const read = readRule(rule, 1);
  const family = ruleFamily(rule);
  const out = read.direction === "out";
  const portText = out ? rule.sport : rule.dport;
  const port = parsePort(portText);
  return {
    direction: out ? "out" : "in",
    action: read.action,
    kind: kindDraftOf(rule.protocol),
    port:
      port.kind === "any"
        ? { kind: "any" }
        : port.kind === "ports" && !port.negated
          ? { kind: "text", text: portText.trim() }
          : { kind: "classic", text: portText },
    other: otherDraftOf(out ? rule.destination : rule.source, family),
    otherPort: out ? rule.dport : rule.sport,
    nasSide: out ? rule.source : rule.destination,
    extraoptions: rule.extraoptions,
    comment: rule.comment,
  };
}

// ---- The dialog's checks (0.8, 11.10 `fwRule.err.*`) ------------------------------------------------

export type RuleProblem =
  /** `fwRule.err.then` */
  | { field: "action"; code: "fwRule.err.then" }
  /** `fwRule.err.port` */
  | { field: "port"; code: "fwRule.err.port" }
  /** A port with a kind other than TCP or UDP: `fwRule.portOnlyTcpUdp`. */
  | { field: "port"; code: "fwRule.portOnlyTcpUdp" }
  /** `fwRule.err.address` */
  | { field: "other"; code: "fwRule.err.address" }
  /** `fwRule.err.range` */
  | { field: "other"; code: "fwRule.err.range" };

const portTakesKind = (kind: KindDraft): boolean => {
  if (kind.kind === "tcp" || kind.kind === "udp") {
    return true;
  }
  if (kind.kind !== "classic") {
    return false;
  }
  const spec = parseProtocol(kind.text);
  return (
    spec.kind === "known" &&
    !spec.negated &&
    (spec.name === "tcp" || spec.name === "udp")
  );
};

/** One port from 1 to 65535, or a range "a-b" of them, first not after last (what this interface writes). */
export function checkPortText(text: string): boolean {
  if (!/^\s*[0-9]+(?:-[0-9]+)?\s*$/u.test(text)) {
    return false;
  }
  const spec = parsePort(text);
  return (
    spec.kind === "ports" && !spec.negated && spec.from >= 1 && spec.to <= 65535
  );
}

const otherValue = (
  other: OtherDraft,
  family: Family,
): string | RuleProblem => {
  switch (other.kind) {
    case "any":
      return "";
    case "classic":
      return other.text;
    case "one": {
      const address = parseAddress(other.text.trim());
      return address !== null && address.family === family
        ? other.text.trim()
        : { field: "other", code: "fwRule.err.address" };
    }
    case "network": {
      const spec = parseAddressSpec(other.text.trim(), family);
      return spec.kind === "network" &&
        !spec.negated &&
        !other.text.includes("!")
        ? other.text.trim()
        : { field: "other", code: "fwRule.err.address" };
    }
    case "range": {
      const text = `${other.first.trim()}-${other.last.trim()}`;
      const range = parseRange(text);
      if (!range.ok) {
        return range.reason === "order"
          ? { field: "other", code: "fwRule.err.range" }
          : { field: "other", code: "fwRule.err.address" };
      }
      return range.range.family === family
        ? text
        : { field: "other", code: "fwRule.err.address" };
    }
  }
};

/** Every problem of a draft, in the dialog's field order. */
export function checkRuleDraft(
  draft: RuleDraft,
  family: Family,
): RuleProblem[] {
  const problems: RuleProblem[] = [];
  if (draft.action === null) {
    problems.push({ field: "action", code: "fwRule.err.then" });
  }
  if (draft.port.kind !== "any") {
    if (!portTakesKind(draft.kind)) {
      problems.push({ field: "port", code: "fwRule.portOnlyTcpUdp" });
    } else if (draft.port.kind === "text" && !checkPortText(draft.port.text)) {
      problems.push({ field: "port", code: "fwRule.err.port" });
    }
  }
  const other = otherValue(draft.other, family);
  if (typeof other !== "string") {
    problems.push(other);
  }
  return problems;
}

// ---- Writing back (0.9) --------------------------------------------------------------------------

type ChainValue = "INPUT" | "OUTPUT";
type ActionValue = "ACCEPT" | "REJECT" | "DROP" | "LOG" | "";
const CHAIN_VALUES: readonly ChainValue[] = ["INPUT", "OUTPUT"];
const ACTION_VALUES: readonly ActionValue[] = [
  "ACCEPT",
  "REJECT",
  "DROP",
  "LOG",
  "",
];

const ACTION_VALUE = {
  accept: "ACCEPT",
  reject: "REJECT",
  drop: "DROP",
  log: "LOG",
  count: "",
} as const satisfies Record<RuleAction, ActionValue>;

/** A rule's fields both lists' requests share, typed as the contract takes them. */
interface WritableFields {
  uuid: string;
  rulenum: number;
  chain: ChainValue;
  action: ActionValue;
  source: string;
  sport: string;
  destination: string;
  dport: string;
  protocol: string;
  extraoptions: string;
  comment: string;
}

/** The request for one list's family. */
const withFamily = (family: Family, fields: WritableFields): SetRuleRequest =>
  family === 4 ? { ...fields, family: "inet" } : { ...fields, family: "inet6" };

const kindValue = (kind: KindDraft, family: Family): string => {
  if (kind.kind === "classic") {
    return kind.text;
  }
  return kind.kind === "icmp" && family === 6 ? "icmpv6" : kind.kind;
};

/** A rule's fields from a draft that passed checkRuleDraft; throws for one that did not (a bug). */
function fieldsOf(
  draft: RuleDraft,
  family: Family,
): Omit<WritableFields, "uuid" | "rulenum"> {
  const other = otherValue(draft.other, family);
  if (
    draft.action === null ||
    typeof other !== "string" ||
    checkRuleDraft(draft, family).length > 0
  ) {
    throw new Error(
      "A firewall rule draft was written without passing its checks.",
    );
  }
  const port =
    draft.port.kind === "any"
      ? ""
      : draft.port.kind === "text"
        ? draft.port.text.trim()
        : draft.port.text;
  const out = draft.direction === "out";
  return {
    chain: out ? "OUTPUT" : "INPUT",
    action: ACTION_VALUE[draft.action],
    source: out ? draft.nasSide : other,
    sport: out ? port : draft.otherPort,
    destination: out ? other : draft.nasSide,
    dport: out ? draft.otherPort : port,
    protocol: kindValue(draft.kind, family),
    extraoptions: draft.extraoptions,
    comment: draft.comment,
  };
}

/** Iptables.setRule for a new rule at the end: `rulenum` -1 (0.9). */
export const newRuleRequest = (
  draft: RuleDraft,
  family: Family,
): SetRuleRequest =>
  withFamily(family, {
    uuid: NEW_OBJECT_UUID,
    rulenum: -1,
    ...fieldsOf(draft, family),
  });

/** Iptables.setRule for a changed rule: as getRule returned it, with the draft's fields (0.9). */
export const changedRuleRequest = (
  read: FirewallRule,
  draft: RuleDraft,
): SetRuleRequest =>
  withFamily(ruleFamily(read), {
    uuid: read.uuid,
    rulenum: read.rulenum,
    ...fieldsOf(draft, ruleFamily(read)),
  });

export type RulesWrite =
  | { ok: true; family: 4; request: SetRulesRequest }
  | { ok: true; family: 6; request: SetRules6Request }
  /** A stored rule this page cannot send back as read (a chain, action or family OMV does not write). */
  | { ok: false; position: number };

/**
 * Iptables.setRules (or setRules6): the whole list, every field as read, `rulenum` 0 to n-1 in this
 * order (0.9). OMV gives every rule a new identifier (D9).
 */
export function setRulesRequest(
  rules: readonly FirewallRule[],
  family: Family,
): RulesWrite {
  const items: WritableFields[] = [];
  for (const [index, rule] of rules.entries()) {
    const chain = CHAIN_VALUES.find((c) => c === rule.chain);
    const action = ACTION_VALUES.find((a) => a === rule.action);
    if (
      chain === undefined ||
      action === undefined ||
      rule.family !== familyOf(family)
    ) {
      return { ok: false, position: index + 1 };
    }
    const { family: _family, ...fields } = rule;
    items.push({ ...fields, chain, action, rulenum: index });
  }
  return family === 4
    ? {
        ok: true,
        family: 4,
        request: items.map((i) => ({ ...i, family: "inet" as const })),
      }
    : {
        ok: true,
        family: 6,
        request: items.map((i) => ({ ...i, family: "inet6" as const })),
      };
}

/** Where a new rule goes (11.4 item 7): at the end, at the top, or before the rule at a position (1 first). */
export type Where =
  { kind: "end" } | { kind: "top" } | { kind: "before"; position: number };

/**
 * The list with a new rule placed (in order, not yet numbered). At the end, setRule with -1 is used
 * instead (11.4); this is for the other places, written with setRules.
 */
export function placeRule(
  rules: readonly FirewallRule[],
  rule: FirewallRule,
  where: Where,
): FirewallRule[] {
  const sorted = sortRules(rules);
  const at =
    where.kind === "end"
      ? sorted.length
      : where.kind === "top"
        ? 0
        : Math.min(Math.max(where.position - 1, 0), sorted.length);
  return [...sorted.slice(0, at), rule, ...sorted.slice(at)];
}

/** The list with one rule replaced in place (a change written with setRules). */
export const replaceRule = (
  rules: readonly FirewallRule[],
  rule: FirewallRule,
): FirewallRule[] =>
  sortRules(rules).map((r) => (r.uuid === rule.uuid ? rule : r));

/** The list without one rule (the check of 11.8 runs on it). */
export const withoutRule = (
  rules: readonly FirewallRule[],
  uuid: string,
): FirewallRule[] => sortRules(rules).filter((r) => r.uuid !== uuid);

/** Move up (-1) or down (+1) on the page only (11.7); the list unchanged at either end. */
export function moveRule(
  rules: readonly FirewallRule[],
  index: number,
  by: -1 | 1,
): FirewallRule[] {
  const list = [...rules];
  const target = index + by;
  const moving = list[index];
  const other = list[target];
  if (moving === undefined || other === undefined) {
    return list;
  }
  list[index] = other;
  list[target] = moving;
  return list;
}

/**
 * Whether two reads of the rules are the same list (11.7's re-read, 1.4's "changed since"): the
 * same rules, field by field, in the same order.
 */
export function sameRules(
  a: readonly FirewallRule[],
  b: readonly FirewallRule[],
): boolean {
  const x = sortRules(a);
  const y = sortRules(b);
  return (
    x.length === y.length &&
    x.every((rule, i) => {
      const other = y[i];
      return (
        other !== undefined &&
        (Object.keys(rule) as (keyof FirewallRule)[]).every(
          (key) => rule[key] === other[key],
        )
      );
    })
  );
}

// ---- Block everything else (11.6) ----------------------------------------------------------------

const fixedRule = (
  family: Family,
  fields: Pick<WritableFields, "action" | "protocol" | "extraoptions">,
): SetRuleRequest =>
  withFamily(family, {
    uuid: NEW_OBJECT_UUID,
    rulenum: -1,
    chain: "INPUT",
    source: "",
    sport: "",
    destination: "",
    dport: "",
    comment: "",
    ...fields,
  });

/** The three rules 11.6 adds at the end (setRule each, -1): talking to itself, replies, refuse the rest. */
export const blockEverythingElseRules = (family: Family): SetRuleRequest[] => [
  fixedRule(family, {
    action: "ACCEPT",
    protocol: "all",
    extraoptions: SELF_OPTIONS,
  }),
  fixedRule(family, {
    action: "ACCEPT",
    protocol: "all",
    extraoptions: REPLIES_OPTIONS,
  }),
  fixedRule(family, { action: "REJECT", protocol: "all", extraoptions: "" }),
];

/** Whether a rule refuses or ignores all traffic coming in, whoever sends it. */
export function blocksAllComingIn(rule: ReadRule): boolean {
  return (
    rule.direction === "in" &&
    (rule.action === "reject" || rule.action === "drop") &&
    rule.protocol.kind === "known" &&
    rule.protocol.name === "all" &&
    !rule.protocol.negated &&
    rule.nasPort.kind === "any" &&
    rule.otherPort.kind === "any" &&
    rule.nasSide.kind === "any" &&
    rule.other.kind === "any" &&
    rule.options.kind === "none"
  );
}

/** "Block everything else…" is offered only when the list does not already end so (11.3 item 6). */
export function offersBlockEverythingElse(
  rules: readonly FirewallRule[],
): boolean {
  const read = readRules(rules);
  const last = read[read.length - 1];
  return last === undefined || !blocksAllComingIn(last);
}

/**
 * "Allow this page for {{network}}…" (11.6 item 3): the dialog filled with Allow, TCP, this page's
 * port, the computers on the network of this page's interface. Placed at the top.
 */
export function allowPageDraft(
  network: IpNetwork,
  pagePort: number,
): { draft: RuleDraft; where: Where } {
  return {
    draft: {
      ...NEW_RULE_DRAFT,
      action: "accept",
      port: { kind: "text", text: String(pagePort) },
      other: {
        kind: "network",
        text: formatNetwork(network),
      },
    },
    where: { kind: "top" },
  };
}
