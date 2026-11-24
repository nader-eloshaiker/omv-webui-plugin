// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a person" (phase 5 users design 6, Flow B), for administrators. Opening it only reads (R9).
// While anything is pending the flow does not start (R1, Q2). A run of this session, under way or ended
// and not dismissed, is shown instead of the form, so leaving the page does not lose it. A normal user
// gets the "only administrators" page, and nothing is called first (UI-4).
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
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { addPersonStore } from "../../users/addPersonFlow.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { AddPersonDecisions } from "../organisms/AddPersonDecisions.tsx";
import { AddPersonRun } from "../organisms/AddPersonRun.tsx";
import { FlowPreflight } from "../organisms/FlowPreflight.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function AddPersonPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("users.title")} />;
  }
  return <AddPerson />;
}

function AddPerson() {
  const { t } = useTranslation();
  const info = useSystemInformation();
  const { run } = useMemoryStore(addPersonStore);
  const pending = pendingModules(info.data?.dirtyModules);

  let content;
  if (run !== null) {
    content = <AddPersonRun run={run} />;
  } else if (info.data === undefined) {
    content = (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("addPerson.loading")}
      </p>
    );
  } else if (pending.length > 0 || info.data.configDirty === true) {
    content = (
      <FlowPreflight modules={pending} body={t("addPerson.preflightBody")} />
    );
  } else {
    content = <AddPersonDecisions />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Breadcrumbs aria-label={t("app.breadcrumb")}>
        <BreadcrumbItem render={<Link to="/usermgmt/users" />}>
          {t("users.title")}
        </BreadcrumbItem>
        <BreadcrumbItem current>{t("addPerson.breadcrumb")}</BreadcrumbItem>
      </Breadcrumbs>
      <PageTitle documentTitle={t("addPerson.title")}>
        {t("users.title")}
      </PageTitle>
      <JobRunner title={t("addPerson.title")}>{content}</JobRunner>
    </div>
  );
}
