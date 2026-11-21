// SPDX-License-Identifier: GPL-3.0-or-later
// The frame of the three Disk health pages (phase 5 disks design 4.1): the title with the pending mark
// while the smartmontools module has saved changes, the intro, and the tabs, each its own static route
// (UI-4), as the service details are. No business logic.
import { PageTab, PageTabs } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSmartPending } from "../../hooks/useSmartPending.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";

export type SmartTab = "overview" | "selfTests" | "settings";
const TABS: readonly SmartTab[] = ["overview", "selfTests", "settings"];
const TAB_ROUTE = {
  overview: "/storage/smart/overview",
  selfTests: "/storage/smart/self-tests",
  settings: "/storage/smart/settings",
} as const;

export function SmartTabsFrame({
  tab,
  children,
}: {
  tab: SmartTab;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const pending = useSmartPending();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PageTitle
          documentTitle={t("smart.documentTitle", {
            tab: t(`smart.tab.${tab}`),
          })}
        >
          {t("smart.title")}
        </PageTitle>
        {pending ? <PendingMark /> : null}
      </div>
      <p className="max-w-prose">{t("smart.intro")}</p>
      <PageTabs aria-label={t("smart.tabs")}>
        {TABS.map((each) => (
          <PageTab
            key={each}
            current={each === tab}
            render={<Link to={TAB_ROUTE[each]} />}
          >
            {t(`smart.tab.${each}`)}
          </PageTab>
        ))}
      </PageTabs>
      {children}
    </div>
  );
}
