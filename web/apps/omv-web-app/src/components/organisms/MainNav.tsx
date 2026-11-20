// SPDX-License-Identifier: GPL-3.0-or-later
// The groups of the side navigation for the session's role (navigation.ts), used beside the content
// from 1024px and in the drawer below it. Pages that exist only in the classic interface say so.
import type { Role } from "@omv-webui/react-api-omv/generated";
import { SideNavGroup, SideNavItem } from "@omv-webui/react-ui-components";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Puzzle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { navFor } from "../../navigation/navigation.ts";

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
      {navFor(role).map(({ group, pages }) => (
        <SideNavGroup key={group} label={t(`nav.groups.${group}`)}>
          {pages.map((page) => (
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
          ))}
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
