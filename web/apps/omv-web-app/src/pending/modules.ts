// SPDX-License-Identifier: GPL-3.0-or-later
// OMV's configuration modules, by the id System.getInformation reports in `dirtyModules`. The ids
// are the engine modules' names (engined/module/*.inc, `getName()`), which are also the omv-salt
// deploy states (srv/salt/omv/deploy/), read from openmediavault 8.6.x. Their plain names are in the
// catalogue (`modules.*`). An id not listed here (a plugin's) is shown as itself.

export const KNOWN_MODULES = [
  "apt",
  "apticron",
  "avahi",
  "certificates",
  "chrony",
  "collectd",
  "cpupower",
  "cron",
  "fstab",
  "halt",
  "hostname",
  "hosts",
  "initramfs",
  "iptables",
  "issue",
  "mdadm",
  "monit",
  "nfs",
  "nginx",
  "pam",
  "phpfpm",
  "postfix",
  "profile",
  "quota",
  "rrdcached",
  "rsync",
  "rsyncd",
  "rsyslog",
  "samba",
  "sharedfolders",
  "smartmontools",
  "ssh",
  "sysctl",
  "systemd",
  "systemd-journald",
  "systemd-logind",
  "systemd-networkd",
  "task",
  "timezone",
  "watchdog",
  "webadmin",
  "webgui",
] as const;
export type KnownModule = (typeof KNOWN_MODULES)[number];

export const isKnownModule = (id: string): id is KnownModule =>
  (KNOWN_MODULES as readonly string[]).includes(id);

/**
 * Modules whose deployment can cut the connection this page runs over: the network configuration
 * (systemd-networkd), the web server (nginx, which webadmin changes also mark), the PHP back end of
 * rpc.php (phpfpm), the certificates nginx may serve, and the firewall (iptables).
 */
const CONNECTION_MODULES = new Set<string>([
  "systemd-networkd",
  "nginx",
  "phpfpm",
  "certificates",
  "iptables",
]);

export const mayCutConnection = (ids: readonly string[]): boolean =>
  ids.some((id) => CONNECTION_MODULES.has(id));

/** The pending module ids from System.getInformation, in a stable order. */
export function pendingModules(
  dirtyModules: Record<string, string> | undefined,
): string[] {
  return Object.keys(dirtyModules ?? {}).sort();
}
