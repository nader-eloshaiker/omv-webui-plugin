// SPDX-License-Identifier: GPL-3.0-or-later
// The change flow's model (phase 5 network design 1.4 to 1.7, D11): the pre-flight, the typed
// confirmation, the modules a change applies, the reconnect watch after applying (what it expects,
// how long it waits, what each answer means), and the remembered settings behind "Put back how it
// was" with when that is unavailable. Pure: the session store that holds a flow in memory is
// networkSession.ts; the reads, writes and the task are the page's. Nothing here holds a password.
import type {
  FirewallRule,
  GeneralSettings,
  IfaceSettings,
  IfaceType,
  KeyManagement,
  SetWirelessIfaceRequest,
  WifiBand,
} from "./dto.ts";
import {
  sameRules,
  setRulesRequest,
  type RulesWrite,
} from "./firewallModel.ts";
import {
  commaList,
  deleteRequest,
  restoreAsNew,
  restoreChanged,
  sameSettings,
  storedFor,
  type StoredRequest,
} from "./ifaceModel.ts";
import type { Impact } from "./impact.ts";
import { sameAddress, type Family } from "./ip.ts";

/** What a flow changes: `netChange.title`'s {{object}}. */
export type FlowObject =
  | { kind: "iface"; devicename: string; type: IfaceType }
  /** `netChange.object.name` */
  | { kind: "name" }
  /** `netChange.object.firewall` */
  | { kind: "firewall"; family: Family };

/** A key per object, for "an action on the same object is already running" (0.8's last row). */
export const objectKey = (object: FlowObject): string =>
  object.kind === "iface"
    ? `iface:${object.devicename}`
    : object.kind === "firewall"
      ? `firewall:${String(object.family)}`
      : "name";

// ---- Which modules a change applies (0.7) -----------------------------------------------------------

export type ChangeAction =
  "name" | "ifaceNew" | "ifaceChanged" | "ifaceRemoved" | "firewall" | "proxy";

/** The modules each action marks pending, which the flow applies with Config.applyChangesBg (1.4 step 3). */
export const MODULES_FOR = {
  name: ["systemd-networkd", "hosts", "hostname", "avahi", "postfix", "samba"],
  ifaceNew: ["systemd-networkd", "hosts", "avahi", "halt", "issue", "collectd"],
  ifaceChanged: ["systemd-networkd", "hosts", "avahi", "halt", "issue"],
  ifaceRemoved: [
    "systemd-networkd",
    "hosts",
    "avahi",
    "halt",
    "issue",
    "collectd",
    "task",
  ],
  firewall: ["iptables"],
  proxy: ["apt", "profile"],
} as const satisfies Record<ChangeAction, readonly string[]>;

/** 10.4: after an Undo that brings a removed interface back, the queued jobs and the network are applied at once. */
export const UNDO_REMOVAL_APPLY = {
  modules: ["task", "systemd-networkd"],
  force: true,
} as const;

// ---- Step 1, the pre-flight (R1) --------------------------------------------------------------------

export type Preflight =
  | { ok: true }
  /** `netChange.preflight` with {{modules}}, "Apply them now" and "Undo them". */
  | { ok: false; code: "netChange.preflight"; modules: readonly string[] };

/** The flow continues only when nothing is pending, so the change is applied and undone on its own. */
export const preflight = (pending: readonly string[]): Preflight =>
  pending.length === 0
    ? { ok: true }
    : { ok: false, code: "netChange.preflight", modules: [...pending] };

// ---- Step 2, the typed confirmation (1.4 item 6, P6) ------------------------------------------------

export type Confirmation =
  /** "Type the new address to confirm it: {{value}}": the new fixed address this page will use. */
  | { code: "netChange.typeAddress"; value: string }
  /** "Type the new name to confirm it: {{value}}": the new name this page uses. */
  | { code: "netChange.typeName"; value: string }
  /** "Type the interface's name to confirm: {{value}}". */
  | { code: "netChange.typeIface"; value: string }
  /** "Type firewall to confirm". */
  | { code: "netChange.typeFirewall"; value: "firewall" };

/**
 * What the reader types (P6). `newHostname` is the name typed on the name page. A new bond or bridge
 * has no name before OMV gives it one, so its first member's name is typed instead.
 */
