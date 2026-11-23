// SPDX-License-Identifier: GPL-3.0-or-later
// The check: what a list of firewall rules does to this page (phase 5 network design 11.5), run in
// the browser on the stored list, a changed one shown on the page, or one with a rule added, changed
// or deleted; for this page's port, the web interface's other port and SSH. Pure.
//
// For a port it walks the rules for traffic coming in (TCP to that port, to the NAS's address) and,
// separately, for replies going out (TCP from that port, to the other computer), in order. This
// computer's own address is not known (N10), so a rule that names some computers is "some
// computers", never "this computer". A rule for every computer that allows ends the walk (let in);
// one that refuses or ignores ends it (blocked); Note in the log and Count only go on. A rule for
// some computers is recorded and the walk goes on for everyone else. The end of the list lets in.
import {
  nasAddress,
  pageFamilies,
  type Connection,
  type SshPort,
  type WebPorts,
} from "./connection.ts";
import type { FirewallRule, Read } from "./dto.ts";
import {
  readRules,
  type AddressSpec,
  type Direction,
  type PortSpec,
  type ReadRule,
} from "./firewallModel.ts";
import {
  formatNetwork,
  inNetwork,
  inRange,
  lastAddress,
  networkWithin,
  type Family,
  type IpAddress,
  type IpNetwork,
} from "./ip.ts";

/** The traffic one walk follows. */
export interface Traffic {
  direction: Direction;
  /** The NAS's port: the destination coming in, the source of replies going out. */
  port: number;
  family: Family;
  /** The NAS's address, when the page knows it (0.4); otherwise a rule naming it fits "some". */
  nas: IpAddress | null;
  /** The other computer's address: known only through a tunnel (loopback); otherwise not (N10). */
  peer: IpAddress | null;
}

/** Whom a recorded rule is for, in 11.3's words: the other computer, and the NAS's side when set. */
export interface Who {
  other: AddressSpec;
  nasSide: AddressSpec;
}

/** Why a rule that fits may or may not fit this page's traffic. */
export type Uncertain =
  /** A port on the other side: the browser's port is chosen at random. */
  | "otherPort"
  /** Other options set in the classic interface. */
  | "options"
  /** A value this interface cannot read (a protocol, a port, an address, a chain or an action). */
  | "unreadable";

/** How a rule fits the traffic. */
export type Fit =
  /** Wrong direction, kind or port, or the NAS's address outside it: skipped. */
  | { kind: "skip" }
  /** Every computer. */
  | { kind: "every" }
  /** Some computers, named. */
  | { kind: "some"; who: Who }
  /** Some computers, and this page cannot tell which ("cannot tell"). */
  | { kind: "cannotTell"; who: Who; reason: Uncertain };

type FieldFit = "fits" | "skip" | "some" | Uncertain;

const portFits = (spec: PortSpec, port: number): FieldFit => {
  switch (spec.kind) {
    case "any":
      return "fits";
    case "classic":
      return "unreadable";
    case "ports": {
      const inside = port >= spec.from && port <= spec.to;
      return inside !== spec.negated ? "fits" : "skip";
    }
  }
};

const contains = (spec: AddressSpec, address: IpAddress): boolean | null => {
  switch (spec.kind) {
    case "any":
      return true;
    case "classic":
      return null;
    case "address":
      return (
        (spec.address.family === address.family &&
          BigInt(spec.address.value) === BigInt(address.value)) !== spec.negated
      );
    case "network":
      return inNetwork(address, spec.network) !== spec.negated;
    case "range":
      return inRange(address, spec.range) !== spec.negated;
  }
};

/** A side of the rule against an address the page knows, or "some" when it does not know it. */
const sideFits = (spec: AddressSpec, address: IpAddress | null): FieldFit => {
  if (spec.kind === "any") {
    return "fits";
  }
  if (spec.kind === "classic") {
    return "unreadable";
  }
  if (address === null) {
    return "some";
  }
  return contains(spec, address) === true ? "fits" : "skip";
};

/** The other computer's port: any, or "cannot tell" (the browser's port is chosen at random). */
const otherPortFits = (spec: PortSpec): FieldFit =>
  spec.kind === "any" ? "fits" : "otherPort";

const fitsTcp = (rule: ReadRule): FieldFit => {
  if (rule.protocol.kind === "classic") {
    return "unreadable";
  }
  const { name, negated } = rule.protocol;
  const named = name === "tcp" || name === "all";
  // "!all" fits nothing; "!udp", "!icmp" and "!icmpv6" fit TCP.
  return (negated ? name !== "tcp" && name !== "all" : named) ? "fits" : "skip";
};

