// SPDX-License-Identifier: GPL-3.0-or-later
// What a change does to this page (phase 5 network design 0.5, 5.4 to 5.6, 1.8, 10.3): each change
// is put in one of five classes before it is saved and again before it is applied. The class decides
// the confirmation (section 1) and the words. With the conclusion Name only or Not known (0.4), every
// interface change is May cut and never Refused on a guess; a firewall list that blocks the web ports
// for every computer, whatever the NAS's address, stays Refused (11.5). Pure.
import {
  certainty,
  nameForms,
  pageFamilies,
  parsePageHost,
  standing,
  type Connection,
  type NameForm,
  type PageLocation,
} from "./connection.ts";
import type {
  DeviceRow,
  GeneralSettings,
  IfaceSettings,
  IfaceType,
  Method4,
  Method6,
  Read,
  SetIfaceBase,
} from "./dto.ts";
import type { BothChecks, ListCheck, Recorded } from "./firewallCheck.ts";
import { generalChanged } from "./generalModel.ts";
import {
  blankSettings,
  changedFields,
  differsFromInUse,
  familyWord,
  memberRefusal,
  NETWORK_MODULE,
  removalRefusal,
  storedFor,
} from "./ifaceModel.ts";
import {
  canonicalAddress,
  isLinkLocal,
  maskText,
  prefixFromMask,
  sameAddress,
  type Family,
} from "./ip.ts";

/** 0.5's five classes; each but refused is the copy key `network.impact.{class}`. */
export type ImpactClass = "none" | "brief" | "moves" | "mayCut" | "refused";

const RANK = {
  none: 0,
  brief: 1,
  moves: 2,
  mayCut: 3,
  refused: 4,
} as const satisfies Record<ImpactClass, number>;

/** The worst of several classes ("none" for none). */
export const worstClass = (classes: readonly ImpactClass[]): ImpactClass =>
  classes.reduce<ImpactClass>((a, b) => (RANK[b] > RANK[a] ? b : a), "none");

/** One reason for a class, with the specific line (1.9 `netChange.effect.*`) or the refusal (0.8). */
export type Finding =
  | { class: "brief" }
  /** `netChange.effect.newAddress`: the page's address changes. */
  | {
      class: "moves";
      effect: "netChange.effect.newAddress";
      family: Family;
      old: string;
      new: string;
    }
  /** `netChange.effect.newName`: the name the page was opened by changes. */
  | {
      class: "moves";
      effect: "netChange.effect.newName";
      old: string;
      new: string;
    }
  | {
      class: "mayCut";
      /** Null when the page cannot tell which interface it uses, or the change has no line of its own. */
      effect:
        | "netChange.effect.automatic"
        | "netChange.effect.mtu"
        | "netChange.effect.gateway"
        | "netChange.effect.wifi"
        | "netChange.effect.firewall"
        | null;
      /** For mtu: the size; for firewall: who (11.5's verdict's recorded rules). */
      size?: number;
      who?: readonly Recorded[];
    }
  | { class: "refused"; refusal: Refusal };

/** Why a change is Refused (0.8), as the copy key and its values; `otherWay` adds `network.impact.otherWay`. */
export type Refusal =
  | {
      code: "ifaceForm.refusedFamily";
      family: "IPv4" | "IPv6";
      iface: string;
      otherWay: true;
    }
  | { code: "ifaceDelete.refusedThis"; iface: string; otherWay: true }
  | {
      code: "ifaceDelete.refusedUnder";
      top: string;
      iface: string;
      otherWay: true;
    }
  | {
      code: "ifaceDelete.refusedVlan";
      vlan: string;
      iface: string;
      otherWay: false;
    }
  | { code: "bond.thisPagePort"; iface: string; otherWay: true }
  | { code: "firewall.pageRefused"; otherWay: false }
  | { code: "netApply.refusedFirewall"; otherWay: false }
  | { code: "netApply.refusedIface"; iface: string; otherWay: false };

export interface Impact {
  class: ImpactClass;
  findings: readonly Finding[];
}

