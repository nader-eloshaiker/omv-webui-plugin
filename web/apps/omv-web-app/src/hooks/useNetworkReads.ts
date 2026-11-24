// SPDX-License-Identifier: GPL-3.0-or-later
// The network slice's reads (phase 5 network design 0.4, 1.4, 1.8, 2.1, 3.1, 4.1, 11.1, 12.1), one
// set of parameters each, so every network page, the change flow and the band's apply confirmation
// share one cache entry per read. Read on opening a page and again on window focus (0.4 "Read when");
// nothing polls here. The interfaces list shares its entry with the dashboard's network card, which
// polls it in the background (useMonitoringReads.ts).
//
// The stored Wi-Fi password is replaced by the transport with whether one is set (x-omv-presence)
// in getInterface and getInterfaceList, and removed (x-omv-omit) from enumerateDevicesList and every
// write's reply, before anything is cached, so no entry here holds one (UI-6).
//
// networkRereads are fresh foreground reads landing in the same entries: the design's "read
// immediately before every save" (0.4, 0.9, R4), the apply confirmation's check (1.8) and the flow's
// checks. useConnection is the page's single entry point to which interface it reaches the NAS
// through (0.4): a failed read makes the conclusion Not known, never Known.
import {
  getIptablesGetRules6QueryOptions,
  getIptablesGetRulesQueryOptions,
  getNetworkEnumerateDevicesListQueryOptions,
  getNetworkGetGeneralSettingsQueryOptions,
  getNetworkGetInterfaceListQueryOptions,
  getNetworkGetInterfaceQueryOptions,
  getNetworkGetProxyQueryOptions,
  getSshGetQueryOptions,
  getSystemGetInformationQueryOptions,
  getWebGuiGetSettingsQueryOptions,
  useIptablesGetRules,
  useIptablesGetRules6,
  useNetworkEnumerateDevicesList,
  useNetworkGetGeneralSettings,
  useNetworkGetInformation,
  useNetworkGetInterface,
  useNetworkGetInterfaceList,
  useNetworkGetProxy,
  useSshGet,
  useWebGuiGetSettings,
  type GetListRequest,
  type NetworkDevice,
  type NetworkInterface,
  type NetworkInterfaceRow,
  type SystemInformation,
} from "@omv-webui/react-api-omv/generated";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import type { PageLocation } from "../network/connection.ts";
import { workOutConnection, type Connection } from "../network/connection.ts";
import {
  failed,
  ok,
  toIfaceSettings,
  type DeviceRow,
  type FirewallRule,
  type GeneralSettings,
  type IfaceSettings,
  type ProxySettings,
  type Read,
  type SshPortSettings,
  type WebPortsSettings,
} from "../network/dto.ts";
import type { Family } from "../network/ip.ts";
import { readPageLocation } from "../network/pageLocation.ts";
import { pendingModules } from "../pending/modules.ts";
import { ALL_INTERFACES } from "./useMonitoringReads.ts";
import { freshRead } from "./useSharesReads.ts";

/** Every interface, by name: the same request as the dashboard's card, so they share one entry. */
export const NETWORK_LIST: GetListRequest = ALL_INTERFACES;

export interface NetworkReadOptions {
  /** False keeps the read from starting (a normal user, a form not shown yet). */
  enabled?: boolean;
  /** Read again when the window regains focus; true by default (0.4). Off while a form holds unsaved work. */
  focus?: boolean;
}

/** Read on opening a page and, unless asked otherwise, on window focus (0.4). */
function onOpen({ enabled = true, focus = true }: NetworkReadOptions) {
  return {
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: focus ? "always" : false,
    refetchOnReconnect: false,
    staleTime: Number.POSITIVE_INFINITY,
  } as const;
}

/** What each interface uses now, with its stored fields when it has settings (enumerateDevicesList). */
export const useNetworkDevices = (options: NetworkReadOptions = {}) =>
  useNetworkEnumerateDevicesList(NETWORK_LIST, { query: onOpen(options) });

/** The stored settings of every interface (getInterfaceList): what the next apply puts in place. */
export const useStoredInterfaces = (options: NetworkReadOptions = {}) =>
  useNetworkGetInterfaceList(NETWORK_LIST, { query: onOpen(options) });