/** 11.6's two fixed rules, and other options. */
const optionsFit = (rule: ReadRule, traffic: Traffic): FieldFit => {
  switch (rule.options.kind) {
    case "none":
      return "fits";
    case "classic":
      return "options";
    case "self":
      // `-i lo`: traffic arriving on the loopback interface, which only a tunnel's is.
      if (traffic.direction === "out") {
        return "options";
      }
      return traffic.peer !== null && isLoopbackAddress(traffic.peer)
        ? "fits"
        : "skip";
    case "replies":
      // Replies to connections this NAS starts: never a new connection coming in; the page's own
      // replies going out belong to an established connection.
      return traffic.direction === "in" ? "skip" : "fits";
  }
};

const isLoopbackAddress = (address: IpAddress): boolean =>
  address.family === 4
    ? Math.floor(address.value / 2 ** 24) === 127
    : address.value === 1n;

/** How one rule fits the traffic (11.5's first table). */
export function ruleFits(rule: ReadRule, traffic: Traffic): Fit {
  const who: Who = { other: rule.other, nasSide: rule.nasSide };
  if (rule.direction === null) {
    return { kind: "cannotTell", who, reason: "unreadable" };
  }
  if (rule.direction !== traffic.direction) {
    return { kind: "skip" };
  }
  const fields: FieldFit[] = [
    fitsTcp(rule),
    portFits(rule.nasPort, traffic.port),
    sideFits(rule.nasSide, traffic.nas),
    sideFits(rule.other, traffic.peer),
    otherPortFits(rule.otherPort),
    optionsFit(rule, traffic),
  ];
  // Anything that rules the traffic out decides first: a rule that cannot fit is skipped whatever
  // else it says.
  if (fields.includes("skip")) {
    return { kind: "skip" };
  }
  const uncertain = fields.find(
    (f): f is Uncertain =>
      f === "otherPort" || f === "options" || f === "unreadable",
  );
  if (uncertain !== undefined) {
    return { kind: "cannotTell", who, reason: uncertain };
  }
  if (rule.action === null) {
    return { kind: "cannotTell", who, reason: "unreadable" };
  }
  return fields.includes("some") ? { kind: "some", who } : { kind: "every" };
}

// ---- The walk ------------------------------------------------------------------------------------

/** A rule recorded on the way down: for some computers, or one the page cannot tell about. */
export interface Recorded {
  /** The rule's place in the list, 1 first. */
  position: number;
  who: Who;
  /** Whether it allows (true) or refuses or ignores (false); null for an action the page cannot read. */
  allows: boolean | null;
  /** Null for a rule naming some computers; the reason for one the page cannot tell about. */
  uncertain: Uncertain | null;
}

export interface Walk {
  /** What happens to everyone no recorded rule is about. */
  rest: "letIn" | "blocked";
  /** The rule that ended the walk, or null at the end of the list. */
  endedBy: number | null;
  /** The recorded rules that matter: those that do the opposite of what happens to the rest. */
  recorded: readonly Recorded[];
}

/** One walk down a list (sorted and read) for one traffic. */
export function walk(rules: readonly ReadRule[], traffic: Traffic): Walk {
  const recorded: Recorded[] = [];
  for (const rule of rules) {
    if (rule.action === "log" || rule.action === "count") {
      continue;
    }
    const fit = ruleFits(rule, traffic);
    if (fit.kind === "skip") {
      continue;
    }
    const allows = rule.action === "accept";
    if (fit.kind === "every") {
      const rest = allows ? "letIn" : "blocked";
      return {
        rest,
        endedBy: rule.position,
        recorded: recorded.filter((r) => r.allows !== allows),
      };
    }
    recorded.push({
      position: rule.position,
      who: fit.who,
      // An action this file cannot read matters whatever happens to the rest (fails closed).
      allows: rule.action === null ? null : allows,
      uncertain: fit.kind === "cannotTell" ? fit.reason : null,
    });
  }
  return {
    rest: "letIn",
    endedBy: null,
    recorded: recorded.filter((r) => !r.allows),
  };
}

/** 11.5's second table. Each kind but letIn names its copy key `firewall.page{Kind}` (see ruleWords). */
export type Verdict =
  /** Let in for every computer: Not affected. */
  | { kind: "letIn" }
  /** Blocked for every computer, coming in or going out: Refused. */
  | { kind: "blockedAll"; position: number | null; direction: Direction }
  /** Let in only for some computers, blocked for the rest: May cut. */
  | { kind: "onlySome"; who: readonly Recorded[] }
  /** Blocked for some computers, let in for the rest: May cut. */
  | { kind: "blockedSome"; who: readonly Recorded[] }
  /** A rule it cannot tell about decides: May cut. */
  | { kind: "cannotTell"; position: number; reason: Uncertain };