export function confirmationFor(
  object: FlowObject,
  impact: Impact,
  options: { newHostname?: string; members?: readonly string[] } = {},
): Confirmation {
  for (const finding of impact.findings) {
    if (
      finding.class === "moves" &&
      finding.effect === "netChange.effect.newAddress"
    ) {
      return { code: "netChange.typeAddress", value: finding.new };
    }
  }
  if (object.kind === "name") {
    const named = impact.findings.find((f) => f.class === "moves");
    return {
      code: "netChange.typeName",
      value: (
        options.newHostname ?? (named?.class === "moves" ? named.new : "")
      )
        .trim()
        .toLowerCase(),
    };
  }
  if (object.kind === "firewall") {
    return { code: "netChange.typeFirewall", value: "firewall" };
  }
  const value =
    object.devicename !== ""
      ? object.devicename
      : (options.members?.[0] ?? object.type);
  return { code: "netChange.typeIface", value };
}

/**
 * Whether the typed text matches: an address as the same address (its shortest form or not), a name
 * without regard to case (it is saved in lower case), an interface's name exactly, "firewall" in any
 * case. Surrounding spaces are not part of it.
 */
export function confirmationMatches(
  confirmation: Confirmation,
  typed: string,
): boolean {
  const text = typed.trim();
  switch (confirmation.code) {
    case "netChange.typeAddress":
      return sameAddress(text, confirmation.value);
    case "netChange.typeName":
      return (
        text.toLowerCase() === confirmation.value.toLowerCase() && text !== ""
      );
    case "netChange.typeIface":
      return text === confirmation.value;
    case "netChange.typeFirewall":
      return text.toLowerCase() === "firewall";
  }
}

// ---- Step 3, the run (1.4) --------------------------------------------------------------------------

export type RunStep = "save" | "apply" | "reach";
export type StepStatus = "waiting" | "running" | "done" | "failed";

export type RunFailure =
  /** `netChange.changedSince`: the read again differs from what the summary showed. Nothing is pending. */
  | { step: "save"; code: "netChange.changedSince" }
  /** The server's message; "Try again"; nothing is pending from this flow. */
  | { step: "save"; code: "server" }
  /** The R7 plan: "Try applying again" first; "Undo this change" then R7's forced apply. */
  | { step: "apply"; code: "applyFailed" };

export interface RunState {
  steps: Readonly<Record<RunStep, StepStatus>>;
  failure: RunFailure | null;
}

export const RUN_START: RunState = {
  steps: { save: "running", apply: "waiting", reach: "waiting" },
  failure: null,
};

export type RunEvent =
  | { kind: "saved" }
  | { kind: "changedSince" }
  | { kind: "saveFailed" }
  | { kind: "applied" }
  | { kind: "applyFailed" }
  | { kind: "reached" }
  /** "Try again" after a failed save, or "Try applying again". */
  | { kind: "retry" };

/** The run's steps, one at a time; a failed step waits for the reader (nothing retries by itself, UI-14). */
export function runStep(state: RunState, event: RunEvent): RunState {
  const s = state.steps;
  switch (event.kind) {
    case "saved":
      return s.save === "running"
        ? { steps: { ...s, save: "done", apply: "running" }, failure: null }
        : state;
    case "changedSince":
      return s.save === "running"
        ? {
            steps: { ...s, save: "failed" },
            failure: { step: "save", code: "netChange.changedSince" },
          }
        : state;
    case "saveFailed":
      return s.save === "running"
        ? {
            steps: { ...s, save: "failed" },
            failure: { step: "save", code: "server" },
          }
        : state;
    case "applied":
      return s.apply === "running"
        ? { steps: { ...s, apply: "done", reach: "running" }, failure: null }
        : state;
    case "applyFailed":
      return s.apply === "running"
        ? {
            steps: { ...s, apply: "failed" },
            failure: { step: "apply", code: "applyFailed" },
          }
        : state;
    case "reached":
      return s.reach === "running"
        ? { steps: { ...s, reach: "done" }, failure: null }
        : state;
    case "retry":
      if (state.failure === null) {
        return state;
      }
      return state.failure.step === "save"
        ? { steps: { ...s, save: "running" }, failure: null }
        : { steps: { ...s, apply: "running" }, failure: null };
  }
}

// ---- The reconnect watch (1.5, D11) -----------------------------------------------------------------

/** The watch sends one small background read every 2 seconds while waiting (D11). */
export const POLL_SECONDS = 2;
/** The wait is announced when it starts, every 15 seconds, and at its end (19.2). */
export const ANNOUNCE_SECONDS = 15;

