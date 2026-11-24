// SPDX-License-Identifier: GPL-3.0-or-later
// The side navigation for the session's role (navigation.ts; foundation 10): the dashboard, then OMV's
// groups as folding groups, the current page's group open and the others folded, then Add-ons. Used
// beside the content from 1024px and in the drawer below it. Pages built here link to their own
// route; pages that exist only in the classic interface stay listed, quieter, and say so.
import type { Role } from "@omv-webui/react-api-omv/generated";
import {
  SideNavGroup,
  SideNavItem,
  SideNavList,
} from "@omv-webui/react-ui-components";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Cpu,
  HardDrive,
  LayoutDashboard,
  Network,
  Puzzle,
  Share2,
  UserRound,
  Users,
} from "lucide-react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { useNavGroups } from "../../hooks/useNavGroups.ts";
import {
  builtRoute,
  isCurrent,
  isCurrentPage,
  type NavGroup,
} from "../../navigation/navigation.ts";

/** Each group's icon: decorative, the group's name says what it is. */
const GROUP_ICONS: Record<NavGroup, ReactElement> = {
  system: <Cpu />,
  network: <Network />,
  storage: <HardDrive />,
  services: <Share2 />,
  usermgmt: <Users />,
  diagnostics: <Activity />,
  account: <UserRound />,
};

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
  const groups = useNavGroups(role);
  return (
    <>
      <SideNavList className="mb-1">
        <SideNavItem
          icon={<LayoutDashboard />}
          current={pathname === "/"}
          render={<Link to="/" onClick={onNavigate} />}
        >
          {t("nav.dashboard")}
        </SideNavItem>
      </SideNavList>
      {groups.map(({ group, pages }) => (
        <SideNavGroup
          key={group}
          label={t(`nav.groups.${group}`)}
          icon={GROUP_ICONS[group]}
          current={pages.some((page) => isCurrentPage(pathname, page))}
          // A role that sees one group (a normal user: Account) finds it open.
          defaultOpen={groups.length === 1}
        >
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
        <SideNavList className="mt-1">
          <SideNavItem
            icon={<Puzzle />}
            classicOnly={classic}
            current={pathname === "/add-ons"}
            render={<Link to="/add-ons" onClick={onNavigate} />}
          >
            {t("nav.addOns")}
          </SideNavItem>
        </SideNavList>
      ) : null}
    </>
  );
}
