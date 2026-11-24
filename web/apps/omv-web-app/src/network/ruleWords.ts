// SPDX-License-Identifier: GPL-3.0-or-later
// A firewall rule in plain words (phase 5 network design 11.3, 11.8, 11.10, D20): each part of a row
// as its copy key and the values the words need. Nothing here is translated; the page turns each key
// into its words. Known ports are named after the number, using the NAS's own SSH and web ports. Pure.
import type { FirewallRule } from "./dto.ts";
import type { Recorded, Verdict } from "./firewallCheck.ts";
import {
  readRules,
  type AddressSpec,
  type PortSpec,
  type ReadRule,
} from "./firewallModel.ts";
import {
  addressCount,
  formatAddress,
  formatBits,
  formatNetwork,
} from "./ip.ts";

// ---- Known ports (11.3, D20) ---------------------------------------------------------------------

export type ServiceKey =
  | "firewall.service.ssh"
  | "firewall.service.thisPage"
  | "firewall.service.web"
  | "firewall.service.secureWeb"
  | "firewall.service.smb"
  | "firewall.service.netbios"
  | "firewall.service.nfs"
  | "firewall.service.rpcbind"
  | "firewall.service.rsyncd"
  | "firewall.service.dns"
  | "firewall.service.ntp"
  | "firewall.service.mail";

/** The ports whose names do not depend on the NAS's settings, in the dialog's order. */
export const FIXED_PORTS = [
  { port: 443, service: "firewall.service.secureWeb" },
  { port: 445, service: "firewall.service.smb" },
  { port: 139, service: "firewall.service.netbios" },
  { port: 2049, service: "firewall.service.nfs" },
  { port: 111, service: "firewall.service.rpcbind" },
  { port: 873, service: "firewall.service.rsyncd" },
  { port: 53, service: "firewall.service.dns" },
  { port: 123, service: "firewall.service.ntp" },
  { port: 25, service: "firewall.service.mail" },
  { port: 587, service: "firewall.service.mail" },
] as const satisfies readonly { port: number; service: ServiceKey }[];

/** The SSH port when SSH.get could not be read: OMV's default. */
export const DEFAULT_SSH_PORT = 22;

export interface PortNames {
  /** This page's port: "this web interface". */
  pagePort: number;
  /** The web interface's other port or ports: "the web interface". */
  otherWebPorts: readonly number[];
  /** SSH.get's port (whether SSH is on or not); null when it was not read (then 22). */
  sshPort: number | null;
}

/**
 * The known ports in the dialog's list (11.4 item 4) and the names in the list (11.3): this page's
 * port first, then the web interface's other port, SSH, and the fixed ones; each port once.
 */
export function knownPorts(
  names: PortNames,
): { port: number; service: ServiceKey }[] {
  const all: { port: number; service: ServiceKey }[] = [
    { port: names.pagePort, service: "firewall.service.thisPage" },
    ...names.otherWebPorts.map((port) => ({
      port,
      service: "firewall.service.web" as const,
    })),
    {
      port: names.sshPort ?? DEFAULT_SSH_PORT,
      service: "firewall.service.ssh",
    },
    ...FIXED_PORTS,
  ];
  const seen = new Set<number>();
  return all.filter(({ port }) => {
    if (seen.has(port)) {
      return false;
    }
    seen.add(port);
    return true;
  });
}

/** The name of a port, or null when it is not a known one. */
export const portName = (port: number, names: PortNames): ServiceKey | null =>
  knownPorts(names).find((k) => k.port === port)?.service ?? null;

// ---- The parts of a row --------------------------------------------------------------------------

/** A stored value this interface does not write: "{{value}} (set in the classic interface)". */
export interface ClassicValue {
  key: "fwRule.classicValue";
  value: string;
}

export type ActionWord =
  | {
      key:
        | "firewall.action.accept"
        | "firewall.action.reject"
        | "firewall.action.drop"
        | "firewall.action.log"
        | "firewall.action.count";
    }
  | ClassicValue;

export function actionWord(rule: ReadRule): ActionWord {
  return rule.action === null
    ? { key: "fwRule.classicValue", value: rule.rule.action }
    : { key: `firewall.action.${rule.action}` };
}

export type DirectionWord =
  { key: "firewall.dir.in" | "firewall.dir.out" } | ClassicValue;

export const directionWord = (rule: ReadRule): DirectionWord =>
  rule.direction === null
    ? { key: "fwRule.classicValue", value: rule.rule.chain }
    : { key: `firewall.dir.${rule.direction}` };