/** One interface's stored settings (getInterface), read just before it is changed. */
export const useStoredInterface = (
  uuid: string,
  options: NetworkReadOptions = {},
) => useNetworkGetInterface({ uuid }, { query: onOpen(options) });

/** The NAS's name and domain (Network > General). */
export const useGeneralSettings = (options: NetworkReadOptions = {}) =>
  useNetworkGetGeneralSettings({ query: onOpen(options) });

/** The web interface's ports, for the firewall check (0.4's web ports). */
export const useWebPortsSettings = (options: NetworkReadOptions = {}) =>
  useWebGuiGetSettings({ query: onOpen(options) });

/** Whether SSH is on and its port, for the firewall check (0.4). */
export const useSshPortSettings = (options: NetworkReadOptions = {}) =>
  useSshGet({ query: onOpen(options) });

/** The IPv4 firewall rules (Iptables.getRules). */
export const useFirewallRules4 = (options: NetworkReadOptions = {}) =>
  useIptablesGetRules({ query: onOpen(options) });

/** The IPv6 firewall rules (Iptables.getRules6). */
export const useFirewallRules6 = (options: NetworkReadOptions = {}) =>
  useIptablesGetRules6({ query: onOpen(options) });

/** The proxy (getProxy), its passwords as whether they are set. */
export const useProxySettings = (options: NetworkReadOptions = {}) =>
  useNetworkGetProxy({ query: onOpen(options) });

/**
 * What one interface uses now (getInformation), for its page (4.1). Only a name the page matched to a
 * row of enumerateDevicesList is asked for; until then `enabled` is false.
 */
export const useInterfaceInformation = (
  devicename: string,
  options: NetworkReadOptions = {},
) => useNetworkGetInformation({ devicename }, { query: onOpen(options) });

/**
 * A query as the network rules read it (dto.ts `Read`): failed whenever the last read failed, even
 * with older data in hand, because a failed read is never read as safe (0.8).
 */
export function readOf<T>(query: { data?: T; isError: boolean }): Read<T> {
  if (query.isError) {
    return failed;
  }
  return query.data === undefined ? { state: "loading" } : ok(query.data);
}

/** The stored interfaces this page can handle, narrowed (dto.ts); one OMV does not write is left out. */
export const storedList = (
  rows: readonly (NetworkInterface | NetworkInterfaceRow)[],
): IfaceSettings[] =>
  rows.flatMap((row) => {
    const narrowed = toIfaceSettings(row);
    return narrowed === null ? [] : [narrowed];
  });

// ---- Fresh reads (0.4 "Read when", 0.9 R4, 1.8) ------------------------------------------------------

export interface NetworkRereads {
  devices(): Promise<NetworkDevice[]>;
  stored(): Promise<IfaceSettings[]>;
  /** One interface's stored settings, or null for a type or method this page does not handle. */
  iface(uuid: string): Promise<IfaceSettings | null>;
  general(): Promise<GeneralSettings>;
  webPorts(): Promise<WebPortsSettings>;
  ssh(): Promise<SshPortSettings>;
  rules(family: Family): Promise<FirewallRule[]>;
  proxy(): Promise<ProxySettings>;
  /** System.getInformation, in the shell's entry: the pending modules and the name in effect. */
  information(): Promise<SystemInformation>;
  /** The pending modules, from System.getInformation. */
  pending(): Promise<string[]>;
  /**
   * The reconnect watch's one small read (1.5): System.getInformation as a background call
   * (`updatelastaccess: false`, UI-14), so waiting for the NAS never keeps an idle session alive.
   */
  backgroundInformation(): Promise<SystemInformation>;
}

const FRESH = { staleTime: 0, retry: false } as const;

