// SPDX-License-Identifier: GPL-3.0-or-later
// The side navigation: OMV's own menu, as the stock interface groups and orders it (read from
// openmediavault's workbench/navigation.d/*.yaml, 8.6.x), so existing users find things. Each entry
// names its page in the classic interface as a literal path written here, never built from data or
// the URL (UI-3, UI-4). An entry's group and item are the two path segments of its route under /ui/,
// so a URL only selects which of these pages is shown.
//
// Roles, as the stock files set them: every group except Account is for administrators. Account has
// one item here, "Your account", for everyone: the stock "Settings" (normal users) and "Password"
// (everyone) are one page in this interface, and two items for one page would both be current
// (phase 3 design 6.1). A normal user sees the dashboard and Account. This is presentation only; the
// backend decides what is allowed.
//
// The classic interface routes by hash (its router's `useHash`), so each of its pages is at
// `/#/<group>/<item>`; a path without the hash reaches the stock 404 page.
//
// A page built in this interface names its own route in `route`: the menu then links there as to any
// in-app page. It keeps its `classic` path for anything that still links out. Items that installed
// plugins add are not listed: they exist only at run time, and the "Add-ons" entry sends the reader to
// the classic interface for them.
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
  /** The page in the classic interface: a literal path on this server, in the hash form (UI-3). */
  classic: `/#/${string}`;
  /** The page's own route in this interface, once it is built here. */
  route?: BuiltRoute;
  roles: readonly Role[];
}

/** The routes of the pages built in this interface, more specific than `/$group/$item`. */
export type BuiltRoute =
  "/services/ssh" | "/storage/shared-folders" | "/account/settings";

const ADMIN = ["admin"] as const satisfies readonly Role[];
const EVERYONE = ["admin", "user"] as const satisfies readonly Role[];

