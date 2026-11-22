// SPDX-License-Identifier: GPL-3.0-or-later
// Users > Groups (phase 5 users design 8), for administrators: which groups are there, who is in each,
// and what can each open? Leads to a group's page and to adding a group. A normal user who types the
// address gets the "only administrators" page, and nothing is called first (UI-4).
import { ExternalLink } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { CLASSIC } from "../../navigation/navigation.ts";
import { useSession } from "../../session/sessionContext.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { GroupsTable } from "../organisms/GroupsTable.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function GroupsPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("groups.title")} />;
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageTitle>{t("groups.title")}</PageTitle>
      <div className="flex max-w-prose flex-col gap-1">
        <p>{t("shares.term.group")}</p>
        <p>{t("groups.intro")}</p>
      </div>
      <GroupsTable />
      <p className="text-sm text-muted-foreground">
        {t("groups.footer")}{" "}
        <ExternalLink href={CLASSIC.groups} newTabLabel={t("app.newTab")}>
          {t("groups.classicLink")}
        </ExternalLink>
      </p>
    </div>
  );
}
