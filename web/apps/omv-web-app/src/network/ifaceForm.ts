// SPDX-License-Identifier: GPL-3.0-or-later
// The interface form's model (phase 5 network design 5 to 9): the draft a form holds for each kind
// (network port, Wi-Fi, bond, VLAN, bridge), its first values (the stored settings, or the classic
// form's defaults for a new interface, D4, D5), every check of 5.3, 6, 7, 8 and 0.8 on it, what the
// save would send (for 5.4's class line while typing, and the request itself through ifaceModel's
// builders), which ports a bond or bridge may take (0.8), the name OMV will give a new bond or bridge,
// and the change flow's "Now" and "After" rows (1.4). Pure: the words are the page's. Never a
// password: the Wi-Fi password is passed in for the one request and never kept here (0.6).
import { rowNetwork, standing, type Connection } from "./connection.ts";
import {
  NEW_OBJECT_UUID,
  type BondMode,
  type DeviceRow,
  type IfaceSettings,
  type IfaceType,
  type KeyManagement,
  type SetWirelessIfaceRequest,
  type WifiBand,
} from "./dto.ts";
import {
  addressDraftOf,
  addressFields,
  blankSettings,
  BOND_MODE_NAMES,
  BOND_MODES,
  bondModeOf,
  bondRequest,
  bridgeRequest,
  checkAddresses,
  checkBond,
  checkVlan,
  checkWifi,
  ethernetRequest,
  howWord4,
  howWord6,
  memberRefusal,
  NEW_ADDRESS_DRAFT,
  otherAddresses,
  splitList,
  vlanName,
  vlanRequest,
  wifiRequest,
  type AddressCheckContext,
  type AddressDraft,
  type AddressProblem,
  type BondProblem,
  type HowKey,
  type StoredRequest,
  type VlanProblem,
  type WifiProblem,
} from "./ifaceModel.ts";
import type { IfaceAfter } from "./impact.ts";
import { canonicalAddress, prefixFromMask, type IpNetwork } from "./ip.ts";

/** The packet size choice (5.2 item 5): Standard, Jumbo packets (9000 bytes), or another size. */
export type MtuChoice = "standard" | "jumbo" | "other";
export const JUMBO_MTU = 9000;

/** What an interface form holds while the reader types: never a password (0.6). */
export interface IfaceFormDraft {
  /** The address part (5.2); `mtu` is the text under "Another size". */
  address: AddressDraft;
  mtuChoice: MtuChoice;
  /** A new port or Wi-Fi interface: the device chosen. */
  port: string;
  wpassid: string;
  keymanagement: KeyManagement;
  band: WifiBand;
  hidden: boolean;
  /** A bond's ports, a bridge's interfaces. */
  slaves: readonly string[];
  /** As stored: a mode set in the classic interface is kept until another is chosen (7.1 item 3). */
  bondmode: BondMode;
  bondprimary: string;
  vlanrawdevice: string;
  vlanid: string;
}

/** The form's first values: the stored settings, or the classic form's defaults (0.9, D4). */
export function initialDraft(
  read: IfaceSettings | null,
  port = "",
): IfaceFormDraft {
  const address: AddressDraft =
    read === null ? { ...NEW_ADDRESS_DRAFT } : addressDraftOf(read);
  const mtu = read?.mtu ?? 0;
  const mtuChoice: MtuChoice =
    mtu === 0 ? "standard" : mtu === JUMBO_MTU ? "jumbo" : "other";
  return {
    address: { ...address, mtu: mtuChoice === "other" ? String(mtu) : "" },
    mtuChoice,
    port: read?.devicename ?? port,
    wpassid: read?.wpassid ?? "",
    keymanagement: read?.keymanagement === "sae" ? "sae" : "psk",
    band: read?.band === "2.4GHz" || read?.band === "5GHz" ? read.band : "auto",
    hidden: read?.hidden ?? false,
    slaves: [...(read?.slaves ?? [])],
    bondmode:
      read === null
        ? BOND_MODES.backup
        : (bondModeOf(read.bondmode) ?? BOND_MODES.backup),
    bondprimary: read?.bondprimary ?? "",
    vlanrawdevice: read?.vlanrawdevice ?? "",
    vlanid: read === null || read.vlanid <= 0 ? "" : String(read.vlanid),
  };
}

