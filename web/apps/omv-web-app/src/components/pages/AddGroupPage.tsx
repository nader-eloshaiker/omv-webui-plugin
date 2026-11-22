// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a group" (phase 5 users design 10), for administrators. Opening it only reads (R9). While
// anything is pending the flow does not start (R1, Q2): a new group marks nothing, but the access it
// is given is applied at the end, and that apply must not carry anyone else's changes. A run of this
// session, under way or ended and not dismissed, is shown instead of the form, so leaving the page
// does not lose it. A normal user gets the "only administrators" page, and nothing is called first
// (UI-4).
import {
  BreadcrumbItem,
  Breadcrumbs,
  JobRunner,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { addGroupStore } from "../../groups/addGroupFlow.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { AddGroupDecisions } from "../organisms/AddGroupDecisions.tsx";
import { AddGroupRun } from "../organisms/AddGroupRun.tsx";
import { FlowPreflight } from "../organisms/FlowPreflight.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function AddGroupPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("groups.title")} />;
  }
  return <AddGroup />;
}

function AddGroup() {
  const { t } = useTranslation();
  const info = useSystemInformation("admin");
  const { run } = useMemoryStore(addGroupStore);
  const pending = pendingModules(info.data?.dirtyModules);

  let content;
  if (run !== null) {
    content = <AddGroupRun run={run} />;
  } else if (info.data === undefined) {
    content = (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("addGroup.loading")}
      </p>
    );
  } else if (pending.length > 0 || info.data.configDirty === true) {
    content = (
      <FlowPreflight modules={pending} body={t("addGroup.preflightBody")} />
    );
  } else {
    content = <AddGroupDecisions />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Breadcrumbs aria-label={t("app.breadcrumb")}>
        <BreadcrumbItem render={<Link to="/usermgmt/groups" />}>
          {t("groups.title")}
        </BreadcrumbItem>
        <BreadcrumbItem current>{t("addGroup.breadcrumb")}</BreadcrumbItem>
      </Breadcrumbs>
      <PageTitle documentTitle={t("addGroup.title")}>
        {t("groups.title")}
      </PageTitle>
      <JobRunner title={t("addGroup.title")}>{content}</JobRunner>
    </div>
  );
}