export type Expectation =
  /**
   * Brief interruption (band, 1.8), and May cut with the same address: up to 60 seconds. Blinking
   * this page's port waits the same way for the time chosen plus 10 seconds (blinkWaitSeconds, 4.4).
   */
  | { kind: "same"; timeout: number }
  /** May cut with a new automatic address (fixed to automatic, a new hardware address, Wi-Fi): 120 seconds. */
  | { kind: "automatic"; timeout: 120 }
  /** Moves to a new address: 30 seconds at the old address, to catch a change that did not take effect. */
  | { kind: "moved"; timeout: 30; old: string; new: string }
  /** Moves to a new name: up to 60 seconds by the old name. */
  | { kind: "movedName"; timeout: 60; old: string; new: string };

/** What the watch expects, from the change's class and findings (1.5's first column). */
export function expectationFor(impact: Impact): Expectation {
  for (const f of impact.findings) {
    if (f.class === "moves") {
      return f.effect === "netChange.effect.newAddress"
        ? { kind: "moved", timeout: 30, old: f.old, new: f.new }
        : { kind: "movedName", timeout: 60, old: f.old, new: f.new };
    }
  }
  const automatic = impact.findings.some(
    (f) =>
      f.class === "mayCut" &&
      (f.effect === "netChange.effect.automatic" ||
        f.effect === "netChange.effect.wifi"),
  );
  return automatic
    ? { kind: "automatic", timeout: 120 }
    : { kind: "same", timeout: 60 };
}

/** Blinking this page's port waits as Brief interruption does, for the time chosen plus 10 seconds (4.4). */
export const blinkWaitSeconds = (seconds: number): number => seconds + 10;

export type WatchOutcome =
  /** "Connected again. This page reaches the NAS at {{address}} through {{iface}}." (after reading the interfaces again) */
  | { kind: "connectedAgain" }
  /** "The NAS kept the address {{address}}." */
  | { kind: "keptAddress" }
  /** "The NAS still answers at {{old}}. The change may not have been applied." then the pending state is read. */
  | { kind: "stillOld"; old: string }
  /** The moved card (`role="status"`, not an error), for an address or a name. */
  | { kind: "moved"; new: string; by: "address" | "name" }
  /** "The NAS answers, but this page needs you to sign in again." */
  | { kind: "signInAgain" }
  /** The recovery card (1.6). */
  | { kind: "recovery"; variant: "lost" | "unknownAddress" }
  /** The apply's own failure (R6, R7). */
  | { kind: "applyFailed" };

export type WatchState =
  /** The task helper follows the apply's output. */
  | { phase: "applying"; expectation: Expectation; reconnected: boolean }
  /** "Waiting for the NAS to answer… {{elapsed}}" since `since` (ms). */
  | { phase: "waiting"; expectation: Expectation; since: number }
  | { phase: "done"; expectation: Expectation; outcome: WatchOutcome };

export type WatchEvent =
  /** A read failed with no reply (the transport's `network` kind): not a failure, the wait starts. */
  | { kind: "lost"; at: number }
  /** A background read answered at this page's address. */
  | { kind: "answered"; at: number }
  /** A 401 after the NAS answers (N9). */
  | { kind: "unauthorized"; at: number }
  /** The task helper reached the apply's end. */
  | { kind: "applyFinished"; at: number }
  | { kind: "applyFailed"; at: number }
  /** The clock, for the timeout. */
  | { kind: "tick"; at: number }
  /** "Stop waiting": the recovery card at once. */
  | { kind: "stop"; at: number };

export const watchStart = (expectation: Expectation): WatchState => ({
  phase: "applying",
  expectation,
  reconnected: false,
});

const outcomeWhenAnswering = (e: Expectation): WatchOutcome => {
  switch (e.kind) {
    case "same":
      return { kind: "connectedAgain" };
    case "automatic":
      return { kind: "keptAddress" };
    case "moved":
      return { kind: "stillOld", old: e.old };
    case "movedName":
      return { kind: "moved", new: e.new, by: "name" };
  }
};

const outcomeWhenSilent = (e: Expectation): WatchOutcome => {
  switch (e.kind) {
    case "same":
      return { kind: "recovery", variant: "lost" };
    case "automatic":
      return { kind: "recovery", variant: "unknownAddress" };
    case "moved":
      return { kind: "moved", new: e.new, by: "address" };
    case "movedName":
      return { kind: "moved", new: e.new, by: "name" };
  }
};

