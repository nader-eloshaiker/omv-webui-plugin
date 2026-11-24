// SPDX-License-Identifier: GPL-3.0-or-later
// What the network pages keep in memory for the session (phase 5 network design 0.7, 0.8, 1.4, 1.7):
// what this session saved since the last apply (the pending mark beside the name card, an interface's
// row and settings card, a firewall rule list, the proxy card), the action running on each object
// (one at a time, 0.8's last row), and the one change flow with its remembered settings for "Put back
// how it was". In memory only (UI-13), never a password; emptied when the session ends, so a reload
// forgets the remembered settings and Put back is no longer offered (R8).
import { savedMarks } from "../pending/savedMarks.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";
import type {
  FlowObject,
  Remembered,
  RunState,
  WatchState,
} from "./changeFlow.ts";
import { objectKey } from "./changeFlow.ts";
import type { IfaceSettings } from "./dto.ts";
import type { Impact } from "./impact.ts";
import type { Family } from "./ip.ts";

export interface NetworkFlow {
  object: FlowObject;
  run: RunState | null;
  watch: WatchState | null;
  /** Set once the save is read back (1.7). */
  remembered: Remembered | null;
  /** The summary's "Copy the current settings" was used (1.6 step 7). */
  copied: boolean;
}

/**
 * What this session saved that marks the network (`systemd-networkd`) pending, for the band's apply
 * confirmation (1.8 as built): when every pending network change was saved here, the band uses the
 * classes those saves were given instead of 1.8's server-state rules, which cannot tell a pending
 * name-server change from a pending switch to an automatic address on a NAS that uses one.
 */
export interface NetworkSaves {
  /**
   * True while every pending network change was saved in this session: nothing was pending when the
   * first of them was saved, and the stored interfaces were as this session left them before each
   * later save.
   */
  owned: boolean;
  /** The stored interfaces (getInterfaceList, without secrets) as read right after the last save. */
  interfaces: readonly IfaceSettings[];
  /** Each interface save's class and findings, in order; a name save adds none. */
  changes: readonly { devicename: string; impact: Impact }[];
}

export interface NetworkSessionState {
  /** The name card was saved since the last apply. */
  nameSaved: boolean;
  /** The interfaces (by `uuid` or, for a new one, its name) saved since the last apply. */
  ifacesSaved: readonly string[];
  /** The firewall lists saved since the last apply. */
  rulesSaved: readonly Family[];
  proxySaved: boolean;
  /** The actions running, by objectKey. */
  running: readonly string[];
  /** The one change flow of this session. */
  flow: NetworkFlow | null;
  /** The network saves since the last apply (1.8 as built); null when none. */
  networkSaves: NetworkSaves | null;
  /** The interfaces whose settings this session removed since the last apply (10.4's Undo line). */
  ifacesRemoved: readonly string[];
}

const INITIAL: NetworkSessionState = {
  nameSaved: false,
  ifacesSaved: [],
  rulesSaved: [],
  proxySaved: false,
  running: [],
  flow: null,
  networkSaves: null,
  ifacesRemoved: [],
};

export const networkSession = createMemoryStore<NetworkSessionState>(INITIAL);

// Once their module is not pending any more (an apply or an undo ran), the marks are forgotten, each
// on a reading asked for after its own last save (savedMarks.ts).
const nameMarks = savedMarks.track(["hostname"], () =>
  networkSession.set((s) => (s.nameSaved ? { nameSaved: false } : {})),
);
const networkMarks = savedMarks.track(["systemd-networkd"], () =>
  networkSession.set((s) =>
    s.ifacesSaved.length === 0 && s.networkSaves === null
      ? {}
      : { ifacesSaved: [], networkSaves: null },
  ),
);
const rulesMarks = savedMarks.track(["iptables"], () =>
  networkSession.set((s) =>
    s.rulesSaved.length === 0 ? {} : { rulesSaved: [] },
  ),
);
const proxyMarks = savedMarks.track(["apt"], () =>
  networkSession.set((s) => (s.proxySaved ? { proxySaved: false } : {})),
);
const removedMarks = savedMarks.track(["task"], () =>
  networkSession.set((s) =>
    s.ifacesRemoved.length === 0 ? {} : { ifacesRemoved: [] },
  ),
);