/** The address part as sent: the packet size from the choice. */
export function effectiveAddress(draft: IfaceFormDraft): AddressDraft {
  const mtu =
    draft.mtuChoice === "standard"
      ? "0"
      : draft.mtuChoice === "jumbo"
        ? String(JUMBO_MTU)
        : draft.address.mtu;
  return { ...draft.address, mtu };
}

/** Whether a field under "Advanced" differs from its default, so the part opens (5.2 item 5). */
export function advancedSet(draft: IfaceFormDraft): boolean {
  const a = draft.address;
  return (
    draft.mtuChoice !== "standard" ||
    a.wol ||
    a.altmacaddress.trim() !== "" ||
    a.routemetric.trim() !== "0" ||
    a.routemetric6.trim() !== "1" ||
    a.comment !== ""
  );
}

/** The route priorities are shown only with a fixed address and a router address (5.2 item 5). */
export const showsMetric = (draft: IfaceFormDraft, family: 4 | 6): boolean =>
  family === 4
    ? draft.address.method === "static" && draft.address.gateway.trim() !== ""
    : draft.address.method6 === "static" &&
      draft.address.gateway6.trim() !== "";

/** The kinds whose request carries a hardware address (OMV's bond and bridge methods take none). */
export const takesMac = (kind: IfaceType): boolean =>
  kind === "ethernet" || kind === "wifi" || kind === "vlan";

// ---- Names ---------------------------------------------------------------------------------------

/**
 * The interface's name as the save will send it: the stored one; the port chosen; a VLAN's
 * {{parent}}.{{id}}; "" for a new bond or bridge (OMV chooses it).
 */
export function devicenameOf(
  kind: IfaceType,
  read: IfaceSettings | null,
  draft: IfaceFormDraft,
): string {
  if (read !== null) {
    return read.devicename;
  }
  switch (kind) {
    case "ethernet":
    case "wifi":
      return draft.port;
    case "vlan": {
      const id = Number(draft.vlanid.trim());
      return draft.vlanrawdevice !== "" &&
        Number.isInteger(id) &&
        id >= 1 &&
        id <= 4094
        ? vlanName(draft.vlanrawdevice, id)
        : "";
    }
    case "bond":
    case "bridge":
      return "";
  }
}

/** The next free name of a kind OMV names itself ("bond0", "br1"): "The NAS names it bond0." (7.1, 9.1). */
export function nextFreeName(
  stored: readonly Pick<IfaceSettings, "devicename">[],
  devices: readonly Pick<DeviceRow, "devicename">[],
  prefix: "bond" | "br",
): string {
  const taken = new Set([
    ...stored.map((s) => s.devicename),
    ...devices.map((d) => d.devicename),
  ]);
  let n = 0;
  while (taken.has(`${prefix}${String(n)}`)) {
    n += 1;
  }
  return `${prefix}${String(n)}`;
}

// ---- Checks (5.3, 6, 7, 8, 0.8) ---------------------------------------------------------------------

/** One problem of the form, by the field it is shown under. */
export type FormProblem =
  | AddressProblem
  | BondProblem
  | VlanProblem
  | WifiProblem
  /** A new port or Wi-Fi interface with nothing chosen. */
  | { field: "port"; code: "ifaceForm.err.port" | "wifi.err.hardware" }
  /** A new VLAN with nothing to run on chosen. */
  | { field: "vlanrawdevice"; code: "vlan.err.runsOn" };

export type FormField = FormProblem["field"];