/** 1.5's table as a state machine. No write is ever retried (UI-14); this only says what was seen. */
export function watchStep(state: WatchState, event: WatchEvent): WatchState {
  if (state.phase === "done") {
    return state;
  }
  const { expectation } = state;
  const done = (outcome: WatchOutcome): WatchState => ({
    phase: "done",
    expectation,
    outcome,
  });
  switch (event.kind) {
    case "applyFailed":
      return done({ kind: "applyFailed" });
    case "unauthorized":
      return done({ kind: "signInAgain" });
    case "stop":
      return done(outcomeWhenSilent(expectation));
    case "lost":
      return state.phase === "applying"
        ? { phase: "waiting", expectation, since: event.at }
        : state;
    case "answered":
      if (state.phase === "waiting") {
        // A move answering at the old address is caught at once; otherwise the task is followed to its end.
        return expectation.kind === "moved"
          ? done(outcomeWhenAnswering(expectation))
          : { phase: "applying", expectation, reconnected: true };
      }
      return state;
    case "applyFinished":
      // Reaching the end through the old address: the NAS answered there.
      return done(outcomeWhenAnswering(expectation));
    case "tick":
      return state.phase === "waiting" &&
        event.at - state.since >= expectation.timeout * 1000
        ? done(outcomeWhenSilent(expectation))
        : state;
  }
}

/** Seconds waited so far, for "Waiting for the NAS to answer… {{elapsed}}" (elapsed time, never a countdown). */
export const elapsedSeconds = (state: WatchState, now: number): number =>
  state.phase === "waiting"
    ? Math.max(0, Math.floor((now - state.since) / 1000))
    : 0;

/** Whether the elapsed time is announced at this second: at the start and every 15 seconds (19.2). */
export const announces = (elapsed: number): boolean =>
  elapsed % ANNOUNCE_SECONDS === 0;

// ---- Keep the new settings, or put back how it was (1.7) ---------------------------------------------

/** What the flow remembers for Put back, in memory only (UI-13), never with a password. */
export type Remembered =
  | { kind: "name"; before: GeneralSettings; after: GeneralSettings }
  | { kind: "ifaceChanged"; before: IfaceSettings; after: IfaceSettings }
  | { kind: "ifaceAdded"; after: IfaceSettings }
  | { kind: "ifaceRemoved"; before: IfaceSettings }
  | {
      kind: "firewall";
      family: Family;
      before: readonly FirewallRule[];
      after: readonly FirewallRule[];
    };

/** A stored interface as the flow may keep it: whether a Wi-Fi password is set is not kept either. */
export function withoutSecrets(settings: IfaceSettings): IfaceSettings {
  const { wpapsk: _presence, ...rest } = settings;
  return rest;
}

/**
 * What the flow remembers once its save is read back: `before` as read before the change, `after`
 * as read again after the save (OMV rewrites some fields, such as the lists' separators).
 */
export function remember(
  change:
    | { kind: "name"; before: GeneralSettings; after: GeneralSettings }
    | { kind: "ifaceChanged"; before: IfaceSettings; after: IfaceSettings }
    | { kind: "ifaceAdded"; after: IfaceSettings }
    | { kind: "ifaceRemoved"; before: IfaceSettings }
    | {
        kind: "firewall";
        family: Family;
        before: readonly FirewallRule[];
        after: readonly FirewallRule[];
      },
): Remembered {
  switch (change.kind) {
    case "name":
      return {
        kind: "name",
        before: { ...change.before },
        after: { ...change.after },
      };
    case "ifaceChanged":
      return {
        kind: "ifaceChanged",
        before: withoutSecrets(change.before),
        after: withoutSecrets(change.after),
      };
    case "ifaceAdded":
      return { kind: "ifaceAdded", after: withoutSecrets(change.after) };
    case "ifaceRemoved":
      return { kind: "ifaceRemoved", before: withoutSecrets(change.before) };
    case "firewall":
      return {
        kind: "firewall",
        family: change.family,
        before: [...change.before],
        after: [...change.after],
      };
  }
}

/** The state Put back is checked against, read just before it is offered. */
export type CurrentState =
  | { kind: "name"; general: GeneralSettings }
  | { kind: "ifaces"; stored: readonly IfaceSettings[] }
  | { kind: "firewall"; rules: readonly FirewallRule[] };

export type PutBack =
  | { available: true }
  | {
      available: false;
      /** `netChange.putBackGone`, `putBackChanged`, `putBackMoved`; `netChange.preflight` with the pending modules. */
      code:
        | "netChange.putBackGone"
        | "netChange.putBackChanged"
        | "netChange.putBackMoved"
        | "netChange.preflight";
      modules?: readonly string[];
    };

