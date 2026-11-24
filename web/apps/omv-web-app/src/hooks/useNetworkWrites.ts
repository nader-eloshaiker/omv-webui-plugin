// SPDX-License-Identifier: GPL-3.0-or-later
// The change flow's writes (phase 5 network design 0.9, 1.4 step 3, 1.7), ready-made for the pages:
// each is read, change, write (R4), the read made immediately before the write. It refuses with
// `changedSince` when the object is not as the summary showed it (another administrator, another tab),
// then writes through useNetworkApi (which records the save for the band) and reads the object back,
// which is what "Put back how it was" remembers (in memory only, never with a password).
//
// A page builds its NetworkChange with one of these as `write`. The Wi-Fi request carries the password
// typed for this request in the closure until the write is made; the flow drops the change once it is.
import {
  remember,
  withoutSecrets,
  type Remembered,
} from "../network/changeFlow.ts";
import type {
  FirewallRule,
  GeneralSettings,
  IfaceSettings,
  SetGeneralSettingsRequest,
} from "../network/dto.ts";
import { sameRules } from "../network/firewallModel.ts";
import { sameSettings, storedFor } from "../network/ifaceModel.ts";
import type { Impact } from "../network/impact.ts";
import type { Family } from "../network/ip.ts";
import {
  useNetworkApi,
  type IfaceWrite,
  type NetworkApi,
} from "./useNetworkApi.ts";

/** What a flow's write did: refused because the object changed since the summary, or saved. */
export type ChangeWrite =
  | { kind: "changedSince" }
  /** `remembered` is null when the object could not be read back: Put back is then not offered. */
  | { kind: "saved"; remembered: Remembered | null };

export type Write = () => Promise<ChangeWrite>;

const unchanged = (a: IfaceSettings | null, b: IfaceSettings): boolean =>
  a !== null && sameSettings(withoutSecrets(a), withoutSecrets(b));

/** The writes on a given API (for tests and for runs that keep the API they started with). */
export function networkWrites(api: NetworkApi) {
  const { rereads } = api;
  return {
    /** An interface changed (`before` as read for the summary) or set up (`before` null). */
    iface:
      (input: {
        before: IfaceSettings | null;
        write: IfaceWrite;
        impact: Impact;
      }): Write =>
      async () => {
        const { before, write, impact } = input;
        if (before !== null) {
          if (!unchanged(await rereads.iface(before.uuid), before)) {
            return { kind: "changedSince" };
          }
        } else if (write.request.devicename !== "") {
          // Set up: nobody set up the same interface meanwhile.
          const stored = await rereads.stored();
          if (storedFor(stored, write.request.devicename) !== null) {
            return { kind: "changedSince" };
          }
        }
        const saved = await api.setIface(write, impact);
        const after = await rereads.iface(saved.uuid).catch(() => null);
        if (after === null) {
          return { kind: "saved", remembered: null };
        }
        return {
          kind: "saved",
          remembered:
            before === null
              ? remember({ kind: "ifaceAdded", after })
              : remember({ kind: "ifaceChanged", before, after }),
        };
      },

    /** An interface's settings removed (10), when the flow runs it (the page cannot tell its interface). */
    removeIface:
      (input: { before: IfaceSettings; impact: Impact }): Write =>
      async () => {
        const { before, impact } = input;
        if (!unchanged(await rereads.iface(before.uuid), before)) {
          return { kind: "changedSince" };
        }
        await api.deleteInterface(
          { uuid: before.uuid, devicename: before.devicename },
          impact,
        );
        return {
          kind: "saved",
          remembered: remember({ kind: "ifaceRemoved", before }),
        };
      },

    /** The name and the domain (2): `before` as read for the summary. */
    name:
      (input: {
        before: GeneralSettings;
        request: SetGeneralSettingsRequest;
      }): Write =>
      async () => {
        const { before, request } = input;
        const now = await rereads.general();
        if (
          now.hostname !== before.hostname ||
          now.domainname !== before.domainname
        ) {
          return { kind: "changedSince" };
        }
        await api.setGeneralSettings(request);
        const after = await rereads.general().catch(() => null);
        return {
          kind: "saved",
          remembered:
            after === null
              ? null
              : remember({
                  kind: "name",
                  before: {
                    hostname: before.hostname,
                    domainname: before.domainname,
                  },
                  after: {
                    hostname: after.hostname,
                    domainname: after.domainname,
                  },
                }),
        };
      },

    /**
     * A firewall list changed (11): `before` the list as read for the summary; `write` makes the
     * page's calls (a rule added, changed or deleted, a new order, Block everything else).
     */
    firewall:
      (input: {
        family: Family;
        before: readonly FirewallRule[];
        write: (api: NetworkApi) => Promise<unknown>;
      }): Write =>
      async () => {
        const { family, before, write } = input;
        if (!sameRules(await rereads.rules(family), before)) {
          return { kind: "changedSince" };
        }
        await write(api);
        const after = await rereads.rules(family).catch(() => null);
        return {
          kind: "saved",
          remembered:
            after === null
              ? null
              : remember({ kind: "firewall", family, before, after }),
        };
      },
  };
}

export type NetworkWrites = ReturnType<typeof networkWrites>;

/** The flow's writes for a page: `writes.iface({ before, write, impact })` is a NetworkChange's `write`. */
export function useNetworkWrites(): NetworkWrites {
  return networkWrites(useNetworkApi());
}
