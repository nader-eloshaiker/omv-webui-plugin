// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnostics > System logs (phase 5 design 2), for administrators: what the NAS has recorded. Reading
// only; downloading and clearing a log stay in the classic interface (owner). A normal user who types
// the address gets the "only administrators" page, and nothing is called first (UI-4).
import {
  ExternalLink,
  Page,
  PageHeader,
  PageSection,
} from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { CLASSIC } from "../../navigation/navigation.ts";
import { useSession } from "../../session/sessionContext.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { LogViewer } from "../organisms/LogViewer.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function SystemLogsPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("logs.title")} />;
  }
  return (
    <Page>
      <PageHeader title={<PageTitle>{t("logs.title")}</PageTitle>}>
        <p className="max-w-prose">{t("logs.intro")}</p>
      </PageHeader>
      <PageSection>
        <LogViewer />
      </PageSection>
      <footer className="flex flex-col gap-pair text-sm">
        <p>
          {t("logs.classicNote")}{" "}
          <ExternalLink href={CLASSIC.systemLogs} newTabLabel={t("app.newTab")}>
            {t("logs.classicLink")}
          </ExternalLink>
        </p>
        <p>
          {t("logs.remoteNote")}{" "}
          <ExternalLink
            href={CLASSIC.remoteLogging}
            newTabLabel={t("app.newTab")}
          >
            {t("logs.remoteLink")}
          </ExternalLink>
        </p>
      </footer>
    </Page>
  );
}
