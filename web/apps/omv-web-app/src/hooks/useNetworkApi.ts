// SPDX-License-Identifier: GPL-3.0-or-later
// The network slice's writes (phase 5 network design 0.7, 0.9, 1.4, 1.7, 4.4, 10, 11, 12), from the
// generated hooks, gathered for the pages, the change flow and the band. The page developers' single
// entry point: every save goes through here, so each one is recorded for the session (the pending
// marks of 0.7, and the class it was saved with for the band's apply confirmation, 1.8 as built).
//
// Every operation here is marked x-omv-dirty in the contract (identify excepted: it starts a task), so
// the pending-changes reads are refreshed centrally (react-api-omv/query.ts), never per page. After a
// write the network reads it changed are read again. Nothing here retries (UI-14).
//
// Passwords: Network.setWirelessIface carries the Wi-Fi password typed for that request, and
// Network.setProxy the proxy passwords (0.6). Their mutations keep nothing once they end (gcTime 0
// and reset), so no password stays in the mutation cache; their replies carry none (x-omv-omit). The
// caller drops its own copy as soon as the request returns (UI-6).
import {
  getIptablesGetRules6QueryKey,
  getIptablesGetRulesQueryKey,
  getNetworkEnumerateDevicesListQueryKey,
  getNetworkGetGeneralSettingsQueryKey,
  getNetworkGetInterfaceListQueryKey,
  getNetworkGetInterfaceQueryKey,
  getNetworkGetProxyQueryKey,
  useConfigApplyChangesBg,
  useConfigRevertChangesBg,
  useIptablesDeleteRule,
  useIptablesSetRule,
  useIptablesSetRules,
  useIptablesSetRules6,
  useNetworkDeleteInterface,
  useNetworkIdentify,
  useNetworkSetBondIface,
  useNetworkSetBridgeIface,
  useNetworkSetEthernetIface,
  useNetworkSetGeneralSettings,
  useNetworkSetProxy,
  useNetworkSetVlanIface,
  useNetworkSetWirelessIface,
  type NetworkIdentifyRequest,
  type NetworkInterfaceStored,
  type NetworkProxyStored,
} from "@omv-webui/react-api-omv/generated";
import { useQueryClient } from "@tanstack/react-query";
import { sameInterfaces } from "../network/bandSession.ts";
import type {
  FirewallRule,
  GeneralSettings,
  SetGeneralSettingsRequest,
  SetProxyRequest,
  SetRuleRequest,
  SetWirelessIfaceRequest,
} from "../network/dto.ts";
import type { RulesWrite } from "../network/firewallModel.ts";
import type { StoredRequest } from "../network/ifaceModel.ts";
import type { Impact } from "../network/impact.ts";
import type { Family } from "../network/ip.ts";
import {
  recordIfaceRemoved,
  recordIfaceSaved,
  recordNameSaved,
  recordNetworkSave,
  recordProxySaved,
  recordRulesSaved,
} from "../network/networkSession.ts";
import { useNetworkRereads, type NetworkRereads } from "./useNetworkReads.ts";

/** A task-starting call, for the task registry (`taskRegistry.start(label, begin)`). */
export type Begin = () => Promise<string>;

/**
 * An interface's write: one of the set…Iface requests. A Wi-Fi interface always carries the password
 * typed for this request (0.6, P8); ifaceModel's StoredRequest names Wi-Fi without one, so Put back
 * builds it with changeFlow.wifiPutBackRequest.
 */
export type IfaceWrite =
  | Exclude<StoredRequest, { type: "wifi" }>
  | { type: "wifi"; request: SetWirelessIfaceRequest };

/** setRules or setRules6, as firewallModel.setRulesRequest built it. */
export type RulesRequest = Extract<RulesWrite, { ok: true }>;

export interface NetworkApi {
  rereads: NetworkRereads;
  /**
   * Save the name and the domain. The band checks a pending name from the server's state either way
   * (1.8), so no class is recorded with it.
   */
  setGeneralSettings(
    request: SetGeneralSettingsRequest,
  ): Promise<GeneralSettings>;
  /** Save an interface's settings (new or changed), with the class the page gave the change. */
  setIface(write: IfaceWrite, impact: Impact): Promise<NetworkInterfaceStored>;
  /** Remove an interface's settings (10), with the class of the removal. */
  deleteInterface(
    target: { uuid: string; devicename: string },
    impact: Impact,
  ): Promise<NetworkInterfaceStored>;
  /** Add or change one IPv4 or IPv6 rule (11.4). */
  setRule(request: SetRuleRequest): Promise<FirewallRule>;
  /** Replace a whole list in a new order (11.7) or put back the list as it was (1.7). */
  setRules(write: RulesRequest): Promise<FirewallRule[]>;
  /** Delete one rule (11.8). */
  deleteRule(uuid: string, family: Family): Promise<FirewallRule>;
  /** Save the proxy, each password typed again or empty (12.3). */
  setProxy(request: SetProxyRequest): Promise<NetworkProxyStored>;
  /** Blink a port's light (4.4): a task, followed by the task registry. */
  identify(request: NetworkIdentifyRequest): Begin;
  /** Config.applyChangesBg with these modules (1.4 step 3; [] applies everything pending). */
  apply(modules: readonly string[], force?: boolean): Begin;
  /** Config.revertChangesBg: undoes everyone's pending changes (N2). */
  revert(): Begin;
}