/** The address checks' context: every other interface's addresses, a VLAN's parent's networks (8.1). */
export function checkContext(input: {
  devicename: string;
  devices: readonly DeviceRow[];
  stored: readonly IfaceSettings[];
  /** A VLAN's parent, or null. */
  vlanParent: string | null;
}): AddressCheckContext {
  const others = otherAddresses(input.devicename, input.devices, input.stored);
  if (input.vlanParent === null || input.vlanParent === "") {
    return { others };
  }
  const parent = input.devices.find((d) => d.devicename === input.vlanParent);
  const networks =
    parent === undefined
      ? []
      : ([rowNetwork(parent, 4), rowNetwork(parent, 6)].filter(
          (n): n is IpNetwork => n !== null,
        ) as IpNetwork[]);
  return { others, vlanParent: { devicename: input.vlanParent, networks } };
}

/** Every problem of the form, in the order the fields are shown. */
export function formProblems(input: {
  kind: IfaceType;
  isNew: boolean;
  draft: IfaceFormDraft;
  context: AddressCheckContext;
  stored: readonly IfaceSettings[];
  /** The Wi-Fi password typed for this save (0.6); "" when none. */
  password: string;
}): FormProblem[] {
  const { kind, isNew, draft } = input;
  const problems: FormProblem[] = [];
  if (isNew && (kind === "ethernet" || kind === "wifi") && draft.port === "") {
    problems.push({
      field: "port",
      code: kind === "wifi" ? "wifi.err.hardware" : "ifaceForm.err.port",
    });
  }
  if (kind === "wifi") {
    problems.push(
      ...checkWifi({ wpassid: draft.wpassid, wpapsk: input.password }),
    );
  }
  if (kind === "bond") {
    problems.push(...checkBond(draft));
  }
  if (kind === "vlan" && isNew) {
    if (draft.vlanrawdevice === "") {
      problems.push({ field: "vlanrawdevice", code: "vlan.err.runsOn" });
    }
    problems.push(...checkVlan(draft, input.stored));
  }
  const address = effectiveAddress(draft);
  const addressProblems = checkAddresses(address, input.context);
  problems.push(...addressProblems);
  // "Another size" with nothing typed would otherwise be sent as Standard.
  if (
    draft.mtuChoice === "other" &&
    /^0*$/u.test(draft.address.mtu.trim()) &&
    !addressProblems.some((p) => p.field === "mtu")
  ) {
    problems.push({ field: "mtu", code: "ifaceForm.err.mtu" });
  }
  return problems;
}

// ---- What the save sends --------------------------------------------------------------------------

/** An interface's write, as useNetworkApi takes it (the Wi-Fi request with the password typed). */
export type FormWrite =
  | Exclude<StoredRequest, { type: "wifi" }>
  | { type: "wifi"; request: SetWirelessIfaceRequest };

/**
 * What the save would send, without its checks and without a password, for 5.4's class line while
 * typing (impact.ts). A field that does not parse yet keeps the value read.
 */
export function afterOf(
  kind: IfaceType,
  read: IfaceSettings | null,
  draft: IfaceFormDraft,
): IfaceAfter {
  const address = effectiveAddress(draft);
  const base = {
    uuid: read?.uuid ?? NEW_OBJECT_UUID,
    devicename: devicenameOf(kind, read, draft),
    ...addressFields(address, read),
    type: kind,
  };
  const mac = address.altmacaddress.trim().toLowerCase();
  switch (kind) {
    case "ethernet":
      return { ...base, altmacaddress: mac };
    case "wifi":
      return {
        ...base,
        altmacaddress: mac,
        wpassid: draft.wpassid,
        keymanagement: draft.keymanagement,
        band: draft.band,
        hidden: draft.hidden,
      };
    case "bond":
      return {
        ...base,
        slaves: [...draft.slaves],
        bondprimary: draft.bondprimary.trim(),
        bondmode: draft.bondmode,
      };
    case "vlan": {
      const id = Number(draft.vlanid.trim());
      return {
        ...base,
        altmacaddress: mac,
        vlanid: read?.vlanid ?? (Number.isInteger(id) ? id : 0),
        vlanrawdevice: read?.vlanrawdevice ?? draft.vlanrawdevice,
      };
    }
    case "bridge":
      return { ...base, slaves: [...draft.slaves] };
  }
}