const verdictOf = (w: Walk, direction: Direction): Verdict => {
  const unsure = w.recorded.find((r) => r.uncertain !== null);
  if (unsure?.uncertain != null) {
    return {
      kind: "cannotTell",
      position: unsure.position,
      reason: unsure.uncertain,
    };
  }
  if (w.rest === "letIn") {
    return w.recorded.length === 0
      ? { kind: "letIn" }
      : { kind: "blockedSome", who: w.recorded };
  }
  return w.recorded.length === 0
    ? { kind: "blockedAll", position: w.endedBy, direction }
    : { kind: "onlySome", who: w.recorded };
};

const RANK = {
  letIn: 0,
  blockedSome: 1,
  onlySome: 2,
  cannotTell: 3,
  blockedAll: 4,
} as const satisfies Record<Verdict["kind"], number>;

/** The worse of two verdicts (blocked for all, then cannot tell, then only some, then blocked for some). */
export const worse = (a: Verdict, b: Verdict): Verdict =>
  RANK[b.kind] > RANK[a.kind] ? b : a;

export interface PortCheck {
  verdict: Verdict;
  in: Verdict;
  out: Verdict;
}

/** Both walks for one port of one list. */
export function checkPort(
  rules: readonly ReadRule[],
  traffic: Omit<Traffic, "direction">,
): PortCheck {
  const inVerdict = verdictOf(
    walk(rules, { ...traffic, direction: "in" }),
    "in",
  );
  const outVerdict = verdictOf(
    walk(rules, { ...traffic, direction: "out" }),
    "out",
  );
  return {
    verdict: worse(inVerdict, outVerdict),
    in: inVerdict,
    out: outVerdict,
  };
}

// ---- What the rules do to this page --------------------------------------------------------------

/** The class the check gives a firewall change (0.5). */
export type FirewallImpact = "none" | "mayCut" | "refused";

export const impactOf = (verdict: Verdict): FirewallImpact =>
  verdict.kind === "letIn"
    ? "none"
    : verdict.kind === "blockedAll"
      ? "refused"
      : "mayCut";

/** A line the check adds (11.5), as its copy key and the values the words need. */
export type CheckLine =
  /** "If this computer is on the same network as the NAS ({{network}}), it is one of them." */
  | { code: "firewall.sameNetwork"; network: string }
  /** "This page uses IPv6, which these rules do not check." */
  | { code: "firewall.ipv6Page" }
  /**
   * The IPv6 list's counterpart: "This page uses IPv4, which these rules do not check." Not in the
   * design's catalogue (11.10); the page adds the key or shows nothing.
   */
  | { code: "firewall.ipv4Page" }
  /** "The address with {{scheme}}:// stops working; this page uses {{current}}://." */
  | {
      code: "firewall.otherScheme";
      scheme: "http" | "https";
      current: "http" | "https";
    }
  /** "SSH: blocked for every computer. If this page is cut off, SSH will not be a way back in." */
  | { code: "firewall.sshBlocked" }
  /** "SSH: blocked for {{who}}." */
  | { code: "firewall.sshSome"; who: readonly Recorded[] }
  /** "Could not read the SSH settings, so SSH is not checked." */
  | { code: "firewall.sshUnread" };

export interface ListCheck {
  /** The list's family. */
  family: Family;
  /** False when this page does not use the list's family: the list cannot block it (Not affected). */
  checked: boolean;
  /** For this page's port. */
  page: PortCheck;
  impact: FirewallImpact;
  lines: readonly CheckLine[];
}

export interface CheckContext {
  connection: Connection;
  ports: WebPorts;
  ssh: SshPort;
}

const LET_IN: PortCheck = {
  verdict: { kind: "letIn" },
  in: { kind: "letIn" },
  out: { kind: "letIn" },
};

/** Whether an allowing rule's computers include the whole network of this page's interface. */
const coversNetwork = (who: Who, network: IpNetwork): boolean => {
  const spec = who.other;
  switch (spec.kind) {
    case "any":
      return true;
    case "network":
      return !spec.negated && networkWithin(network, spec.network);
    case "range": {
      if (spec.negated || spec.range.family !== network.family) {
        return false;
      }
      return (
        spec.range.first <= network.start &&
        spec.range.last >= lastAddress(network)
      );
    }
    case "address":
    case "classic":
      return false;
  }
};