const impactOf = (findings: readonly Finding[]): Impact => ({
  class: worstClass(findings.map((f) => f.class)),
  findings,
});

const NONE: Impact = { class: "none", findings: [] };
const BRIEF: Impact = { class: "brief", findings: [{ class: "brief" }] };
const MAY_CUT_UNKNOWN: Impact = {
  class: "mayCut",
  findings: [{ class: "mayCut", effect: null }],
};

// ---- An interface's settings changed or set up (0.5, 5.4, 5.5) -------------------------------------

/** What the save will send: a set…Iface request (or its fields) and the interface's type. */
export type IfaceAfter = SetIfaceBase &
  Partial<
    Pick<
      IfaceSettings,
      | "altmacaddress"
      | "slaves"
      | "bondprimary"
      | "bondmode"
      | "vlanid"
      | "vlanrawdevice"
      | "wpassid"
      | "keymanagement"
      | "band"
      | "hidden"
    >
  > & { type: IfaceType };

export interface IfaceChange {
  connection: Connection;
  /** The interface's name (for a new bond or bridge, "" until OMV names it). */
  devicename: string;
  /** The stored settings read just before (getInterface), or null for a new interface. */
  before: IfaceSettings | null;
  after: IfaceAfter;
  /** What the interface uses now, when it exists. */
  live: Pick<
    DeviceRow,
    "address" | "address6" | "prefix" | "prefix6" | "gateway" | "gateway6"
  > | null;
}

const methodOf = (s: { method: Method4; method6: Method6 }, family: Family) =>
  family === 4 ? s.method : s.method6;
const addressOf = (s: { address: string; address6: string }, family: Family) =>
  family === 4 ? s.address : s.address6;
const isOff = (m: Method4 | Method6) => m === "manual";
const isAutomatic = (m: Method4 | Method6) => m === "dhcp" || m === "auto";

/** The families the page's interface carries it on: the address's; by name, those with an address now (both when none). */
function familiesOnThis(
  connection: Connection,
  live: IfaceChange["live"],
): readonly Family[] {
  if (connection.kind === "known" || connection.kind === "unmanaged") {
    return [connection.family];
  }
  const now: Family[] = [];
  if (live !== null && live.address.trim() !== "") {
    now.push(4);
  }
  const v6 = (live?.address6.split("%")[0] ?? "").trim();
  if (v6 !== "" && !isLinkLocal(v6)) {
    now.push(6);
  }
  return now.length > 0 ? now : pageFamilies(connection);
}

const FAMILY_FIELDS = {
  4: {
    address: "address",
    netmask: "netmask",
    gateway: "gateway",
    method: "method",
  },
  6: {
    address: "address6",
    netmask: "netmask6",
    gateway: "gateway6",
    method: "method6",
  },
} as const;

/** Whether a new fixed address's size or router address differs from what the interface uses now. */
function differsFromLive(
  after: IfaceAfter,
  live: NonNullable<IfaceChange["live"]>,
  family: Family,
): boolean {
  const prefix = family === 4 ? prefixFromMask(after.netmask) : after.netmask6;
  const livePrefix = family === 4 ? live.prefix : live.prefix6;
  const gateway = family === 4 ? after.gateway : after.gateway6;
  const liveGateway = family === 4 ? live.gateway : live.gateway6;
  const sizeDiffers = livePrefix >= 0 && prefix !== livePrefix;
  const routerDiffers =
    (gateway.trim() !== "" || liveGateway.trim() !== "") &&
    !sameAddress(gateway, liveGateway);
  return sizeDiffers || routerDiffers;
}

const WIFI_FIELDS = ["wpassid", "keymanagement", "band", "hidden"] as const;
const LAYER_FIELDS = [
  "slaves",
  "bondprimary",
  "bondmode",
  "vlanid",
  "vlanrawdevice",
] as const;
const BRIEF_FIELDS = [
  "dnsnameservers",
  "dnssearch",
  "routemetric",
  "routemetric6",
  "wol",
  "comment",
] as const;

