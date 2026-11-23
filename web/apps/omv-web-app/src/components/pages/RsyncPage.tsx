// SPDX-License-Identifier: GPL-3.0-or-later
// Services > Rsync (phase 5 services design 3 and 9): the page title "Rsync" and its two tabs, Copy
// jobs (/services/rsync) and Rsync server (/services/rsync/server), each its own static route (UI-4),
// as the disk health pages are. The tab's content is the caller's. Every method behind either tab is
// administrator-only, so a normal user who types the address gets the "only administrators" page and
// the tab's content is never mounted: nothing is called first (13.1).
import { PageTab, PageTabs } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "../../session/sessionContext.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export type RsyncTab = "jobs" | "server";
const TABS: readonly RsyncTab[] = ["jobs", "server"];
const TAB_ROUTE = {
  jobs: "/services/rsync",
  server: "/services/rsync/server",
} as const;

export function RsyncPage({
  tab,
  children,
}: {
  tab: RsyncTab;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("rsync.title")} />;
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageTitle
        documentTitle={t("rsync.documentTitle", {
          tab: t(`rsync.tab.${tab}`),
        })}
      >
        {t("rsync.title")}
      </PageTitle>
      <PageTabs aria-label={t("rsync.tabs")}>
        {TABS.map((each) => (
          <PageTab
            key={each}
            current={each === tab}
            render={<Link to={TAB_ROUTE[each]} />}
          >
            {t(`rsync.tab.${each}`)}
          </PageTab>
        ))}
      </PageTabs>
      {children}
    </div>
  );
}
