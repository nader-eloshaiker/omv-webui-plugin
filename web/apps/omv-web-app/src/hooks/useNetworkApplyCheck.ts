// SPDX-License-Identifier: GPL-3.0-or-later
// The apply confirmation's network check (phase 5 network design 1.8, 13.1): whenever
// systemd-networkd, hosts, hostname or iptables is pending, the confirmation runs impact.ts's
// bandCheck from the server's state, read again when it opens (0.4 "Read when"): the stored interfaces
// against what each uses now, the stored name against the name this page was opened by and the name in
// effect, and the stored firewall rules through the firewall check. When every pending network change
// was saved in this session, the interface part uses the classes those saves were given instead
// (bandSession.ts, 1.8 as built). A read that fails makes its part May cut, never safe (0.8).
//
// It is a query (enabled while the confirmation is open), so the reads land in their shared entries
// and nothing runs on page load (UI-4). Its result is kept for no longer than the dialog is open.
import { useQuery } from "@tanstack/react-query";
import { sessionInterfaceLines } from "../network/bandSession.ts";
import {
  pageFamilies,
  sshPort,
  webPorts,
  type Connection,
  type PageLocation,
} from "../network/connection.ts";
import { failed, type DeviceRow, type Read } from "../network/dto.ts";
import { checkBothLists } from "../network/firewallCheck.ts";
import { bandCheck, bandChecks, type BandCheck } from "../network/impact.ts";
import { networkSession } from "../network/networkSession.ts";
import {
  readConnection,
  settle,
  useNetworkRereads,
  type NetworkRereads,
} from "./useNetworkReads.ts";

export interface ApplyCheck {
  check: BandCheck;
  connection: Connection;
  location: PageLocation;
  devices: Read<readonly DeviceRow[]>;
  /** The NAS's name in effect (System.getInformation), for the recovery card; "" when not read. */
  hostname: string;
}

/** Run the check once, from fresh reads. */
export async function runApplyCheck(
  rereads: NetworkRereads,
  pending: readonly string[],
): Promise<ApplyCheck> {
  const reading = await readConnection(rereads);
  const { connection, location, devices, general } = reading;
  const [stored, info] = await Promise.all([
    settle(rereads.stored()),
    settle(rereads.information()),
  ]);
  let firewall = null;
  if (pending.includes("iptables")) {
    const families = pageFamilies(connection);
    const [rules4, rules6, web, ssh] = await Promise.all([
      settle(rereads.rules(4)),
      families.includes(6) ? settle(rereads.rules(6)) : Promise.resolve(failed),
      settle(rereads.webPorts()),
      settle(rereads.ssh()),
    ]);
    firewall = checkBothLists(
      { 4: rules4, 6: rules6 },
      {
        connection,
        ports: webPorts(location, web, connection),
        ssh: sshPort(ssh),
      },
    );
  }
  const hostname = info.state === "ok" ? info.data.hostname : "";
  const check = bandCheck({
    pending,
    location,
    connection,
    devices,
    stored,
    general,
    appliedHostname: info.state === "ok" ? hostname : undefined,
    firewall,
    session: sessionInterfaceLines(
      networkSession.getState().networkSaves,
      stored,
    ),
  });
  return { check, connection, location, devices, hostname };
}

/** The one key of this composite check, so the dialog's result is shared by nothing else. */
const APPLY_CHECK_KEY = ["omv-webui", "networkApplyCheck"] as const;

/**
 * The check while the confirmation is open and network modules are pending: `undefined` when none
 * is, `{ state: "checking" }` while it reads, then its result.
 */
export function useNetworkApplyCheck(
  open: boolean,
  pending: readonly string[],
): undefined | { state: "checking" } | { state: "done"; result: ApplyCheck } {
  const rereads = useNetworkRereads();
  const checks = bandChecks(pending);
  const query = useQuery({
    queryKey: [...APPLY_CHECK_KEY, [...pending]],
    queryFn: () => runApplyCheck(rereads, pending),
    enabled: open && checks,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (!checks) {
    return undefined;
  }
  return query.data === undefined || query.isFetching
    ? { state: "checking" }
    : { state: "done", result: query.data };
}