/** The findings of a change on this page's own interface (0.5's middle column). */
function onThisInterface(
  change: IfaceChange,
  before: IfaceSettings,
  changed: ReadonlySet<string>,
  wifiTyped: boolean,
): Finding[] {
  const { connection, after, live } = change;
  const findings: Finding[] = [];
  const families = familiesOnThis(connection, live);
  const iface = change.devicename;

  // Both families Off, or the page's family Off: Refused (5.5).
  const offAfter = ([4, 6] as const).filter((f) => isOff(methodOf(after, f)));
  for (const family of families) {
    if (
      isOff(methodOf(after, family)) &&
      (!isOff(methodOf(before, family)) || offAfter.length === 2)
    ) {
      findings.push({
        class: "refused",
        refusal: {
          code: "ifaceForm.refusedFamily",
          family: familyWord(family),
          iface,
          otherWay: true,
        },
      });
    }
  }
  if (findings.length > 0) {
    return findings;
  }

  for (const family of [4, 6] as const) {
    const fields = FAMILY_FIELDS[family];
    const touched = [
      fields.method,
      fields.address,
      fields.netmask,
      fields.gateway,
    ].some((k) => changed.has(k));
    if (!touched) {
      continue;
    }
    if (!families.includes(family)) {
      // The other family's settings (0.5).
      findings.push({ class: "brief" });
      continue;
    }
    const m0 = methodOf(before, family);
    const m1 = methodOf(after, family);
    const known =
      connection.kind === "known" || connection.kind === "unmanaged";
    if (m1 === "static") {
      const now = addressOf(after, family);
      const sameAsInUse =
        live !== null &&
        sameAddress(
          now,
          family === 4 ? live.address : (live.address6.split("%")[0] ?? ""),
        );
      const addressChanged =
        m0 !== "static" ? !sameAsInUse : changed.has(fields.address);
      if (addressChanged) {
        findings.push(
          known
            ? {
                class: "moves",
                effect: "netChange.effect.newAddress",
                family,
                old: connection.address,
                new: canonicalAddress(now) ?? now.trim(),
              }
            : // By name, the page's address is not known: the name may follow the new address, or not.
              { class: "mayCut", effect: null },
        );
      } else if (m0 !== "static") {
        // Automatic to fixed, the same address as in use.
        findings.push({ class: "brief" });
      }
      // The size and router address: against the stored ones for a fixed address; against what the
      // interface uses now when it was automatic (the router gave them).
      const sizeOrRouterChanged =
        m0 === "static"
          ? changed.has(fields.netmask) || changed.has(fields.gateway)
          : live !== null && differsFromLive(after, live, family);
      if (sizeOrRouterChanged) {
        findings.push({ class: "mayCut", effect: "netChange.effect.gateway" });
      }
    } else if (isAutomatic(m1) && m0 !== m1) {
      // Fixed to automatic, or one automatic way to another: the router chooses the address.
      findings.push({ class: "mayCut", effect: "netChange.effect.automatic" });
    } else {
      findings.push({ class: "brief" });
    }
  }

  if (BRIEF_FIELDS.some((k) => changed.has(k))) {
    findings.push({ class: "brief" });
  }
  if (changed.has("mtu")) {
    findings.push({
      class: "mayCut",
      effect: "netChange.effect.mtu",
      size: after.mtu,
    });
  }
  if (changed.has("altmacaddress")) {
    const automatic = families.some((f) => isAutomatic(methodOf(after, f)));
    findings.push({
      class: "mayCut",
      effect: automatic ? "netChange.effect.automatic" : null,
    });
  }
  if (WIFI_FIELDS.some((k) => changed.has(k)) || wifiTyped) {
    findings.push({ class: "mayCut", effect: "netChange.effect.wifi" });
  }
  if (LAYER_FIELDS.some((k) => changed.has(k))) {
    // A bond's or bridge's members or mode on the page's interface: not in 0.5's table; May cut.
    findings.push({ class: "mayCut", effect: null });
  }
  return findings;
}

/**
 * 0.5 for an interface's settings, against the stored settings read just before and the connection.
 * `wifiPasswordTyped`: a Wi-Fi save always carries a typed password, which this page cannot compare
 * with the stored one (6.2), so on this page's Wi-Fi it is May cut.
 */
