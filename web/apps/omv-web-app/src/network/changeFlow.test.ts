// SPDX-License-Identifier: GPL-3.0-or-later
// network/changeFlow.ts: the pre-flight (1.4 step 1), the typed confirmation (P6), the run's steps
// (1.4 step 3), the watch's expectations, timeouts and outcomes (1.5, D11), and Put back (1.7).
import { describe, expect, it } from "vitest";
import {
  announces,
  blinkWaitSeconds,
  confirmationFor,
  confirmationMatches,
  elapsedSeconds,
  expectationFor,
  MODULES_FOR,
  objectKey,
  preflight,
  putBackAvailability,
  putBackWrite,
  remember,
  RUN_START,
  runStep,
  watchStart,
  watchStep,
  wifiPutBackRequest,
  withoutSecrets,
  type Expectation,
  type RunEvent,
  type WatchEvent,
  type WatchState,
} from "./changeFlow.ts";
import { rules, settings } from "./fixtures.testing.ts";
import type { Impact } from "./impact.ts";

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
const WIFI: Impact = {
  class: "mayCut",
  findings: [{ class: "mayCut", effect: "netChange.effect.wifi" }],
};
const MTU: Impact = {
  class: "mayCut",
  findings: [{ class: "mayCut", effect: "netChange.effect.mtu", size: 9000 }],
};
const BRIEF: Impact = { class: "brief", findings: [{ class: "brief" }] };

describe("step 1, the pre-flight (R1)", () => {
  it("continues when nothing is pending", () => {
    expect(preflight([])).toEqual({ ok: true });
  });

  it("refuses to start while other changes are pending, naming them", () => {
    expect(preflight(["samba", "nfs"])).toEqual({
      ok: false,
      code: "netChange.preflight",
      modules: ["samba", "nfs"],
    });
  });
});

describe("step 2, the typed confirmation (P6)", () => {
  const port = {
    kind: "iface",
    devicename: "enp2s0",
    type: "ethernet",
  } as const;

  it.each([
    [
      "a new fixed address this page will use",
      port,
      MOVES,
      {},
      { code: "netChange.typeAddress", value: "192.0.2.20" },
    ],
    [
      "a new name this page uses",
      { kind: "name" } as const,
      RENAMED,
      { newHostname: "New-NAS" },
      { code: "netChange.typeName", value: "new-nas" },
    ],
    [
      "otherwise the interface's name",
      port,
      MTU,
      {},
      { code: "netChange.typeIface", value: "enp2s0" },
    ],
    [
      "the firewall",
      { kind: "firewall", family: 4 } as const,
      { class: "mayCut", findings: [] } as Impact,
      {},
      { code: "netChange.typeFirewall", value: "firewall" },
    ],
    [
      "a new bond: its first port",
      { kind: "iface", devicename: "", type: "bond" } as const,
      AUTOMATIC,
      { members: ["enp3s0", "enp4s0"] },
      { code: "netChange.typeIface", value: "enp3s0" },
    ],
  ])("%s", (_what, object, impact, options, expected) => {
    expect(confirmationFor(object, impact, options)).toEqual(expected);
  });

  it.each([
    [
      { code: "netChange.typeAddress", value: "192.0.2.20" },
      "192.0.2.20",
      true,
    ],
    [
      { code: "netChange.typeAddress", value: "192.0.2.20" },
      " 192.0.2.20 ",
      true,
    ],
    [
      { code: "netChange.typeAddress", value: "192.0.2.20" },
      "192.0.2.200",
      false,
    ],
    [
      { code: "netChange.typeAddress", value: "2001:db8::20" },
      "2001:DB8:0:0:0:0:0:20",
      true,
    ],
    [{ code: "netChange.typeName", value: "new-nas" }, "NEW-NAS", true],
    [{ code: "netChange.typeName", value: "new-nas" }, "new-na", false],
    [{ code: "netChange.typeIface", value: "enp2s0" }, "enp2s0", true],
    [{ code: "netChange.typeIface", value: "enp2s0" }, "ENP2S0", false],
    [{ code: "netChange.typeFirewall", value: "firewall" }, "Firewall", true],
    [{ code: "netChange.typeFirewall", value: "firewall" }, "", false],
  ] as const)("%o typed as %j: %s", (confirmation, typed, expected) => {
    expect(confirmationMatches(confirmation, typed)).toBe(expected);
  });
});