export const recordNameSaved = (): void => {
  nameMarks.saved();
  networkSession.set((s) => (s.nameSaved ? {} : { nameSaved: true }));
};

export const recordIfaceSaved = (key: string): void => {
  networkMarks.saved();
  networkSession.set((s) =>
    s.ifacesSaved.includes(key) ? {} : { ifacesSaved: [...s.ifacesSaved, key] },
  );
};

export const recordRulesSaved = (family: Family): void => {
  rulesMarks.saved();
  networkSession.set((s) =>
    s.rulesSaved.includes(family)
      ? {}
      : { rulesSaved: [...s.rulesSaved, family] },
  );
};

/**
 * Record a save that marks the network pending. `pendingBefore` and `interfacesBefore` are read just
 * before the write, `interfacesAfter` just after it. A save made while network changes from elsewhere
 * were pending, or after the stored interfaces changed behind this session's back, leaves `owned`
 * false until the next apply.
 */
export function recordNetworkSave(input: {
  pendingBefore: readonly string[];
  interfacesBefore: readonly IfaceSettings[];
  /** Null when the read after the save failed: this session can no longer vouch for what is pending. */
  interfacesAfter: readonly IfaceSettings[] | null;
  change: { devicename: string; impact: Impact } | null;
  same: (a: readonly IfaceSettings[], b: readonly IfaceSettings[]) => boolean;
}): void {
  networkMarks.saved();
  networkSession.set((s) => {
    const previous = input.pendingBefore.includes("systemd-networkd")
      ? s.networkSaves
      : null;
    const owned =
      input.interfacesAfter !== null &&
      (previous === null
        ? !input.pendingBefore.includes("systemd-networkd")
        : previous.owned &&
          input.same(input.interfacesBefore, previous.interfaces));
    return {
      networkSaves: {
        owned,
        interfaces: input.interfacesAfter ?? [],
        changes: [
          ...(previous?.changes ?? []),
          ...(input.change === null ? [] : [input.change]),
        ],
      },
    };
  });
}

/** An interface's settings removed (10.2): its queued switch-off job outlives Undo (10.4). */
export const recordIfaceRemoved = (devicename: string): void => {
  removedMarks.saved();
  networkSession.set((s) =>
    s.ifacesRemoved.includes(devicename)
      ? {}
      : { ifacesRemoved: [...s.ifacesRemoved, devicename] },
  );
};

export const recordProxySaved = (): void => {
  proxyMarks.saved();
  networkSession.set((s) => (s.proxySaved ? {} : { proxySaved: true }));
};

/** Mark an object as being changed; false when an action on it already runs in this session. */
export function beginAction(object: FlowObject): boolean {
  const key = objectKey(object);
  if (networkSession.getState().running.includes(key)) {
    return false;
  }
  networkSession.set((s) => ({ running: [...s.running, key] }));
  return true;
}

export const endAction = (object: FlowObject): void =>
  networkSession.set((s) => ({
    running: s.running.filter((k) => k !== objectKey(object)),
  }));

/** Start the one flow of the session; false when another flow is open. */
export function openFlow(object: FlowObject): boolean {
  if (networkSession.getState().flow !== null) {
    return false;
  }
  networkSession.set({
    flow: { object, run: null, watch: null, remembered: null, copied: false },
  });
  return true;
}

export const updateFlow = (change: Partial<NetworkFlow>): void =>
  networkSession.set((s) =>
    s.flow === null ? {} : { flow: { ...s.flow, ...change } },
  );

/** "Keep the new settings", or the flow dismissed: the remembered settings are forgotten. Nothing is sent. */
export const closeFlow = (): void => networkSession.set({ flow: null });