export function classifyIfaceChange(
  change: IfaceChange,
  wifiPasswordTyped = change.after.type === "wifi",
): Impact {
  const { connection, before, after } = change;

  if (before === null) {
    return classifyNewIface(change);
  }
  const changed = new Set<string>(changedFields(before, after));
  const wifiTyped = after.type === "wifi" && wifiPasswordTyped;
  if (changed.size === 0 && !wifiTyped) {
    return NONE;
  }
  const where = standing(connection, change.devicename);
  if (where === "unknown") {
    return MAY_CUT_UNKNOWN;
  }
  if (where === "other") {
    return otherInterface(connection);
  }
  if (where === "under") {
    // Under this page's interface (a VLAN's parent): its own addresses do not carry the page, but
    // what changes how it carries traffic may cut what runs on it.
    const risky = [
      "mtu",
      "altmacaddress",
      "slaves",
      "bondmode",
      "bondprimary",
      ...WIFI_FIELDS,
      "method",
      "method6",
    ];
    return risky.some((k) => changed.has(k)) || wifiTyped
      ? MAY_CUT_UNKNOWN
      : BRIEF;
  }
  return impactOf(onThisInterface(change, before, changed, wifiTyped));
}

/** A new interface (0.5: a VLAN added on this page's interface; made part of a new bond or bridge). */
function classifyNewIface(change: IfaceChange): Impact {
  const { connection, after } = change;
  if (after.type === "bond" || after.type === "bridge") {
    for (const member of after.slaves ?? []) {
      const s = standing(connection, member);
      if (s === "this" || s === "under") {
        if (certainty(connection) === "notKnown") {
          return MAY_CUT_UNKNOWN;
        }
        return impactOf([
          {
            class: "refused",
            refusal: {
              code: "bond.thisPagePort",
              iface: member,
              otherWay: true,
            },
          },
        ]);
      }
    }
  }
  const where = standing(connection, after.devicename);
  if (where === "unknown") {
    return MAY_CUT_UNKNOWN;
  }
  if (where === "this" && change.live !== null) {
    // Setting up the port this page reaches the NAS through, which has no settings yet ("Set it up
    // as it is now…", P17): classified as any other change, against what it uses now.
    const now = asStored(change.live, after);
    const changed = new Set<string>(changedFields(now, after));
    const findings = onThisInterface(
      change,
      now,
      changed,
      after.type === "wifi",
    );
    return findings.length === 0 ? BRIEF : impactOf(findings);
  }
  if (
    after.type === "vlan" &&
    after.vlanrawdevice !== undefined &&
    onThisOrUnder(connection, after.vlanrawdevice)
  ) {
    // A VLAN added on this page's interface (0.5): Brief interruption, not yet measured on the VM.
    return BRIEF;
  }
  return otherInterface(connection);
}

/** Whether an interface is this page's, or under it. */
const onThisOrUnder = (connection: Connection, devicename: string): boolean => {
  const s = standing(connection, devicename);
  return s === "this" || s === "under";
};

/**
 * A change on another interface than this page's (18.2 #4, section 22 #2): on the test VM a set-up,
 * a packet-size change, a VLAN added and a VLAN removed on another interface did not interrupt the
 * page's interface at all, so it is Not affected. A port this page reaches the NAS through without
 * settings here keeps its address across OMV's network apply (18.2 #7, P17's conditional), so it is no
 * exception. Through a VPN (0.4's last row) the VPN may run over the changed port, which the VM did not
 * measure: Brief interruption at most, as 0.4 says.
 */
const otherInterface = (connection: Connection): Impact =>
  connection.kind === "unmanaged" && connection.virtual ? BRIEF : NONE;

