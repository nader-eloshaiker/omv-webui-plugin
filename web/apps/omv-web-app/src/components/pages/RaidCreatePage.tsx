// SPDX-License-Identifier: GPL-3.0-or-later
// Create a RAID array (phase 5 RAID design 3; UX audit R1 to R10), for administrators. Opening it only
// reads (R9). While anything is pending the flow does not start (R1, Q2). A run of this session, under
// way or ended and not dismissed, is shown instead of the form: one RAID run at a time. A normal user
// gets the "only administrators" page, and nothing is called first (UI-4).
import {
  BreadcrumbItem,
  Breadcrumbs,
  JobRunner,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useArraysRead } from "../../hooks/useRaidView.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { raidFlowStore } from "../../raid/raidRun.ts";
import { useSession } from "../../session/sessionContext.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { RaidNotInstalled } from "../molecules/RaidNotInstalled.tsx";
import { FlowPreflight } from "../organisms/FlowPreflight.tsx";
import { RaidCreateDecisions } from "../organisms/RaidCreateDecisions.tsx";
import { RaidRunView } from "../organisms/RaidRunView.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";
import { OtherRaidRun } from "./RaidAddPage.tsx";

export function RaidCreatePage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("raid.title")} />;
  }
  return <RaidCreate />;
}

function RaidCreate() {
  const { t } = useTranslation();
  const info = useSystemInformation();
  const { missing } = useArraysRead();
  const { run } = useMemoryStore(raidFlowStore);
  const pending = pendingModules(info.data?.dirtyModules);

  let content;
  if (missing) {
    content = <RaidNotInstalled />;
  } else if (run !== null && run.choices.kind === "create") {
    content = <RaidRunView run={run} />;
  } else if (run !== null) {
    content = <OtherRaidRun run={run} />;
  } else if (info.data === undefined) {
    content = (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("addStorage.loading")}
      </p>
    );
  } else if (pending.length > 0 || info.data.configDirty === true) {
    content = (
      <FlowPreflight modules={pending} body={t("raidCreate.preflightBody")} />
    );
  } else {
    content = <RaidCreateDecisions />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Breadcrumbs aria-label={t("app.breadcrumb")}>
        <BreadcrumbItem render={<Link to="/storage/md" />}>
          {t("array.breadcrumb")}
        </BreadcrumbItem>
        <BreadcrumbItem current>{t("raidCreate.breadcrumb")}</BreadcrumbItem>
      </Breadcrumbs>
      <PageTitle documentTitle={t("raidCreate.documentTitle")}>
        {t("raid.title")}
      </PageTitle>
      <JobRunner title={t("raidCreate.title")}>{content}</JobRunner>
    </div>
  );
}
