// SPDX-License-Identifier: GPL-3.0-or-later
// What the firewall check needs besides the rules (phase 5 network design 0.4, 11.1, 11.5, D20): the
// connection this page uses, the web interface's ports and SSH's. One place, so the firewall page,
// its dialogs and the SSH page's line run the check on the same facts. Reads only, on opening and on
// window focus unless asked otherwise (useNetworkReads).
import {
  sshPort,
  webPorts,
  type SshPort,
  type WebPorts,
} from "../network/connection.ts";
import type { CheckContext } from "../network/firewallCheck.ts";
import type { PortNames } from "../network/ruleWords.ts";
import {
  readOf,
  useConnection,
  useSshPortSettings,
  useWebPortsSettings,
  type NetworkReadOptions,
} from "./useNetworkReads.ts";

export interface FirewallContext {
  /** The check's inputs (11.5). */
  check: CheckContext;
  /** The names of known ports in the list and the dialog (11.3, D20). */
  names: PortNames;
  /** The web ports and SSH settings were read, or failed: the check can be shown (11.9). */
  settled: boolean;
  /** The connection's own reads and its refresh, for the line at the top and before a save. */
  connection: ReturnType<typeof useConnection>;
}

export function useFirewallContext(
  options: NetworkReadOptions = {},
): FirewallContext {
  const connection = useConnection(options);
  const web = useWebPortsSettings(options);
  const ssh = useSshPortSettings(options);
  const webRead = readOf(web);
  const sshRead = readOf(ssh);
  const ports: WebPorts = webPorts(
    connection.location,
    webRead,
    connection.connection,
  );
  const sshNow: SshPort = sshPort(sshRead);
  const settled =
    webRead.state !== "loading" &&
    sshRead.state !== "loading" &&
    connection.connection.kind !== "loading";
  const names: PortNames = {
    pagePort: ports.page,
    otherWebPorts: ports.others.map((o) => o.port),
    sshPort: ssh.data?.port ?? null,
  };
  return {
    check: { connection: connection.connection, ports, ssh: sshNow },
    names,
    settled,
    connection,
  };
}