/**
 * The request itself (0.9): ifaceModel's builders, which refuse a draft that has not passed its
 * checks. `read` is getInterface's object read immediately before (R4), null for a new interface;
 * `password` is the Wi-Fi password typed for this request, held by the caller only until it returns.
 */
export function writeOf(input: {
  kind: IfaceType;
  read: IfaceSettings | null;
  draft: IfaceFormDraft;
  context: AddressCheckContext;
  stored: readonly IfaceSettings[];
  password: string;
}): FormWrite {
  const { kind, read, draft, context } = input;
  const address = effectiveAddress(draft);
  switch (kind) {
    case "ethernet":
      return {
        type: "ethernet",
        request: ethernetRequest(
          read,
          devicenameOf(kind, read, draft),
          address,
          context,
        ),
      };
    case "wifi":
      return {
        type: "wifi",
        request: wifiRequest(
          read,
          devicenameOf(kind, read, draft),
          {
            ...address,
            wpassid: draft.wpassid,
            wpapsk: input.password,
            keymanagement: draft.keymanagement,
            band: draft.band,
            hidden: draft.hidden,
          },
          context,
        ),
      };
    case "bond":
      return {
        type: "bond",
        request: bondRequest(
          read,
          {
            ...address,
            slaves: draft.slaves,
            bondmode: draft.bondmode,
            bondprimary: draft.bondprimary,
          },
          context,
        ),
      };
    case "vlan":
      return {
        type: "vlan",
        request: vlanRequest(
          read,
          {
            ...address,
            vlanrawdevice: draft.vlanrawdevice,
            vlanid: draft.vlanid,
          },
          context,
          input.stored,
        ),
      };
    case "bridge":
      return {
        type: "bridge",
        request: bridgeRequest(
          read,
          { ...address, slaves: draft.slaves },
          context,
        ),
      };
  }
}

// ---- A bond's ports, a bridge's interfaces (7.1, 9.1, 0.8) --------------------------------------------

/** A device a bond or bridge may list, as the candidate reads return it. */
export type Candidate = Pick<
  DeviceRow,
  "devicename" | "ether" | "link" | "speed"
> & { type?: string };

export interface MemberChoice {
  candidate: Candidate;
  /** Listed but not choosable: this page reaches the NAS through it ("This page reaches the NAS through it."). */
  thisPage: boolean;
}

/**
 * The interfaces a bond or bridge offers (7.1 item 2, 9.1 item 2): OMV's candidates without those 0.8
 * refuses (settings of their own, part of another bond or bridge, a VLAN on it: not offered), the
 * bond's or bridge's own members, and this page's own interface listed unavailable. OMV's bridge list
 * includes a bond that has settings (VM fact, 18.2 #8): it is not offered.
 */
export function memberChoices(input: {
  kind: "bond" | "bridge";
  candidates: readonly Candidate[];
  connection: Connection;
  devices: readonly DeviceRow[];
  stored: readonly IfaceSettings[];
  /** The bond's or bridge's own members when it exists. */
  own: readonly string[];
}): MemberChoice[] {
  const { kind, connection, devices, stored, own } = input;
  const listed = new Map<string, Candidate>();
  for (const c of input.candidates) {
    listed.set(c.devicename, c);
  }
  for (const name of own) {
    const row = devices.find((d) => d.devicename === name);
    if (!listed.has(name) && row !== undefined) {
      listed.set(name, row);
    }
  }
  // This page's own interface, so the reader sees why it is not offered.
  for (const row of devices) {
    const s = standing(connection, row.devicename);
    const fits =
      kind === "bond"
        ? row.type === "ethernet" && (s === "this" || s === "under")
        : s === "this" &&
          row.type !== "wifi" &&
          row.type !== "bridge" &&
          row.type !== "loopback" &&
          row.type !== "virtual";
    if (fits && !listed.has(row.devicename)) {
      listed.set(row.devicename, row);
    }
  }
  const choices: MemberChoice[] = [];
  for (const candidate of listed.values()) {
    if (own.includes(candidate.devicename)) {
      choices.push({ candidate, thisPage: false });
      continue;
    }
    const refusal = memberRefusal(candidate.devicename, {
      connection,
      devices,
      stored,
    });
    if (refusal === null) {
      choices.push({ candidate, thisPage: false });
    } else if (refusal.code === "bond.thisPagePort") {
      choices.push({ candidate, thisPage: true });
    }
  }
  return choices;
}