describe("step 3, the run", () => {
  const run = (...events: RunEvent[]) => events.reduce(runStep, RUN_START);

  it.each<[string, RunEvent[], object]>([
    [
      "saves first",
      [],
      {
        steps: { save: "running", apply: "waiting", reach: "waiting" },
        failure: null,
      },
    ],
    [
      "then applies",
      [{ kind: "saved" }],
      { steps: { save: "done", apply: "running", reach: "waiting" } },
    ],
    [
      "then reaches the NAS",
      [{ kind: "saved" }, { kind: "applied" }],
      { steps: { save: "done", apply: "done", reach: "running" } },
    ],
    [
      "and ends",
      [{ kind: "saved" }, { kind: "applied" }, { kind: "reached" }],
      { steps: { save: "done", apply: "done", reach: "done" } },
    ],
    [
      "changed since: refused, nothing pending",
      [{ kind: "changedSince" }],
      {
        steps: { save: "failed" },
        failure: { step: "save", code: "netChange.changedSince" },
      },
    ],
    [
      "the save refused by the server",
      [{ kind: "saveFailed" }],
      { failure: { step: "save", code: "server" } },
    ],
    [
      "the apply failed",
      [{ kind: "saved" }, { kind: "applyFailed" }],
      {
        steps: { apply: "failed" },
        failure: { step: "apply", code: "applyFailed" },
      },
    ],
    [
      "Try applying again",
      [{ kind: "saved" }, { kind: "applyFailed" }, { kind: "retry" }],
      { steps: { save: "done", apply: "running" }, failure: null },
    ],
    [
      "Try again after a failed save",
      [{ kind: "saveFailed" }, { kind: "retry" }],
      { steps: { save: "running" }, failure: null },
    ],
    [
      "an event out of turn changes nothing",
      [{ kind: "applied" }],
      { steps: { save: "running", apply: "waiting" } },
    ],
  ])("%s", (_what, events, expected) => {
    expect(run(...events)).toMatchObject(expected);
  });
});