/** What an interface without settings uses now, as if it were stored: fixed where it has an address, Off where not. */
function asStored(
  live: NonNullable<IfaceChange["live"]>,
  after: IfaceAfter,
): IfaceSettings {
  const v6 = (live.address6.split("%")[0] ?? "").trim();
  const global6 = v6 !== "" && !isLinkLocal(v6);
  const fields: SetIfaceBase = after;
  return {
    ...blankSettings(after.devicename, after.type),
    ...fields,
    altmacaddress: after.altmacaddress ?? "",
    method: live.address.trim() !== "" ? "static" : "manual",
    address: live.address.trim(),
    netmask: live.prefix >= 0 && live.prefix <= 32 ? maskText(live.prefix) : "",
    gateway: live.gateway.trim(),
    method6: global6 ? "static" : "manual",
    address6: global6 ? v6 : "",
    netmask6: live.prefix6 >= 0 ? live.prefix6 : 64,
    gateway6: live.gateway6.trim(),
  };
}

/** "With both off, the NAS cannot be reached through {{iface}}." (5.5) on another interface. */
export const bothOffLine = (
  connection: Connection,
  devicename: string,
  after: Pick<SetIfaceBase, "method" | "method6">,
): { code: "ifaceForm.bothOff"; iface: string } | null =>
  isOff(after.method) &&
  isOff(after.method6) &&
  standing(connection, devicename) !== "this"
    ? { code: "ifaceForm.bothOff", iface: devicename }
    : null;

/** Whether choosing these methods is refused on this page's interface (5.5), for the line under the choice. */
export function familyRefusal(change: IfaceChange): Refusal | null {
  const impact = classifyIfaceChange(change, false);
  const refused = impact.findings.find(
    (f): f is Extract<Finding, { class: "refused" }> => f.class === "refused",
  );
  return refused?.refusal.code === "ifaceForm.refusedFamily"
    ? refused.refusal
    : null;
}

// ---- Removing an interface's settings (0.5, 10.1, 10.3) ----------------------------------------------

export function classifyRemoval(input: {
  connection: Connection;
  devicename: string;
  devices: readonly DeviceRow[];
  stored: readonly IfaceSettings[];
}): Impact {
  const refusal = removalRefusal(input.devicename, input);
  if (refusal !== null) {
    switch (refusal.code) {
      case "ifaceDelete.refusedThis":
        return impactOf([
          { class: "refused", refusal: { ...refusal, otherWay: true } },
        ]);
      case "ifaceDelete.refusedUnder":
        return impactOf([
          { class: "refused", refusal: { ...refusal, otherWay: true } },
        ]);
      case "ifaceDelete.refusedVlan":
        return impactOf([
          { class: "refused", refusal: { ...refusal, otherWay: false } },
        ]);
      case "iface.member":
      case "iface.memberBridge":
      case "noSettings":
        // Nothing to remove; the page offers no button (4.2 item 8).
        return NONE;
    }
  }
  if (standing(input.connection, input.devicename) === "unknown") {
    return MAY_CUT_UNKNOWN;
  }
  const removed = storedFor(input.stored, input.devicename);
  if (
    removed?.type === "vlan" &&
    removed.vlanrawdevice !== "" &&
    onThisOrUnder(input.connection, removed.vlanrawdevice)
  ) {
    // A VLAN removed from this page's interface (0.5): Brief interruption.
    return BRIEF;
  }
  return otherInterface(input.connection);
}

/** Whether a port may be chosen for a new bond or bridge (0.8), as memberRefusal says. */
export { memberRefusal };

// ---- The name and the domain (0.5's first rows) -------------------------------------------------------

/** The same form of the NAS's name, with the new values. */
export function nameIn(form: NameForm, general: GeneralSettings): string {
  const hostname = general.hostname.trim().toLowerCase();
  switch (form) {
    case "short":
      return hostname;
    case "local":
      return `${hostname}.local`;
    case "fqdn": {
      const domain = general.domainname.trim();
      return domain === "" ? hostname : `${hostname}.${domain}`;
    }
  }
}

/**
 * Moves when the page was opened by the old name (or, for the domain, at {{hostname}}.{{domain}});
 * otherwise Not affected. Other computers are affected either way (2.3, generalModel.nameEffects).
 */