/** Tick or untick a member; a main port that is no longer a member is cleared. */
export function toggleMember(
  draft: IfaceFormDraft,
  devicename: string,
  on: boolean,
): IfaceFormDraft {
  const slaves = on
    ? [...draft.slaves.filter((s) => s !== devicename), devicename]
    : draft.slaves.filter((s) => s !== devicename);
  return {
    ...draft,
    slaves,
    bondprimary: slaves.includes(draft.bondprimary) ? draft.bondprimary : "",
  };
}

// ---- The change flow's "Now" and "After" (1.4 step 2, item 2) -----------------------------------------

/** The words a value of the comparison may take (copy keys). */
export type RowKey =
  | HowKey
  | "ifaceForm.row.byRouter"
  | "ifaceForm.row.on"
  | "ifaceForm.row.macOwn"
  | "ifaceForm.off"
  | "netChange.note.mtuStandard"
  | "bond.mode.backup"
  | "bond.mode.lacp"
  | "bond.mode.alb"
  | "wifi.frequency.auto"
  | "wifi.frequency.ghz24"
  | "wifi.frequency.ghz5"
  | "wifi.wpa2"
  | "wifi.wpa3"
  | "wifi.passwordSet"
  | "wifi.typedAgain";

/** A row's label (copy keys). */
export type RowLabel =
  | "netChange.note.ipv4How"
  | "netChange.note.ipv4Address"
  | "netChange.note.ipv4Gateway"
  | "netChange.note.ipv6How"
  | "netChange.note.ipv6Address"
  | "netChange.note.ipv6Gateway"
  | "netChange.note.dnsServers"
  | "netChange.note.search"
  | "netChange.note.mtu"
  | "ifaceForm.row.wol"
  | "ifaceForm.row.mac"
  | "ifaceForm.metric4"
  | "ifaceForm.metric6"
  | "ifaceForm.note"
  | "wifi.name"
  | "wifi.security"
  | "wifi.frequency.label"
  | "wifi.hiddenRow"
  | "wifi.password"
  | "bond.ports"
  | "bond.mode.label"
  | "bond.primary"
  | "bridge.members"
  | "vlan.runsOn"
  | "vlan.id";

/** A value in the comparison: text from the NAS or typed (shown as an identifier), words, or none. */
export type RowValue =
  | { kind: "text"; text: string }
  | { kind: "key"; key: RowKey }
  /** "{{size}} bytes". */
  | { kind: "bytes"; size: string }
  /** "{{mode}} (set in the classic interface)". */
  | { kind: "classicMode"; mode: string }
  | { kind: "none" };

export interface SummaryRow {
  id: string;
  /** The row's label, a copy key. */
  label: RowLabel;
  now: RowValue;
  after: RowValue;
  changed: boolean;
}

const text = (t: string): RowValue =>
  t.trim() === "" ? { kind: "none" } : { kind: "text", text: t.trim() };
const key = (k: RowKey): RowValue => ({ kind: "key", key: k });
const NONE: RowValue = { kind: "none" };
const BY_ROUTER = key("ifaceForm.row.byRouter");
const same = (a: RowValue, b: RowValue) =>
  JSON.stringify(a) === JSON.stringify(b);

type Live = Pick<
  DeviceRow,
  "address" | "prefix" | "address6" | "prefix6" | "gateway" | "gateway6"
>;