describe("1.5, the watch (D11)", () => {
  it.each<[string, Impact, Expectation["kind"], number]>([
    ["Brief interruption", BRIEF, "same", 60],
    ["May cut with the same address", MTU, "same", 60],
    ["May cut with a new automatic address", AUTOMATIC, "automatic", 120],
    ["May cut on Wi-Fi", WIFI, "automatic", 120],
    ["Moves to a new address", MOVES, "moved", 30],
    ["Moves to a new name", RENAMED, "movedName", 60],
  ])("%s waits for %s, %i seconds", (_what, impact, kind, timeout) => {
    expect(expectationFor(impact)).toMatchObject({ kind, timeout });
  });

  const walk = (impact: Impact, ...events: WatchEvent[]): WatchState =>
    events.reduce(watchStep, watchStart(expectationFor(impact)));
  const outcome = (impact: Impact, ...events: WatchEvent[]) => {
    const state = walk(impact, ...events);
    return state.phase === "done" ? state.outcome : null;
  };
  const lost = { kind: "lost", at: 0 } as const;
  const at = (seconds: number) =>
    ({ kind: "tick", at: seconds * 1000 }) as const;

  it.each<[string, Impact, WatchEvent[], object | null]>([
    [
      "the network restarting is not a failure: the wait starts",
      BRIEF,
      [lost],
      null,
    ],
    [
      "answers again, followed to the end: connected again",
      BRIEF,
      [
        lost,
        { kind: "answered", at: 8000 },
        { kind: "applyFinished", at: 9000 },
      ],
      { kind: "connectedAgain" },
    ],
    [
      "finished without losing the NAS",
      BRIEF,
      [{ kind: "applyFinished", at: 1000 }],
      { kind: "connectedAgain" },
    ],
    ["not within 60 seconds: lost", BRIEF, [lost, at(59)], null],
    [
      "after 60 seconds: lost",
      BRIEF,
      [lost, at(60)],
      { kind: "recovery", variant: "lost" },
    ],
    [
      "automatic, answering again: kept the address",
      AUTOMATIC,
      [
        lost,
        { kind: "answered", at: 30000 },
        { kind: "applyFinished", at: 31000 },
      ],
      { kind: "keptAddress" },
    ],
    [
      "automatic, after 60 seconds: still waiting",
      AUTOMATIC,
      [lost, at(60)],
      null,
    ],
    [
      "automatic, after 120 seconds: an unknown address",
      AUTOMATIC,
      [lost, at(120)],
      { kind: "recovery", variant: "unknownAddress" },
    ],
    [
      "moved, answering at the old address: still old",
      MOVES,
      [lost, { kind: "answered", at: 5000 }],
      { kind: "stillOld", old: "192.0.2.10" },
    ],
    [
      "moved, the apply finished at the old address: still old",
      MOVES,
      [{ kind: "applyFinished", at: 5000 }],
      { kind: "stillOld", old: "192.0.2.10" },
    ],
    [
      "moved, silent for 30 seconds: the moved card, not a failure",
      MOVES,
      [lost, at(30)],
      { kind: "moved", new: "192.0.2.20", by: "address" },
    ],
    [
      "a new name, still answering by the old one: the moved card for the name",
      RENAMED,
      [
        lost,
        { kind: "answered", at: 4000 },
        { kind: "applyFinished", at: 5000 },
      ],
      { kind: "moved", new: "new-nas", by: "name" },
    ],
    [
      "a new name, silent for 60 seconds",
      RENAMED,
      [lost, at(60)],
      { kind: "moved", by: "name" },
    ],
    [
      "a 401 after the NAS answers: sign in again",
      BRIEF,
      [lost, { kind: "unauthorized", at: 9000 }],
      { kind: "signInAgain" },
    ],
    [
      "Stop waiting: the recovery card at once",
      BRIEF,
      [lost, { kind: "stop", at: 3000 }],
      { kind: "recovery", variant: "lost" },
    ],
    [
      "Stop waiting on a move: the moved card",
      MOVES,
      [lost, { kind: "stop", at: 3000 }],
      { kind: "moved" },
    ],
    [
      "the apply's own failure",
      BRIEF,
      [{ kind: "applyFailed", at: 1000 }],
      { kind: "applyFailed" },
    ],
    [
      "nothing changes once done",
      BRIEF,
      [{ kind: "applyFailed", at: 1000 }, lost, at(100)],
      { kind: "applyFailed" },
    ],
  ])("%s", (_what, impact, events, expected) => {
    expect(outcome(impact, ...events)).toEqual(
      expected === null ? null : expect.objectContaining(expected),
    );
  });

  it("counts elapsed time, never down", () => {
    const waiting = walk(BRIEF, { kind: "lost", at: 10_000 });
    expect(elapsedSeconds(waiting, 28_400)).toBe(18);
    expect(elapsedSeconds(watchStart(expectationFor(BRIEF)), 99_000)).toBe(0);
  });

  it.each([
    [0, true],
    [2, false],
    [15, true],
    [30, true],
    [44, false],
  ])("announces at %i seconds: %s", (elapsed, expected) => {
    expect(announces(elapsed)).toBe(expected);
  });

  it("blinking this page's port waits the time chosen plus 10 seconds (4.4)", () => {
    expect(blinkWaitSeconds(30)).toBe(40);
  });
});