/** Whether the object is as this page wrote it. */
function unchangedSince(
  remembered: Remembered,
  current: CurrentState,
): boolean {
  switch (remembered.kind) {
    case "name":
      return (
        current.kind === "name" &&
        current.general.hostname === remembered.after.hostname &&
        current.general.domainname === remembered.after.domainname
      );
    case "ifaceChanged":
    case "ifaceAdded": {
      if (current.kind !== "ifaces") {
        return false;
      }
      const now = current.stored.find((s) => s.uuid === remembered.after.uuid);
      return (
        now !== undefined && sameSettings(withoutSecrets(now), remembered.after)
      );
    }
    case "ifaceRemoved":
      return (
        current.kind === "ifaces" &&
        storedFor(current.stored, remembered.before.devicename) === null
      );
    case "firewall":
      return (
        current.kind === "firewall" &&
        sameRules(current.rules, remembered.after)
      );
  }
}

/**
 * 1.7: Put back is unavailable, with the reason, when the memory is gone (a reload, a sign-out), the
 * change moved the page to a new address or name, other changes are pending (R1), or the object
 * changed since this page wrote it.
 */
export function putBackAvailability(input: {
  remembered: Remembered | null;
  outcome: WatchOutcome | null;
  pending: readonly string[];
  current: CurrentState | null;
}): PutBack {
  const { remembered, outcome, pending, current } = input;
  if (remembered === null) {
    return { available: false, code: "netChange.putBackGone" };
  }
  if (outcome?.kind === "moved") {
    return { available: false, code: "netChange.putBackMoved" };
  }
  if (pending.length > 0) {
    return {
      available: false,
      code: "netChange.preflight",
      modules: [...pending],
    };
  }
  if (current === null || !unchangedSince(remembered, current)) {
    return { available: false, code: "netChange.putBackChanged" };
  }
  return { available: true };
}

/** The write that puts the remembered settings back (1.7's table), and the modules it applies. */
export type PutBackWrite =
  | {
      method: "setGeneralSettings";
      request: GeneralSettings;
      modules: readonly string[];
    }
  | { method: "setIface"; stored: StoredRequest; modules: readonly string[] }
  | {
      method: "deleteInterface";
      request: { uuid: string };
      modules: readonly string[];
    }
  /** setRules or setRules6 by the write's family; unavailable when a remembered rule cannot be sent back. */
  | { method: "setRules"; write: RulesWrite; modules: readonly string[] };

export function putBackWrite(remembered: Remembered): PutBackWrite {
  switch (remembered.kind) {
    case "name":
      return {
        method: "setGeneralSettings",
        request: { ...remembered.before },
        modules: MODULES_FOR.name,
      };
    case "ifaceChanged":
      return {
        method: "setIface",
        stored: restoreChanged(remembered.before),
        modules: MODULES_FOR.ifaceChanged,
      };
    case "ifaceAdded":
      return {
        method: "deleteInterface",
        request: deleteRequest(remembered.after),
        modules: MODULES_FOR.ifaceRemoved,
      };
    case "ifaceRemoved":
      return {
        method: "setIface",
        stored: restoreAsNew(remembered.before),
        modules: MODULES_FOR.ifaceNew,
      };
    case "firewall":
      return {
        method: "setRules",
        write: setRulesRequest(remembered.before, remembered.family),
        modules: MODULES_FOR.firewall,
      };
  }
}

const WIFI_BANDS: readonly WifiBand[] = ["auto", "2.4GHz", "5GHz"];
const KEY_MANAGEMENTS: readonly KeyManagement[] = ["psk", "sae"];

/**
 * Put back a Wi-Fi interface (1.7, 0.6): its remembered settings with the password typed again in
 * Put back's dialog, never one held. `uuid` is its own for a change, NEW_OBJECT_UUID for a removal.
 * Null when a stored value is one OMV does not write (the reader puts it back by hand).
 */
export function wifiPutBackRequest(
  before: IfaceSettings,
  uuid: string,
  wpapsk: string,
): SetWirelessIfaceRequest | null {
  const band = WIFI_BANDS.find((b) => b === before.band);
  const keymanagement = KEY_MANAGEMENTS.find((k) => k === before.keymanagement);
  if (band === undefined || keymanagement === undefined) {
    return null;
  }
  return {
    uuid,
    devicename: before.devicename,
    method: before.method,
    address: before.address,
    netmask: before.netmask,
    gateway: before.gateway,
    routemetric: before.routemetric,
    method6: before.method6,
    address6: before.address6,
    netmask6: before.netmask6,
    gateway6: before.gateway6,
    routemetric6: before.routemetric6,
    dnsnameservers: commaList(before.dnsnameservers),
    dnssearch: commaList(before.dnssearch),
    mtu: before.mtu,
    wol: before.wol,
    comment: before.comment,
    altmacaddress: before.altmacaddress,
    wpassid: before.wpassid,
    wpapsk,
    keymanagement,
    band,
    hidden: before.hidden,
  };
}