const address4 = (s: Pick<IfaceSettings, "address" | "netmask">) => {
  const prefix = prefixFromMask(s.netmask);
  const a = canonicalAddress(s.address) ?? s.address.trim();
  return prefix === null ? text(a) : text(`${a}/${String(prefix)}`);
};
const address6 = (s: Pick<IfaceSettings, "address6" | "netmask6">) =>
  text(
    `${canonicalAddress(s.address6) ?? s.address6.trim()}/${String(s.netmask6)}`,
  );
const liveAddress = (live: Live | null, family: 4 | 6): RowValue => {
  if (live === null) {
    return NONE;
  }
  const a = family === 4 ? live.address : (live.address6.split("%")[0] ?? "");
  const p = family === 4 ? live.prefix : live.prefix6;
  return a.trim() === "" ? NONE : text(p >= 0 ? `${a.trim()}/${String(p)}` : a);
};
const mtuValue = (mtu: number): RowValue =>
  mtu === 0
    ? key("netChange.note.mtuStandard")
    : { kind: "bytes", size: String(mtu) };
const onOff = (on: boolean): RowValue =>
  key(on ? "ifaceForm.row.on" : "ifaceForm.off");
const list = (items: readonly string[]): RowValue =>
  items.length === 0 ? NONE : text(items.join(", "));
const bondModeValue = (mode: number): RowValue => {
  switch (mode) {
    case BOND_MODES.backup:
      return key("bond.mode.backup");
    case BOND_MODES.lacp:
      return key("bond.mode.lacp");
    case BOND_MODES.alb:
      return key("bond.mode.alb");
    default:
      return {
        kind: "classicMode",
        mode: BOND_MODE_NAMES[mode] ?? String(mode),
      };
  }
};
const bandValue = (band: string): RowValue =>
  band === "2.4GHz"
    ? key("wifi.frequency.ghz24")
    : band === "5GHz"
      ? key("wifi.frequency.ghz5")
      : key("wifi.frequency.auto");

/**
 * The comparison of 1.4: the address rows of both families always (how, address, router), then every
 * other setting that changes. For a new interface "Now" is what it uses now, or "Not set up here".
 * The Wi-Fi password is never a value: "Password: Set" and "Password: typed again" (6.2).
 */