export function classifyNameChange(
  connection: Connection,
  stored: GeneralSettings,
  draft: GeneralSettings,
): Impact {
  const changed = generalChanged(stored, draft);
  if (!changed.hostname && !changed.domainname) {
    return NONE;
  }
  if (connection.kind === "readFailed") {
    return MAY_CUT_UNKNOWN;
  }
  if (connection.kind !== "probable" && connection.kind !== "nameOnly") {
    return NONE;
  }
  const form = connection.nameForm;
  if (changed.hostname || (changed.domainname && form === "fqdn")) {
    // Without a domain, {{hostname}}.{{domain}} becomes the bare name.
    return impactOf([
      {
        class: "moves",
        effect: "netChange.effect.newName",
        old: connection.host,
        new: nameIn(form, draft),
      },
    ]);
  }
  return NONE;
}

// ---- The firewall and the proxy ----------------------------------------------------------------------

/** 0.5's firewall row, from the check (11.5) of the list as it would be saved. */
export function classifyFirewall(check: ListCheck | BothChecks): Impact {
  if (check.impact === "none") {
    return NONE;
  }
  if (check.impact === "refused") {
    return impactOf([
      {
        class: "refused",
        refusal: { code: "firewall.pageRefused", otherWay: false },
      },
    ]);
  }
  const verdicts =
    "lists" in check
      ? check.lists.map((l) => l.page.verdict)
      : [check.page.verdict];
  const who = verdicts.flatMap((v) =>
    v.kind === "onlySome" || v.kind === "blockedSome" ? v.who : [],
  );
  return impactOf([
    { class: "mayCut", effect: "netChange.effect.firewall", who },
  ]);
}

/** The proxy is Not affected (0.5): this page does not go through it. */
export const classifyProxy = (): Impact => NONE;

/** Blinking a port (4.4): the warning and the wait when it is this page's interface, under it, or the page cannot tell. */
export function blinkAffectsPage(
  connection: Connection,
  devicename: string,
): boolean {
  const s = standing(connection, devicename);
  return s === "this" || s === "under" || s === "unknown";
}

// ---- What it does to other computers (5.6, 7.2) -------------------------------------------------------

export type OtherEffect =
  | { code: "ifaceForm.other.address"; old: string; new: string }
  | { code: "ifaceForm.other.dhcpPool"; address: string }
  | { code: "ifaceForm.other.mac" }
  | { code: "ifaceForm.other.wol"; iface: string }
  /** A new bond takes its first port's hardware address (VM fact, 18.2 #8). */
  | { code: "bond.newMac" }
  /** A new bridge gets its own hardware address (7.2's line as the design wrote it; not observed). */
  | { code: "bridge.newMac" };

export function otherEffects(
  devicename: string,
  before: IfaceSettings | null,
  after: IfaceAfter,
): OtherEffect[] {
  const effects: OtherEffect[] = [];
  if (before === null) {
    if (after.type === "bond") {
      effects.push({ code: "bond.newMac" });
    } else if (after.type === "bridge") {
      effects.push({ code: "bridge.newMac" });
    }
    return effects;
  }
  for (const family of [4, 6] as const) {
    const m0 = methodOf(before, family);
    const m1 = methodOf(after, family);
    const a0 = addressOf(before, family);
    const a1 = addressOf(after, family);
    if (m0 === "static" && m1 === "static" && !sameAddress(a0, a1)) {
      effects.push({
        code: "ifaceForm.other.address",
        old: canonicalAddress(a0) ?? a0.trim(),
        new: canonicalAddress(a1) ?? a1.trim(),
      });
    } else if (m0 !== "static" && m1 === "static") {
      effects.push({
        code: "ifaceForm.other.dhcpPool",
        address: canonicalAddress(a1) ?? a1.trim(),
      });
    }
  }
  const mac0 = (before.altmacaddress ?? "").trim().toLowerCase();
  const mac1 = (after.altmacaddress ?? mac0).trim().toLowerCase();
  if (mac1 !== mac0 && mac1 !== "") {
    effects.push({ code: "ifaceForm.other.mac" });
  }
  if (before.wol && !after.wol) {
    effects.push({ code: "ifaceForm.other.wol", iface: devicename });
  }
  return effects;
}