/** In the stock order: by group, then by each item's `position` (ties and unpositioned by name). */
export const NAV_PAGES = [
  {
    group: "system",
    item: "workbench",
    labelKey: "nav.items.system.workbench",
    classic: "/#/system/workbench",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "date-time",
    labelKey: "nav.items.system.date-time",
    classic: "/#/system/date-time",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "notification",
    labelKey: "nav.items.system.notification",
    classic: "/#/system/notification",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "powermgmt",
    labelKey: "nav.items.system.powermgmt",
    classic: "/#/system/powermgmt",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "monitoring",
    labelKey: "nav.items.system.monitoring",
    classic: "/#/system/monitoring",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "cron",
    labelKey: "nav.items.system.cron",
    classic: "/#/system/cron",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "certificate",
    labelKey: "nav.items.system.certificate",
    classic: "/#/system/certificate",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "updatemgmt",
    labelKey: "nav.items.system.updatemgmt",
    classic: "/#/system/updatemgmt",
    roles: ADMIN,
  },
  {
    group: "system",
    item: "plugins",
    labelKey: "nav.items.system.plugins",
    classic: "/#/system/plugins",
    roles: ADMIN,
  },
  {
    group: "network",
    item: "general",
    labelKey: "nav.items.network.general",
    classic: "/#/network/general",
    roles: ADMIN,
  },
  {
    group: "network",
    item: "interfaces",
    labelKey: "nav.items.network.interfaces",
    classic: "/#/network/interfaces",
    roles: ADMIN,
  },
  {
    group: "network",
    item: "proxy",
    labelKey: "nav.items.network.proxy",
    classic: "/#/network/proxy",
    roles: ADMIN,
  },
  {
    group: "network",
    item: "firewall",
    labelKey: "nav.items.network.firewall",
    classic: "/#/network/firewall",
    roles: ADMIN,
  },
  {
    group: "storage",
    item: "disks",
    labelKey: "nav.items.storage.disks",
    classic: "/#/storage/disks",
    roles: ADMIN,
  },
  {
    group: "storage",
    item: "smart",
    labelKey: "nav.items.storage.smart",
    classic: "/#/storage/smart",
    roles: ADMIN,
  },
  {
    group: "storage",
    item: "filesystems",
    labelKey: "nav.items.storage.filesystems",
    classic: "/#/storage/filesystems",
    roles: ADMIN,
  },
  {
    group: "storage",
    item: "shared-folders",
    labelKey: "nav.items.storage.shared-folders",
    classic: "/#/storage/shared-folders",
    route: "/storage/shared-folders",
    roles: ADMIN,
  },
  {
    group: "services",
    item: "nfs",
    labelKey: "nav.items.services.nfs",
    classic: "/#/services/nfs",
    roles: ADMIN,
  },
  {
    group: "services",
    item: "rsync",
    labelKey: "nav.items.services.rsync",
    classic: "/#/services/rsync",
    roles: ADMIN,
  },
  {
    group: "services",
    item: "smb",
    labelKey: "nav.items.services.smb",
    classic: "/#/services/smb",
    roles: ADMIN,
  },
  {
    group: "services",
    item: "ssh",
    labelKey: "nav.items.services.ssh",
    classic: "/#/services/ssh",
    route: "/services/ssh",
    roles: ADMIN,
  },
  {
    group: "usermgmt",
    item: "settings",
    labelKey: "nav.items.usermgmt.settings",
    classic: "/#/usermgmt/settings",
    roles: ADMIN,
  },
  {
    group: "usermgmt",
    item: "users",
    labelKey: "nav.items.usermgmt.users",
    classic: "/#/usermgmt/users",
    roles: ADMIN,
  },
  {
    group: "usermgmt",
    item: "groups",
    labelKey: "nav.items.usermgmt.groups",
    classic: "/#/usermgmt/groups",
    roles: ADMIN,
  },
  {
    group: "diagnostics",
    item: "system-information",
    labelKey: "nav.items.diagnostics.system-information",
    classic: "/#/diagnostics/system-information",
    roles: ADMIN,
  },
  {
    group: "diagnostics",
    item: "system-logs",
    labelKey: "nav.items.diagnostics.system-logs",
    classic: "/#/diagnostics/system-logs",
    roles: ADMIN,
  },
  {
    group: "diagnostics",
    item: "processes",
    labelKey: "nav.items.diagnostics.processes",
    classic: "/#/diagnostics/processes",
    roles: ADMIN,
  },
  {
    group: "diagnostics",
    item: "services",
    labelKey: "nav.items.diagnostics.services",
    classic: "/#/diagnostics/services",
    roles: ADMIN,
  },
  {
    group: "diagnostics",
    item: "performance-statistics",
    labelKey: "nav.items.diagnostics.performance-statistics",
    classic: "/#/diagnostics/performance-statistics",
    roles: ADMIN,
  },
  {
    group: "diagnostics",
    item: "report",
    labelKey: "nav.items.diagnostics.report",
    classic: "/#/diagnostics/report",
    roles: ADMIN,
  },
  {
    group: "account",
    item: "settings",
    labelKey: "nav.items.account.settings",
    classic: "/#/account/settings",
    route: "/account/settings",
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

/** The entry's own route, when the page is built in this interface. */
export const builtRoute = (page: NavPage): BuiltRoute | undefined => page.route;

/**
 * Whether the menu entry for `route` is the current page. `/account/password` is a second address of
 * the account page (the set-up checklist and stock users know it), so it marks "Your account".
 */
export function isCurrent(pathname: string, route: BuiltRoute): boolean {
  return (
    pathname === route ||
    (route === "/account/settings" && pathname === "/account/password")
  );
}

/** The groups and their items a role sees, in order; empty groups are left out. */
export function navFor(
  role: Role,
): { group: NavGroup; pages: NavPageEntry[] }[] {
  return NAV_GROUPS.map((group) => ({
    group,
    pages: NAV_PAGES.filter((p) => p.group === group && mayOpen(p, role)),
  })).filter((g) => g.pages.length > 0);
}

/** The classic interface's start page. */
export const CLASSIC_HOME = "/";
/** The page with OMV's HTTPS setting (UI-12). */
export const CLASSIC_HTTPS_SETTINGS = "/#/system/workbench/settings";

/** Other pages of the classic interface the new pages link to: literal paths, in the hash form. */
export const CLASSIC = {
  systemInformation: "/#/diagnostics/system-information",
  updates: "/#/system/updatemgmt/updates",
  dateTime: "/#/system/date-time",
  notifications: "/#/system/notification/settings",
  networkGeneral: "/#/network/general",
  addSharedFolder: "/#/storage/shared-folders/create",
  users: "/#/usermgmt/users",
} as const satisfies Record<string, `/#/${string}`>;
