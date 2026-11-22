// SPDX-License-Identifier: GPL-3.0-or-later
// The groups of the side navigation for the session's role (navigation.ts), used beside the content
// from 1024px and in the drawer below it. Pages built here link to their own route; pages that exist
// only in the classic interface say so.
import type { Role } from "@omv-webui/react-api-omv/generated";
import { SideNavGroup, SideNavItem } from "@omv-webui/react-ui-components";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Puzzle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRaidPlugin } from "../../hooks/useRaidReads.ts";
import { useZfsPlugin } from "../../hooks/useZfsReads.ts";
import { builtRoute, isCurrent, navFor } from "../../navigation/navigation.ts";

export function MainNav({
  role,
  onNavigate,
}: {
  role: Role;
  /** Called when an item is followed (the drawer closes). */
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const classic = { label: t("nav.classic") };
  // The RAID item is shown only once the plugin is known to be installed (0.10); a normal user's shell
  // makes no RAID call (10).
  const raidPlugin = useRaidPlugin(role === "admin") === "installed";
  // The same for ZFS, by Zfs.listCompressionTypes, which runs no command (ZFS design 0.11, P14).
  const zfsPlugin = useZfsPlugin(role === "admin") === "installed";
  return (
    <>
      <ul className="flex flex-col gap-0.5">
        <SideNavItem
          icon={<LayoutDashboard />}
          current={pathname === "/"}
          render={<Link to="/" onClick={onNavigate} />}
        >
          {t("nav.dashboard")}
        </SideNavItem>
      </ul>
      {navFor(role, { raidPlugin, zfsPlugin }).map(({ group, pages }) => (
        <SideNavGroup key={group} label={t(`nav.groups.${group}`)}>
          {pages.map((page) => {
            const built = builtRoute(page);
            return built ? (
              <SideNavItem
                key={page.item}
                current={isCurrent(pathname, built)}
                render={<Link to={built} onClick={onNavigate} />}
              >
                {t(page.labelKey)}
              </SideNavItem>
            ) : (
              <SideNavItem
                key={page.item}
                classicOnly={classic}
                current={pathname === `/${page.group}/${page.item}`}
                render={
                  <Link
                    to="/$group/$item"
                    params={{ group: page.group, item: page.item }}
                    onClick={onNavigate}
                  />
                }
              >
                {t(page.labelKey)}
              </SideNavItem>
            );
          })}
        </SideNavGroup>
      ))}
      {role === "admin" ? (
        <ul className="flex flex-col gap-0.5">
          <SideNavItem
            icon={<Puzzle />}
            classicOnly={classic}
            current={pathname === "/add-ons"}
            render={<Link to="/add-ons" onClick={onNavigate} />}
          >
            {t("nav.addOns")}
          </SideNavItem>
        </ul>
      ) : null}
    </>
  );
}