// ---- The band's apply confirmation (1.8) --------------------------------------------------------------

/** The modules whose pending state makes the band run this check (13.1). */
export const BAND_CHECK_MODULES = [
  "systemd-networkd",
  "hosts",
  "hostname",
  "iptables",
] as const;

export const bandChecks = (pending: readonly string[]): boolean =>
  BAND_CHECK_MODULES.some((m) => pending.includes(m));

/** One line under "What is applied" (1.8), as its copy key and values. */
export type BandLine =
  | {
      code: "netApply.lineMoves";
      class: "moves";
      iface: string;
      old: string;
      new: string;
    }
  | { code: "netApply.lineMayCut"; class: "mayCut"; iface: string }
  | { code: "netApply.lineBrief"; class: "brief" }
  | { code: "netApply.lineFirewall"; class: "mayCut"; who: readonly Recorded[] }
  /** The name: "This page stops working at {{old}}. The NAS will be at {{new}}." */
  | { code: "network.impact.moves"; class: "moves"; old: string; new: string }
  /** The page cannot tell which interface it uses, or a read failed: "If this setting is wrong…". */
  | { code: "network.impact.mayCut"; class: "mayCut" }
  | { code: "netApply.refusedFirewall"; class: "refused" }
  | { code: "netApply.refusedIface"; class: "refused"; iface: string };

export interface BandInput {
  pending: readonly string[];
  location: PageLocation;
  connection: Connection;
  /** Network.enumerateDevicesList: what each interface uses now. */
  devices: Read<readonly DeviceRow[]>;
  /** Network.getInterfaceList: the stored settings the apply puts in place. */
  stored: Read<readonly IfaceSettings[]>;
  /** Network.getGeneralSettings: the stored name. */
  general: Read<GeneralSettings>;
  /**
   * The name in effect (System.getInformation's `hostname`, with or without its domain), when the
   * caller has it: the page compares it with the name it was opened by.
   */
  appliedHostname?: string;
  /** The check (11.5) of the stored rules, both lists; null when iptables is not pending. */
  firewall: BothChecks | null;
  /**
   * The interface lines from the classes this session's saves were given (bandSession.ts), when every
   * pending network change was saved in this session; null or absent to use 1.8's server-state rules.
   */
  session?: readonly BandLine[] | null;
}

export interface BandCheck {
  class: ImpactClass;
  lines: readonly BandLine[];
  /** How the confirmation escalates (1.8): the ordinary one with the line, the typed one, or Apply unavailable. */
  confirmation: "ordinary" | "typed" | "unavailable";
}

function interfaceLines(input: BandInput): BandLine[] {
  const { connection, devices, stored } = input;
  if (devices.state !== "ok" || stored.state !== "ok") {
    return [{ code: "network.impact.mayCut", class: "mayCut" }];
  }
  if (connection.kind === "unmanaged") {
    // The page's interface has no stored settings the apply could change (18.2 #7 for a port).
    return [{ code: "netApply.lineBrief", class: "brief" }];
  }
  if (connection.kind !== "known" && connection.kind !== "probable") {
    return [{ code: "network.impact.mayCut", class: "mayCut" }];
  }
  const iface = connection.iface;
  const live = devices.data.find((d) => d.devicename === iface);
  const settings = storedFor(stored.data, iface);
  if (settings === null || live === undefined) {
    return [{ code: "netApply.refusedIface", class: "refused", iface }];
  }
  const families = familiesOnThis(connection, live);
  if (families.some((f) => isOff(methodOf(settings, f)))) {
    return [{ code: "netApply.refusedIface", class: "refused", iface }];
  }
  const differences = differsFromInUse(settings, live);
  const lines: BandLine[] = [];
  for (const family of families) {
    const method = methodOf(settings, family);
    const addressField = family === 4 ? "address" : "address6";
    if (
      method === "static" &&
      differences.some((d) => d.field === addressField)
    ) {
      lines.push(
        connection.kind === "known"
          ? {
              code: "netApply.lineMoves",
              class: "moves",
              iface,
              old: connection.address,
              new:
                canonicalAddress(addressOf(settings, family)) ??
                addressOf(settings, family).trim(),
            }
          : { code: "netApply.lineMayCut", class: "mayCut", iface },
      );
    } else if (isAutomatic(method)) {
      // A stored automatic method while it now has an address (1.8): the page cannot tell whether
      // the pending change turned a fixed address automatic, so it cannot rule out a new address.
      lines.push({ code: "netApply.lineMayCut", class: "mayCut", iface });
    }
  }
  const other = differences.filter((d) =>
    [
      "netmask",
      "gateway",
      "netmask6",
      "gateway6",
      "mtu",
      "altmacaddress",
    ].includes(d.field),
  );
  if (other.length > 0 || settings.type === "wifi") {
    lines.push({ code: "netApply.lineMayCut", class: "mayCut", iface });
  }
  if (lines.length === 0) {
    lines.push({ code: "netApply.lineBrief", class: "brief" });
  }
  // One line per class and interface.
  return lines.filter(
    (line, i) => lines.findIndex((l) => l.code === line.code) === i,
  );
}

