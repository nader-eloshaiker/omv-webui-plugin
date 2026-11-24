// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a shared folder" (phase 5 shares design 6), for administrators. Opening it only reads (R9).
// While anything is pending the flow does not start (R1, Q2). A run of this session, under way or ended
// and not dismissed, is shown instead of the form, so leaving the page does not lose it. The file
// system Flow A handed over is in the session store (sharesSession), never in the address. A normal
// user gets the "only administrators" page, and nothing is called first (UI-4).
import {
  BreadcrumbItem,
  Breadcrumbs,
  JobRunner,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { addFlowStore } from "../../sharedFolders/addFlow.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { AddShareDecisions } from "../organisms/AddShareDecisions.tsx";
import { AddShareRun } from "../organisms/AddShareRun.tsx";
import { FlowPreflight } from "../organisms/FlowPreflight.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function AddSharedFolderPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("sharedFolders.title")} />;
  }
  return <AddSharedFolder />;
}

function AddSharedFolder() {
  const { t } = useTranslation();
  const info = useSystemInformation();
  const { run } = useMemoryStore(addFlowStore);
  const pending = pendingModules(info.data?.dirtyModules);

  let content;
  if (run !== null) {
    content = <AddShareRun run={run} />;
  } else if (info.data === undefined) {
    content = (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("addShare.loading")}
      </p>
    );
  } else if (pending.length > 0 || info.data.configDirty === true) {
    content = (
      <FlowPreflight modules={pending} body={t("addShare.preflightBody")} />
    );
  } else {
    content = <AddShareDecisions />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Breadcrumbs aria-label={t("app.breadcrumb")}>
        <BreadcrumbItem render={<Link to="/storage/shared-folders" />}>
          {t("sharedFolders.title")}
        </BreadcrumbItem>
        <BreadcrumbItem current>{t("addShare.breadcrumb")}</BreadcrumbItem>
      </Breadcrumbs>
      <PageTitle documentTitle={t("addShare.title")}>
        {t("sharedFolders.title")}
      </PageTitle>
      <JobRunner title={t("addShare.title")}>{content}</JobRunner>
    </div>
  );
}