export function networkRereads(queryClient: QueryClient): NetworkRereads {
  const information = () =>
    freshRead(queryClient, getSystemGetInformationQueryOptions().queryKey, () =>
      queryClient.fetchQuery({
        ...getSystemGetInformationQueryOptions(),
        ...FRESH,
      }),
    );
  const devicesOptions =
    getNetworkEnumerateDevicesListQueryOptions(NETWORK_LIST);
  const storedOptions = getNetworkGetInterfaceListQueryOptions(NETWORK_LIST);
  const generalOptions = getNetworkGetGeneralSettingsQueryOptions();
  const webOptions = getWebGuiGetSettingsQueryOptions();
  const sshOptions = getSshGetQueryOptions();
  const rules4 = getIptablesGetRulesQueryOptions();
  const rules6 = getIptablesGetRules6QueryOptions();
  const proxyOptions = getNetworkGetProxyQueryOptions();
  return {
    devices: () =>
      freshRead(queryClient, devicesOptions.queryKey, () =>
        queryClient.fetchQuery({ ...devicesOptions, ...FRESH }),
      ).then((l) => l.data),
    stored: () =>
      freshRead(queryClient, storedOptions.queryKey, () =>
        queryClient.fetchQuery({ ...storedOptions, ...FRESH }),
      ).then((l) => storedList(l.data)),
    iface: (uuid) => {
      const options = getNetworkGetInterfaceQueryOptions({ uuid });
      return freshRead(queryClient, options.queryKey, () =>
        queryClient.fetchQuery({ ...options, ...FRESH }),
      ).then(toIfaceSettings);
    },
    general: () =>
      freshRead(queryClient, generalOptions.queryKey, () =>
        queryClient.fetchQuery({ ...generalOptions, ...FRESH }),
      ),
    webPorts: () =>
      freshRead(queryClient, webOptions.queryKey, () =>
        queryClient.fetchQuery({ ...webOptions, ...FRESH }),
      ),
    ssh: () =>
      freshRead(queryClient, sshOptions.queryKey, () =>
        queryClient.fetchQuery({ ...sshOptions, ...FRESH }),
      ),
    rules: (family) => {
      const options = family === 4 ? rules4 : rules6;
      return freshRead(queryClient, options.queryKey, () =>
        queryClient.fetchQuery({ ...options, ...FRESH }),
      );
    },
    proxy: () =>
      freshRead(queryClient, proxyOptions.queryKey, () =>
        queryClient.fetchQuery({ ...proxyOptions, ...FRESH }),
      ),
    information,
    pending: () =>
      information().then((info) => pendingModules(info.dirtyModules)),
    backgroundInformation: () =>
      queryClient.fetchQuery({
        ...getSystemGetInformationQueryOptions({
          request: { background: true },
        }),
        ...FRESH,
      }),
  };
}

/** The re-reads for a page, a dialog's check or the change flow. */
export function useNetworkRereads(): NetworkRereads {
  const queryClient = useQueryClient();
  return useMemo(() => networkRereads(queryClient), [queryClient]);
}

/** A read made for a check: its data, or failed (never thrown: a failed read makes the check fail closed). */
export const settle = <T>(read: Promise<T>): Promise<Read<T>> =>
  read.then(ok, () => failed);

// ---- The connection (0.4) ------------------------------------------------------------------------------

export interface ConnectionReading {
  connection: Connection;
  location: PageLocation;
  devices: Read<readonly DeviceRow[]>;
  general: Read<GeneralSettings>;
}

/** Work out the connection from fresh reads: on opening the apply confirmation, before every save. */
export async function readConnection(
  rereads: Pick<NetworkRereads, "devices" | "general">,
  location: PageLocation = readPageLocation(),
): Promise<ConnectionReading> {
  const [devices, general] = await Promise.all([
    settle<readonly DeviceRow[]>(rereads.devices()),
    settle(rereads.general()),
  ]);
  return {
    connection: workOutConnection({ location, devices, general }),
    location,
    devices,
    general,
  };
}

/**
 * Which interface and address this page reaches the NAS through (0.4), from the cached reads, which
 * are read on opening the page and again on window focus. `refresh()` reads both again at once and
 * resolves with the conclusion from those fresh reads: call it immediately before every save of an
 * interface, the name or the firewall (the change flow and useNetworkApi do).
 */
export function useConnection(options: NetworkReadOptions = {}) {
  const rereads = useNetworkRereads();
  const devicesQuery = useNetworkDevices(options);
  const generalQuery = useGeneralSettings(options);
  // The address this page was opened at does not change while it is open.
  const [location] = useState(readPageLocation);
  const devices = readOf<readonly DeviceRow[]>({
    data: devicesQuery.data?.data,
    isError: devicesQuery.isError,
  });
  const general = readOf<GeneralSettings>(generalQuery);
  const connection = workOutConnection({ location, devices, general });
  const refresh = useCallback(
    () => readConnection(rereads, location),
    [rereads, location],
  );
  return { connection, location, devices, general, refresh };
}