describe("1.7, Put back how it was", () => {
  const before = settings("enp2s0", {
    method: "static",
    address: "192.0.2.10",
    netmask: "255.255.255.0",
  });
  const after = { ...before, address: "192.0.2.20" };
  const changed = remember({ kind: "ifaceChanged", before, after });

  it("remembers no password, not even whether one is set", () => {
    const wifi = settings("wlan0", { type: "wifi", wpapsk: true });
    expect("wpapsk" in withoutSecrets(wifi)).toBe(false);
    const r = remember({ kind: "ifaceChanged", before: wifi, after: wifi });
    expect(JSON.stringify(r)).not.toContain("wpapsk");
  });

  it.each<[string, Parameters<typeof putBackAvailability>[0], object]>([
    [
      "available while nothing changed and nothing is pending",
      {
        remembered: changed,
        outcome: { kind: "connectedAgain" },
        pending: [],
        current: { kind: "ifaces", stored: [after] },
      },
      { available: true },
    ],
    [
      "the memory is gone (a reload, a sign-out)",
      { remembered: null, outcome: null, pending: [], current: null },
      { available: false, code: "netChange.putBackGone" },
    ],
    [
      "the change moved the page",
      {
        remembered: changed,
        outcome: { kind: "moved", new: "192.0.2.20", by: "address" },
        pending: [],
        current: { kind: "ifaces", stored: [after] },
      },
      { available: false, code: "netChange.putBackMoved" },
    ],
    [
      "other changes are pending",
      {
        remembered: changed,
        outcome: { kind: "connectedAgain" },
        pending: ["samba"],
        current: { kind: "ifaces", stored: [after] },
      },
      { available: false, code: "netChange.preflight", modules: ["samba"] },
    ],
    [
      "the object changed since this page wrote it",
      {
        remembered: changed,
        outcome: { kind: "connectedAgain" },
        pending: [],
        current: { kind: "ifaces", stored: [{ ...after, comment: "changed" }] },
      },
      { available: false, code: "netChange.putBackChanged" },
    ],
    [
      "the object is gone",
      {
        remembered: changed,
        outcome: { kind: "connectedAgain" },
        pending: [],
        current: { kind: "ifaces", stored: [] },
      },
      { available: false, code: "netChange.putBackChanged" },
    ],
    [
      "the current state could not be read",
      {
        remembered: changed,
        outcome: { kind: "connectedAgain" },
        pending: [],
        current: null,
      },
      { available: false, code: "netChange.putBackChanged" },
    ],
  ])("%s", (_what, input, expected) => {
    expect(putBackAvailability(input)).toEqual(expected);
  });

  it("the name: unchanged since", () => {
    const r = remember({
      kind: "name",
      before: { hostname: "nas-host", domainname: "" },
      after: { hostname: "new-nas", domainname: "" },
    });
    expect(
      putBackAvailability({
        remembered: r,
        outcome: { kind: "connectedAgain" },
        pending: [],
        current: {
          kind: "name",
          general: { hostname: "new-nas", domainname: "" },
        },
      }).available,
    ).toBe(true);
    expect(
      putBackAvailability({
        remembered: r,
        outcome: { kind: "connectedAgain" },
        pending: [],
        current: {
          kind: "name",
          general: { hostname: "other", domainname: "" },
        },
      }).available,
    ).toBe(false);
  });

  it("a removal: put back only while the interface is still without settings", () => {
    const r = remember({ kind: "ifaceRemoved", before });
    expect(
      putBackAvailability({
        remembered: r,
        outcome: { kind: "connectedAgain" },
        pending: [],
        current: { kind: "ifaces", stored: [] },
      }).available,
    ).toBe(true);
    expect(
      putBackAvailability({
        remembered: r,
        outcome: { kind: "connectedAgain" },
        pending: [],
        current: { kind: "ifaces", stored: [before] },
      }).available,
    ).toBe(false);
  });

  it("the firewall: the same list as written", () => {
    const written = rules({ action: "REJECT", dport: "445" });
    const r = remember({
      kind: "firewall",
      family: 4,
      before: [],
      after: written,
    });
    expect(
      putBackAvailability({
        remembered: r,
        outcome: { kind: "connectedAgain" },
        pending: [],
        current: { kind: "firewall", rules: written },
      }).available,
    ).toBe(true);
    expect(
      putBackAvailability({
        remembered: r,
        outcome: { kind: "connectedAgain" },
        pending: [],
        current: { kind: "firewall", rules: [] },
      }).available,
    ).toBe(false);
  });

  it.each([
    [
      "the name: setGeneralSettings with the old values",
      remember({
        kind: "name",
        before: { hostname: "nas-host", domainname: "" },
        after: { hostname: "new-nas", domainname: "" },
      }),
      {
        method: "setGeneralSettings",
        request: { hostname: "nas-host", domainname: "" },
        modules: MODULES_FOR.name,
      },
    ],
    [
      "an interface changed: set…Iface with the object as read before",
      changed,
      {
        method: "setIface",
        stored: {
          type: "ethernet",
          request: { uuid: before.uuid, address: "192.0.2.10" },
        },
        modules: MODULES_FOR.ifaceChanged,
      },
    ],
    [
      "an interface set up: deleteInterface of the new one",
      remember({ kind: "ifaceAdded", after }),
      {
        method: "deleteInterface",
        request: { uuid: after.uuid },
        modules: MODULES_FOR.ifaceRemoved,
      },
    ],
    [
      "an interface removed: set…Iface with the old object as new",
      remember({ kind: "ifaceRemoved", before }),
      {
        method: "setIface",
        stored: {
          type: "ethernet",
          request: { uuid: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4" },
        },
        modules: MODULES_FOR.ifaceNew,
      },
    ],
    [
      "the firewall: setRules with the old list in its old order",
      remember({
        kind: "firewall",
        family: 4,
        before: rules({ comment: "a" }, { comment: "b" }),
        after: [],
      }),
      {
        method: "setRules",
        write: {
          ok: true,
          family: 4,
          request: [
            { comment: "a", rulenum: 0 },
            { comment: "b", rulenum: 1 },
          ],
        },
        modules: MODULES_FOR.firewall,
      },
    ],
  ])("%s", (_what, r, expected) => {
    expect(putBackWrite(r)).toMatchObject(expected);
  });
});

describe("the modules a change applies (0.7)", () => {
  it.each([
    [
      "name",
      ["systemd-networkd", "hosts", "hostname", "avahi", "postfix", "samba"],
    ],
    [
      "ifaceNew",
      ["systemd-networkd", "hosts", "avahi", "halt", "issue", "collectd"],
    ],
    ["ifaceChanged", ["systemd-networkd", "hosts", "avahi", "halt", "issue"]],
    [
      "ifaceRemoved",
      [
        "systemd-networkd",
        "hosts",
        "avahi",
        "halt",
        "issue",
        "collectd",
        "task",
      ],
    ],
    ["firewall", ["iptables"]],
    ["proxy", ["apt", "profile"]],
  ] as const)("%s", (action, modules) => {
    expect(MODULES_FOR[action]).toEqual(modules);
  });

  it("one key per object, for one action at a time", () => {
    expect(
      objectKey({ kind: "iface", devicename: "enp2s0", type: "ethernet" }),
    ).toBe("iface:enp2s0");
    expect(objectKey({ kind: "firewall", family: 6 })).toBe("firewall:6");
    expect(objectKey({ kind: "name" })).toBe("name");
  });
});

describe("Put back of a Wi-Fi interface (1.7, 0.6)", () => {
  it("writes the remembered settings with the password typed in Put back's dialog, never one held", () => {
    const before = {
      ...settings("wlp3s0", {
        type: "wifi",
        wpassid: "EXAMPLE-NETWORK",
        keymanagement: "sae",
        band: "5GHz",
        dnsnameservers: "192.0.2.1 192.0.2.2",
      }),
      wpapsk: true,
    };
    const remembered = remember({
      kind: "ifaceChanged",
      before,
      after: before,
    });
    expect(JSON.stringify(remembered)).not.toContain("wpapsk");
    const request = wifiPutBackRequest(before, before.uuid, "typed-again");
    expect(request).toMatchObject({
      uuid: before.uuid,
      devicename: "wlp3s0",
      wpassid: "EXAMPLE-NETWORK",
      wpapsk: "typed-again",
      keymanagement: "sae",
      band: "5GHz",
      dnsnameservers: "192.0.2.1,192.0.2.2",
    });
  });

  it("refuses a stored value OMV does not write", () => {
    const before = settings("wlp3s0", { type: "wifi", band: "60GHz" });
    expect(wifiPutBackRequest(before, before.uuid, "x")).toBeNull();
  });
});