export type KindWord =
  | {
      key:
        | "firewall.kind.tcp"
        | "firewall.kind.udp"
        | "firewall.kind.icmp"
        | "firewall.kind.all";
    }
  /** "not TCP" and the like, and protocols this interface does not write. */
  | { key: "firewall.kind.classic"; kind: string };

export function kindWord(rule: ReadRule): KindWord {
  const p = rule.protocol;
  if (p.kind === "classic" || p.negated) {
    return { key: "firewall.kind.classic", kind: rule.rule.protocol };
  }
  return { key: `firewall.kind.${p.name === "icmpv6" ? "icmp" : p.name}` };
}

export type PortWord =
  | { key: "firewall.port_one"; port: number; service: ServiceKey | null }
  | { key: "firewall.portRange"; from: number; to: number }
  | ClassicValue;

/** A port's words, or null for any port. A "!" port is shown as stored. */
export function portWord(
  spec: PortSpec,
  raw: string,
  names: PortNames,
): PortWord | null {
  switch (spec.kind) {
    case "any":
      return null;
    case "classic":
      return { key: "fwRule.classicValue", value: raw };
    case "ports":
      if (spec.negated) {
        return { key: "fwRule.classicValue", value: raw };
      }
      return spec.from === spec.to
        ? {
            key: "firewall.port_one",
            port: spec.from,
            service: portName(spec.from, names),
          }
        : { key: "firewall.portRange", from: spec.from, to: spec.to };
  }
}

export type WhoWord =
  | { key: "firewall.who.any" }
  | { key: "firewall.who.one"; address: string }
  | {
      key: "firewall.who.network";
      network: string;
      count: ReturnType<typeof addressCount>;
    }
  | { key: "firewall.who.range"; first: string; last: string }
  | {
      key: "firewall.who.except";
      who: Exclude<WhoWord, { key: "firewall.who.except" }>;
    }
  | ClassicValue;

/** The other computer in 0.2's words (11.3 column 4). */
export function whoWord(spec: AddressSpec): WhoWord {
  const plain = (): Exclude<WhoWord, { key: "firewall.who.except" }> => {
    switch (spec.kind) {
      case "any":
        return { key: "firewall.who.any" };
      case "classic":
        return { key: "fwRule.classicValue", value: spec.text };
      case "address":
        return {
          key: "firewall.who.one",
          address: formatAddress(spec.address),
        };
      case "network":
        return {
          key: "firewall.who.network",
          network: formatNetwork(spec.network),
          count: addressCount(spec.network.family, spec.network.prefix),
        };
      case "range":
        return {
          key: "firewall.who.range",
          first: formatBits(spec.range.family, spec.range.first),
          last: formatBits(spec.range.family, spec.range.last),
        };
    }
  };
  const word = plain();
  const negated =
    spec.kind !== "any" && spec.kind !== "classic" && spec.negated;
  return negated ? { key: "firewall.who.except", who: word } : word;
}

/** The NAS's side, when set: "to the NAS's address {{address}}" (11.3 column 4). */
export type NasSideWord = {
  key: "firewall.who.nasSide";
  address: WhoWord;
} | null;

export const nasSideWord = (spec: AddressSpec): NasSideWord =>
  spec.kind === "any"
    ? null
    : { key: "firewall.who.nasSide", address: whoWord(spec) };

export type NoteWord =
  | { key: "firewall.note.self" }
  | { key: "firewall.note.replies" }
  | { key: "firewall.note.classic"; options: string };

export interface RuleRow {
  /** Its place, 1 first. */
  position: number;
  then: ActionWord;
  /** `firewall.trafficPort` when a port is set, `firewall.traffic` otherwise. */
  traffic: {
    key: "firewall.traffic" | "firewall.trafficPort";
    direction: DirectionWord;
    kind: KindWord;
    port: PortWord | null;
  };
  who: WhoWord;
  nasSide: NasSideWord;
  /** The other computer's port, set in the classic interface (shown as stored). */
  otherPort: ClassicValue | null;
  /** 11.6's two rules in their own words, or other options as stored. */
  options: NoteWord | null;
  /** The rule's own note. */
  comment: string;
}