function nameLines(input: BandInput): BandLine[] {
  const host = parsePageHost(input.location.hostname);
  if (host === null || host.kind !== "name") {
    return [];
  }
  if (input.general.state !== "ok") {
    return [{ code: "network.impact.mayCut", class: "mayCut" }];
  }
  const storedForms = nameForms(input.general.data);
  if (storedForms.some((f) => f.name === host.name)) {
    return [];
  }
  if (input.appliedHostname === undefined) {
    return [{ code: "network.impact.mayCut", class: "mayCut" }];
  }
  const applied = input.appliedHostname.trim().toLowerCase();
  const dot = applied.indexOf(".");
  const appliedGeneral: GeneralSettings =
    dot === -1
      ? { hostname: applied, domainname: input.general.data.domainname }
      : { hostname: applied.slice(0, dot), domainname: applied.slice(dot + 1) };
  const form = nameForms(appliedGeneral).find(
    (f) => f.name === host.name,
  )?.form;
  if (form === undefined) {
    // Another name altogether (a router's or a VPN's): the stored name does not change it.
    return [];
  }
  return [
    {
      code: "network.impact.moves",
      class: "moves",
      old: host.name,
      new: nameIn(form, input.general.data),
    },
  ];
}

function firewallLines(check: BothChecks): BandLine[] {
  if (check.impact === "refused") {
    return [{ code: "netApply.refusedFirewall", class: "refused" }];
  }
  if (check.impact === "mayCut") {
    const who = check.lists.flatMap((l) =>
      l.page.verdict.kind === "onlySome" ||
      l.page.verdict.kind === "blockedSome"
        ? l.page.verdict.who
        : [],
    );
    return [{ code: "netApply.lineFirewall", class: "mayCut", who }];
  }
  return [];
}

/** 1.8: the check from the server's state, whenever a network module is pending. */
export function bandCheck(input: BandInput): BandCheck {
  const lines: BandLine[] = [];
  if (input.pending.includes(NETWORK_MODULE)) {
    lines.push(
      ...(input.session !== undefined && input.session !== null
        ? input.session
        : interfaceLines(input)),
    );
  }
  if (input.pending.includes("hostname") || input.pending.includes("hosts")) {
    lines.push(...nameLines(input));
  }
  if (input.pending.includes("iptables")) {
    lines.push(
      ...(input.firewall === null
        ? [{ code: "network.impact.mayCut", class: "mayCut" } as const]
        : firewallLines(input.firewall)),
    );
  }
  const cls = worstClass(lines.map((l) => l.class));
  return {
    class: cls,
    lines,
    confirmation:
      cls === "refused"
        ? "unavailable"
        : cls === "moves" || cls === "mayCut"
          ? "typed"
          : "ordinary",
  };
}

/** For the attention line and the interface's page: the stored size as /n (OMV stores it dotted). */
export const storedPrefix = (
  settings: Pick<IfaceSettings, "netmask">,
): number | null => prefixFromMask(settings.netmask);