export function summaryRows(input: {
  kind: IfaceType;
  before: IfaceSettings | null;
  after: IfaceAfter;
  live: Live | null;
}): SummaryRow[] {
  const { kind, after, live } = input;
  const isNew = input.before === null;
  const before = input.before ?? blankSettings(after.devicename, kind);
  const rows: SummaryRow[] = [];
  const push = (
    id: string,
    label: RowLabel,
    now: RowValue,
    next: RowValue,
    always = false,
  ) => {
    const changed = !same(now, next);
    if (always || changed) {
      rows.push({ id, label, now, after: next, changed });
    }
  };

  // IPv4 and IPv6: how, address, router (always).
  const how4Now = isNew
    ? key("interfaces.how.notSetUp")
    : key(howWord4(before.method));
  push(
    "ipv4How",
    "netChange.note.ipv4How",
    how4Now,
    key(howWord4(after.method)),
    true,
  );
  push(
    "ipv4Address",
    "netChange.note.ipv4Address",
    before.method === "static" && !isNew
      ? address4(before)
      : liveAddress(live, 4),
    after.method === "static"
      ? address4(after)
      : after.method === "dhcp"
        ? BY_ROUTER
        : NONE,
    true,
  );
  push(
    "ipv4Gateway",
    "netChange.note.ipv4Gateway",
    before.method === "static" && !isNew
      ? text(before.gateway)
      : text(live?.gateway ?? ""),
    after.method === "static"
      ? text(after.gateway)
      : after.method === "dhcp"
        ? BY_ROUTER
        : NONE,
    true,
  );
  const how6Now = isNew
    ? key("interfaces.how.notSetUp")
    : key(howWord6(before.method6));
  push(
    "ipv6How",
    "netChange.note.ipv6How",
    how6Now,
    key(howWord6(after.method6)),
    true,
  );
  push(
    "ipv6Address",
    "netChange.note.ipv6Address",
    before.method6 === "static" && !isNew
      ? address6(before)
      : liveAddress(live, 6),
    after.method6 === "static"
      ? address6(after)
      : after.method6 === "manual"
        ? NONE
        : BY_ROUTER,
    true,
  );
  push(
    "ipv6Gateway",
    "netChange.note.ipv6Gateway",
    before.method6 === "static" && !isNew
      ? text(before.gateway6)
      : text(live?.gateway6 ?? ""),
    after.method6 === "static"
      ? text(after.gateway6)
      : after.method6 === "manual"
        ? NONE
        : BY_ROUTER,
    true,
  );

  // What else changes.
  push(
    "dnsServers",
    "netChange.note.dnsServers",
    list(splitList(before.dnsnameservers)),
    list(splitList(after.dnsnameservers)),
  );
  push(
    "search",
    "netChange.note.search",
    list(splitList(before.dnssearch)),
    list(splitList(after.dnssearch)),
  );
  push("mtu", "netChange.note.mtu", mtuValue(before.mtu), mtuValue(after.mtu));
  push("wol", "ifaceForm.row.wol", onOff(before.wol), onOff(after.wol));
  if (takesMac(kind)) {
    const mac0 = (before.altmacaddress ?? "").trim().toLowerCase();
    const mac1 = (after.altmacaddress ?? "").trim().toLowerCase();
    push(
      "altmacaddress",
      "ifaceForm.row.mac",
      mac0 === "" ? key("ifaceForm.row.macOwn") : text(mac0),
      mac1 === "" ? key("ifaceForm.row.macOwn") : text(mac1),
    );
  }
  push(
    "routemetric",
    "ifaceForm.metric4",
    text(String(before.routemetric)),
    text(String(after.routemetric)),
  );
  push(
    "routemetric6",
    "ifaceForm.metric6",
    text(String(before.routemetric6)),
    text(String(after.routemetric6)),
  );
  push("comment", "ifaceForm.note", text(before.comment), text(after.comment));

  switch (kind) {
    case "wifi":
      push(
        "wpassid",
        "wifi.name",
        text(before.wpassid),
        text(after.wpassid ?? ""),
      );
      push(
        "keymanagement",
        "wifi.security",
        key(before.keymanagement === "sae" ? "wifi.wpa3" : "wifi.wpa2"),
        key(after.keymanagement === "sae" ? "wifi.wpa3" : "wifi.wpa2"),
      );
      push(
        "band",
        "wifi.frequency.label",
        bandValue(before.band),
        bandValue(after.band ?? "auto"),
      );
      push(
        "hidden",
        "wifi.hiddenRow",
        onOff(before.hidden),
        onOff(after.hidden ?? false),
      );
      // Never the password: whether it is the same is not known to this page (6.2).
      rows.push({
        id: "wpapsk",
        label: "wifi.password",
        now: isNew ? NONE : key("wifi.passwordSet"),
        after: key("wifi.typedAgain"),
        changed: true,
      });
      break;
    case "bond":
      push(
        "slaves",
        "bond.ports",
        list(before.slaves),
        list(after.slaves ?? []),
      );
      push(
        "bondmode",
        "bond.mode.label",
        isNew ? NONE : bondModeValue(before.bondmode),
        bondModeValue(after.bondmode ?? BOND_MODES.backup),
      );
      push(
        "bondprimary",
        "bond.primary",
        text(before.bondprimary),
        text(after.bondprimary ?? ""),
      );
      break;
    case "bridge":
      push(
        "slaves",
        "bridge.members",
        list(before.slaves),
        list(after.slaves ?? []),
      );
      break;
    case "vlan":
      if (isNew) {
        push(
          "vlanrawdevice",
          "vlan.runsOn",
          NONE,
          text(after.vlanrawdevice ?? ""),
        );
        push("vlanid", "vlan.id", NONE, text(String(after.vlanid ?? "")));
      }
      break;
    case "ethernet":
      break;
  }
  return rows;
}
