// SPDX-License-Identifier: GPL-3.0-or-later
// The side navigation: OMV's own menu, as the stock interface groups and orders it (read from
// openmediavault's workbench/navigation.d/*.yaml, 8.6.x), so existing users find things. Each entry
// names its page in the classic interface as a literal path written here, never built from data or
// the URL (UI-3, UI-4). An entry's group and item are the two path segments of its route under /ui/,
// so a URL only selects which of these pages is shown.
//
// Roles, as the stock files set them: every group except Account is for administrators; under
// Account, "Settings" is for normal users only and "Password" is for everyone. A normal user sees the
// dashboard and Account. This is presentation only; the backend decides what is allowed.
//
// Pages built in this interface replace `classic` with their own route as they arrive (Phase 3 on).
// Items that installed plugins add are not listed: they exist only at run time, and the "Add-ons"
// entry sends the reader to the classic interface for them.
import type { Role } from "@omv-webui/react-api-omv/generated";

export const NAV_GROUPS = [
  "system",
  "network",
  "storage",
  "services",
  "usermgmt",
  "diagnostics",
  "account",
] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface NavPage {
  group: NavGroup;
  /** The second path segment, the same as the classic interface's. */
  item: string;
  /** The page's name in the catalogue. */
  labelKey: `nav.items.${string}`;
  /** The page in the classic interface: a literal path on this server (UI-3). */
  classic: string;
  roles: readonly Role[];
}

const ADMIN = ["admin"] as const satisfies readonly Role[];
const USER = ["user"] as const satisfies readonly Role[];
const EVERYONE = ["admin", "user"] as const satisfies readonly Role[];