const NETWORK_READS = [
  getNetworkEnumerateDevicesListQueryKey().slice(0, 2),
  getNetworkGetInterfaceListQueryKey().slice(0, 2),
  getNetworkGetInterfaceQueryKey().slice(0, 2),
  getNetworkGetGeneralSettingsQueryKey(),
] as const;

export function useNetworkApi(): NetworkApi {
  const queryClient = useQueryClient();
  const rereads = useNetworkRereads();
  const general = useNetworkSetGeneralSettings();
  const ethernet = useNetworkSetEthernetIface();
  const bond = useNetworkSetBondIface();
  const vlan = useNetworkSetVlanIface();
  const bridge = useNetworkSetBridgeIface();
  // The two writes that carry a password keep nothing once they end (UI-6).
  const wifi = useNetworkSetWirelessIface({ mutation: { gcTime: 0 } });
  const proxy = useNetworkSetProxy({ mutation: { gcTime: 0 } });
  const del = useNetworkDeleteInterface();
  const rule = useIptablesSetRule();
  const rules4 = useIptablesSetRules();
  const rules6 = useIptablesSetRules6();
  const delRule = useIptablesDeleteRule();
  const identify = useNetworkIdentify();
  const apply = useConfigApplyChangesBg();
  const revert = useConfigRevertChangesBg();

  const rereadNetwork = () => {
    for (const queryKey of NETWORK_READS) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
  const rereadRules = (family: Family) =>
    void queryClient.invalidateQueries({
      queryKey:
        family === 4
          ? getIptablesGetRulesQueryKey()
          : getIptablesGetRules6QueryKey(),
    });

  /**
   * A write that marks the network pending, recorded for the band (1.8 as built): the pending modules
   * and the stored interfaces are read just before it, the stored interfaces again just after. A read
   * before that fails stops the write (0.8: fail closed); one after it only means this session no
   * longer vouches for what is pending.
   */
  async function tracked<T>(
    write: () => Promise<T>,
    change: (result: T) => { devicename: string; impact: Impact } | null,
  ): Promise<T> {
    const [pendingBefore, interfacesBefore] = await Promise.all([
      rereads.pending(),
      rereads.stored(),
    ]);
    const result = await write();
    rereadNetwork();
    const interfacesAfter = await rereads.stored().catch(() => null);
    recordNetworkSave({
      pendingBefore,
      interfacesBefore,
      interfacesAfter,
      change: change(result),
      same: sameInterfaces,
    });
    return result;
  }

  async function setIfaceRequest(
    write: IfaceWrite,
  ): Promise<NetworkInterfaceStored> {
    switch (write.type) {
      case "ethernet":
        return ethernet.mutateAsync({ data: write.request });
      case "bond":
        return bond.mutateAsync({ data: write.request });
      case "vlan":
        return vlan.mutateAsync({ data: write.request });
      case "bridge":
        return bridge.mutateAsync({ data: write.request });
      case "wifi":
        try {
          return await wifi.mutateAsync({ data: write.request });
        } finally {
          wifi.reset();
        }
    }
  }

  return {
    rereads,
    async setGeneralSettings(request) {
      const saved = await tracked(
        () => general.mutateAsync({ data: request }),
        () => null,
      );
      recordNameSaved();
      return saved;
    },
    async setIface(write, impact) {
      // A new bond or bridge is named by OMV: its name comes with the reply.
      const saved = await tracked(
        () => setIfaceRequest(write),
        (reply) => ({ devicename: reply.devicename, impact }),
      );
      recordIfaceSaved(saved.uuid);
      return saved;
    },
    async deleteInterface(target, impact) {
      const removed = await tracked(
        () => del.mutateAsync({ data: { uuid: target.uuid } }),
        () => ({ devicename: target.devicename, impact }),
      );
      recordIfaceSaved(target.uuid);
      recordIfaceRemoved(target.devicename);
      return removed;
    },
    async setRule(request) {
      const saved = await rule.mutateAsync({ data: request });
      const family = request.family === "inet6" ? 6 : 4;
      rereadRules(family);
      recordRulesSaved(family);
      return saved;
    },
    async setRules(write) {
      const saved =
        write.family === 4
          ? await rules4.mutateAsync({ data: write.request })
          : await rules6.mutateAsync({ data: write.request });
      rereadRules(write.family);
      recordRulesSaved(write.family);
      return saved;
    },
    async deleteRule(uuid, family) {
      const removed = await delRule.mutateAsync({ data: { uuid } });
      rereadRules(family);
      recordRulesSaved(family);
      return removed;
    },
    async setProxy(request) {
      try {
        const saved = await proxy.mutateAsync({ data: request });
        void queryClient.invalidateQueries({
          queryKey: getNetworkGetProxyQueryKey(),
        });
        recordProxySaved();
        return saved;
      } finally {
        proxy.reset();
      }
    },
    identify: (request) => () => identify.mutateAsync({ data: request }),
    apply:
      (modules, force = false) =>
      () =>
        apply.mutateAsync({ data: { modules: [...modules], force } }),
    revert: () => () => revert.mutateAsync({ data: { filename: "" } }),
  };
}