/** One row of the list (11.3 item 7). */
export function ruleRow(rule: ReadRule, names: PortNames): RuleRow {
  const out = rule.direction === "out";
  const port = portWord(
    rule.nasPort,
    out ? rule.rule.sport : rule.rule.dport,
    names,
  );
  const otherRaw = out ? rule.rule.dport : rule.rule.sport;
  return {
    position: rule.position,
    then: actionWord(rule),
    traffic: {
      key: port === null ? "firewall.traffic" : "firewall.trafficPort",
      direction: directionWord(rule),
      kind: kindWord(rule),
      port,
    },
    who: whoWord(rule.other),
    nasSide: nasSideWord(rule.nasSide),
    otherPort:
      rule.otherPort.kind === "any"
        ? null
        : { key: "fwRule.classicValue", value: otherRaw },
    options:
      rule.options.kind === "none"
        ? null
        : rule.options.kind === "self"
          ? { key: "firewall.note.self" }
          : rule.options.kind === "replies"
            ? { key: "firewall.note.replies" }
            : { key: "firewall.note.classic", options: rule.options.text },
    comment: rule.rule.comment,
  };
}

/** Every row of a stored list, in order. */
export const ruleRows = (
  rules: readonly FirewallRule[],
  names: PortNames,
): RuleRow[] => readRules(rules).map((r) => ruleRow(r, names));

// ---- {{who}} (11.5): at most three, then "and {{count}} more" ---------------------------------------

export interface WhoEntry {
  who: WhoWord;
  nasSide: NasSideWord;
}

export const WHO_SHOWN = 3;

/** The computers of the recorded rules, each once, at most three; `more` is how many are left out. */
export function whoList(
  recorded: readonly Recorded[],
  max: number = WHO_SHOWN,
): { shown: WhoEntry[]; more: number } {
  const entries: WhoEntry[] = [];
  const keys = new Set<string>();
  for (const r of recorded) {
    const entry = {
      who: whoWord(r.who.other),
      nasSide: nasSideWord(r.who.nasSide),
    };
    const key = JSON.stringify(entry);
    if (!keys.has(key)) {
      keys.add(key);
      entries.push(entry);
    }
  }
  return {
    shown: entries.slice(0, max),
    more: Math.max(entries.length - max, 0),
  };
}

// ---- The check's words (11.5) --------------------------------------------------------------------

export type VerdictWords =
  | { key: "firewall.pageLetIn" }
  | { key: "firewall.pageRefused" }
  | { key: "firewall.pageOnlySome"; who: ReturnType<typeof whoList> }
  | { key: "firewall.pageBlockedSome"; who: ReturnType<typeof whoList> }
  | { key: "firewall.pageCannotTell"; n: number };

export function verdictWords(verdict: Verdict): VerdictWords {
  switch (verdict.kind) {
    case "letIn":
      return { key: "firewall.pageLetIn" };
    case "blockedAll":
      return { key: "firewall.pageRefused" };
    case "onlySome":
      return { key: "firewall.pageOnlySome", who: whoList(verdict.who) };
    case "blockedSome":
      return { key: "firewall.pageBlockedSome", who: whoList(verdict.who) };
    case "cannotTell":
      return { key: "firewall.pageCannotTell", n: verdict.position };
  }
}

/** The summary line (11.3 item 4). */
export function countsLine(
  rules: readonly FirewallRule[],
):
  | { key: "firewall.none" }
  | { key: "firewall.counts"; in: number; out: number } {
  if (rules.length === 0) {
    return { key: "firewall.none" };
  }
  const read = readRules(rules);
  return {
    key: "firewall.counts",
    in: read.filter((r) => r.direction !== "out").length,
    out: read.filter((r) => r.direction === "out").length,
  };
}

// ---- What deleting a rule loses (11.8 item 3) ----------------------------------------------------

export type DeleteLoss =
  | {
      key: "fwDelete.lostBlock";
      who: WhoEntry;
      what: RuleRow["traffic"];
    }
  | { key: "fwDelete.lostAllow" }
  | { key: "fwDelete.lostLog" };

/** What is lost: for Refuse and Ignore, who can reach what again; for Allow, the rules below decide; for Log, the log line. Null for Count only and actions set in the classic interface. */
export function deleteLoss(
  rule: ReadRule,
  names: PortNames,
): DeleteLoss | null {
  switch (rule.action) {
    case "reject":
    case "drop": {
      const row = ruleRow(rule, names);
      return {
        key: "fwDelete.lostBlock",
        who: { who: row.who, nasSide: row.nasSide },
        what: row.traffic,
      };
    }
    case "accept":
      return { key: "fwDelete.lostAllow" };
    case "log":
      return { key: "fwDelete.lostLog" };
    case "count":
    case null:
      return null;
  }
}
