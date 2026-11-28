// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disk health > Set up monitoring (phase 5 disks design 7), UX-audit Flow D, for
// administrators. No menu item: reached from the Overview, the Self-tests page and the dashboard's
// Disk health card. Opening it only reads (R9); a normal user gets the "only administrators" page
// and nothing is called first (UI-4).
import {
  BreadcrumbItem,
  Breadcrumbs,
  Page,
  PageHeader,
  PageSection,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSmartPending } from "../../hooks/useSmartPending.ts";
import { useSession } from "../../session/sessionContext.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { SetUpFlow } from "../organisms/SetUpFlow.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function SmartSetUpPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("smart.title")} />;
  }
  return <SetUp />;
}

function SetUp() {
  const { t } = useTranslation();
  const pending = useSmartPending();
  return (
    <Page>
      <PageHeader
        before={
          <Breadcrumbs aria-label={t("app.breadcrumb")}>
            <BreadcrumbItem render={<Link to="/storage/smart/overview" />}>
              {t("smart.title")}
            </BreadcrumbItem>
            <BreadcrumbItem current>
              {t("smart.setup.breadcrumb")}
            </BreadcrumbItem>
          </Breadcrumbs>
        }
        title={
          <PageTitle documentTitle={t("smart.setup.documentTitle")}>
            {t("smart.title")}
          </PageTitle>
        }
        besideTitle={pending ? <PendingMark /> : undefined}
      >
        <p className="max-w-prose">{t("smart.intro")}</p>
      </PageHeader>
      <PageSection>
        <SetUpFlow />
      </PageSection>
    </Page>
  );
}