/** In the stock order: by group, then by each item's `position` (ties and unpositioned by name). */
export const NAV_PAGES = [
  {
    group: "system",
    item: "workbench",
    labelKey: "nav.items.system.workbench",
    classic: "/system/workbench",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "date-time",
    labelKey: "nav.items.system.date-time",
    classic: "/system/date-time",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "notification",
    labelKey: "nav.items.system.notification",
    classic: "/system/notification",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "powermgmt",
    labelKey: "nav.items.system.powermgmt",
    classic: "/system/powermgmt",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "monitoring",
    labelKey: "nav.items.system.monitoring",
    classic: "/system/monitoring",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "cron",
    labelKey: "nav.items.system.cron",
    classic: "/system/cron",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "certificate",
    labelKey: "nav.items.system.certificate",
    classic: "/system/certificate",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "updatemgmt",
    labelKey: "nav.items.system.updatemgmt",
    classic: "/system/updatemgmt",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "plugins",
    labelKey: "nav.items.system.plugins",
    classic: "/system/plugins",
    roles: ADMIN,
  },
  {
    group: "network",
    item: "general",
    labelKey: "nav.items.network.general",
    classic: "/network/general",
    roles: ADMIN,
  },
  {
    group: "network",
    item: "interfaces",
    labelKey: "nav.items.network.interfaces",
    classic: "/network/interfaces",
    roles: ADMIN,
  },
  {
    group: "network",
    item: "proxy",
    labelKey: "nav.items.network.proxy",
    classic: "/network/proxy",
    roles: ADMIN,
  },
  {
    group: "network",
    item: "firewall",
    labelKey: "nav.items.network.firewall",
    classic: "/network/firewall",
    roles: ADMIN,
  },
  {
    group: "storage",
    item: "disks",
    labelKey: "nav.items.storage.disks",
    classic: "/storage/disks",
    roles: ADMIN,
  },
  {
    group: "storage",
    item: "smart",
    labelKey: "nav.items.storage.smart",
    classic: "/storage/smart",
    roles: ADMIN,
  },
  {
    group: "storage",
    item: "filesystems",
    labelKey: "nav.items.storage.filesystems",
    classic: "/storage/filesystems",
    roles: ADMIN,
  },
  {
    group: "storage",
    item: "shared-folders",
    labelKey: "nav.items.storage.shared-folders",
    classic: "/storage/shared-folders",
    roles: ADMIN,
  },
  {
    group: "services",
    item: "nfs",
    labelKey: "nav.items.services.nfs",
    classic: "/services/nfs",
    roles: ADMIN,
  },
  {
    group: "services",
    item: "rsync",
    labelKey: "nav.items.services.rsync",
    classic: "/services/rsync",
    roles: ADMIN,
  },
  {
    group: "services",
    item: "smb",
    labelKey: "nav.items.services.smb",
    classic: "/services/smb",
    roles: ADMIN,
  },
  {
    group: "services",
    item: "ssh",
    labelKey: "nav.items.services.ssh",
    classic: "/services/ssh",
    roles: ADMIN,
  },
  {
    group: "usermgmt",
    item: "settings",
    labelKey: "nav.items.usermgmt.settings",
    classic: "/usermgmt/settings",
    roles: ADMIN,
  },
  {
    group: "usermgmt",
    item: "users",
    labelKey: "nav.items.usermgmt.users",
    classic: "/usermgmt/users",
    roles: ADMIN,
  },
  {
    group: "usermgmt",
    item: "groups",
    labelKey: "nav.items.usermgmt.groups",
    classic: "/usermgmt/groups",
    roles: ADMIN,
  },
  {
    group: "diagnostics",
    item: "system-information",
    labelKey: "nav.items.diagnostics.system-information",
    classic: "/diagnostics/system-information",
    roles: ADMIN,
  },
  {
    group: "diagnostics",
    item: "system-logs",
    labelKey: "nav.items.diagnostics.system-logs",
    classic: "/diagnostics/system-logs",
    roles: ADMIN,
  },
  {
    group: "diagnostics",
    item: "processes",
    labelKey: "nav.items.diagnostics.processes",
    classic: "/diagnostics/processes",
    roles: ADMIN,
  },
  {
    group: "diagnostics",
    item: "services",
    labelKey: "nav.items.diagnostics.services",
    classic: "/diagnostics/services",
    roles: ADMIN,
  },
  {
    group: "diagnostics",
    item: "performance-statistics",
    labelKey: "nav.items.diagnostics.performance-statistics",
    classic: "/diagnostics/performance-statistics",
    roles: ADMIN,
  },
  {
    group: "diagnostics",
    item: "report",
    labelKey: "nav.items.diagnostics.report",
    classic: "/diagnostics/report",
    roles: ADMIN,
  },
  {
    group: "account",
    item: "settings",
    labelKey: "nav.items.account.settings",
    classic: "/account/settings",
    roles: USER,
  },
  {
    group: "account",
    item: "password",
    labelKey: "nav.items.account.password",
    classic: "/account/password",
    roles: EVERYONE,
  },
] as const satisfies readonly NavPage[];

export type NavPageEntry = (typeof NAV_PAGES)[number];

const isNavGroup = (value: string): value is NavGroup =>
  (NAV_GROUPS as readonly string[]).includes(value);

/** The page a path's two segments select, or undefined: a URL only ever selects one of these. */
export function findNavPage(
  group: string,
  item: string,
): NavPageEntry | undefined {
  if (!isNavGroup(group)) {
    return undefined;
  }
  return NAV_PAGES.find((p) => p.group === group && p.item === item);
}

export const mayOpen = (page: NavPage, role: Role): boolean =>
  page.roles.includes(role);

/** The groups and their items a role sees, in order; empty groups are left out. */
export function navFor(
  role: Role,
): { group: NavGroup; pages: NavPageEntry[] }[] {
  return NAV_GROUPS.map((group) => ({
    group,
    pages: NAV_PAGES.filter((p) => p.group === group && mayOpen(p, role)),
  })).filter((g) => g.pages.length > 0);
}

/** The classic interface's start page, and the page with its HTTPS setting (UI-12). */
export const CLASSIC_HOME = "/";
export const CLASSIC_HTTPS_SETTINGS = "/system/workbench/settings";