/**
 * What one list (IPv4 or IPv6) does to this page (11.5): the walk for this page's port, the class,
 * and the lines (the same-network hint, the other web port, SSH).
 */
export function checkList(
  rules: readonly FirewallRule[],
  family: Family,
  context: CheckContext,
): ListCheck {
  const { connection, ports, ssh } = context;
  const families = pageFamilies(connection);
  if (!families.includes(family)) {
    return {
      family,
      checked: false,
      page: LET_IN,
      impact: "none",
      lines: [
        { code: family === 4 ? "firewall.ipv6Page" : "firewall.ipv4Page" },
      ],
    };
  }
  const read = readRules(rules);
  const nas = nasAddress(connection, family);
  const peer = connection.kind === "tunnel" ? nas : null;
  const traffic = (port: number) => ({ port, family, nas, peer });
  const page = checkPort(read, traffic(ports.page));
  const lines: CheckLine[] = [];

  if (
    page.verdict.kind === "onlySome" &&
    connection.kind === "known" &&
    connection.network !== null &&
    connection.network.family === family
  ) {
    const network = connection.network;
    if (
      page.verdict.who.some(
        (r) => r.allows === true && coversNetwork(r.who, network),
      )
    ) {
      lines.push({
        code: "firewall.sameNetwork",
        network: formatNetwork(network),
      });
    }
  }
  for (const other of ports.others) {
    if (checkPort(read, traffic(other.port)).verdict.kind !== "letIn") {
      lines.push({
        code: "firewall.otherScheme",
        scheme: other.scheme,
        current: ports.scheme,
      });
    }
  }
  if (ssh.kind === "unread") {
    lines.push({ code: "firewall.sshUnread" });
  } else if (ssh.kind === "on") {
    const verdict = checkPort(read, traffic(ssh.port)).verdict;
    if (verdict.kind === "blockedAll") {
      lines.push({ code: "firewall.sshBlocked" });
    } else if (verdict.kind === "onlySome" || verdict.kind === "blockedSome") {
      lines.push({ code: "firewall.sshSome", who: verdict.who });
    } else if (verdict.kind === "cannotTell") {
      const rule = read.find((r) => r.position === verdict.position);
      lines.push({
        code: "firewall.sshSome",
        who:
          rule === undefined
            ? []
            : [
                {
                  position: rule.position,
                  who: { other: rule.other, nasSide: rule.nasSide },
                  allows:
                    rule.action === null ? null : rule.action === "accept",
                  uncertain: verdict.reason,
                },
              ],
      });
    }
  }
  return { family, checked: true, page, impact: impactOf(page.verdict), lines };
}

/**
 * Whether one list blocks SSH for every computer (13.4, the SSH page's line), whatever family this
 * page uses: SSH may be reached over either. False when SSH is off or its settings were not read.
 */
export function sshBlockedForAll(
  rules: readonly FirewallRule[],
  family: Family,
  context: CheckContext,
): boolean {
  const { connection, ssh } = context;
  if (ssh.kind !== "on") {
    return false;
  }
  const nas = pageFamilies(connection).includes(family)
    ? nasAddress(connection, family)
    : null;
  const peer = connection.kind === "tunnel" ? nas : null;
  return (
    checkPort(readRules(rules), { port: ssh.port, family, nas, peer }).verdict
      .kind === "blockedAll"
  );
}

/** The check over both lists, as the band's confirmation runs it on the stored rules (1.8). */
export interface BothChecks {
  impact: FirewallImpact;
  lists: readonly ListCheck[];
  /** A list this page's family needs could not be read: May cut (0.8: never read as safe). */
  unread: readonly Family[];
}

export function checkBothLists(
  lists: { 4: Read<readonly FirewallRule[]>; 6: Read<readonly FirewallRule[]> },
  context: CheckContext,
): BothChecks {
  const families = pageFamilies(context.connection);
  const checks: ListCheck[] = [];
  const unread: Family[] = [];
  for (const family of [4, 6] as const) {
    const list = lists[family];
    if (list.state === "ok") {
      checks.push(checkList(list.data, family, context));
    } else if (families.includes(family)) {
      unread.push(family);
    }
  }
  const worst = checks.reduce<FirewallImpact>(
    (acc, c) =>
      acc === "refused" || c.impact === "refused"
        ? "refused"
        : acc === "mayCut" || c.impact === "mayCut"
          ? "mayCut"
          : "none",
    "none",
  );
  return {
    impact: worst === "none" && unread.length > 0 ? "mayCut" : worst,
    lists: checks,
    unread,
  };
}
