// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a copy job" (phase 5 services design 5), for administrators. Opening it only reads (R9). While
// anything is pending the pre-flight says so (R1, Q2): the form is shown, but the summary's "Save"
// buttons are unavailable until nothing is pending. A run of this session, under way or ended and not
// dismissed, is shown instead of the form, so leaving the page does not lose it. A source chosen on a
// shared folder's page arrives through the session store, never the address. A normal user gets the
// "only administrators" page, and nothing is called first (UI-4).
import {
  BreadcrumbItem,
  Breadcrumbs,
  InlineAlert,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isolateName } from "../../format/isolate.ts";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useJobFormReads } from "../../hooks/useJobFormReads.ts";
import { useJobsApi } from "../../hooks/useJobsApi.ts";
import { useJobWords } from "../../hooks/useJobWords.ts";
import { useSharesSystem } from "../../hooks/useSharesReads.ts";
import {
  jobFlowStore,
  startJobFlow,
  type JobFlowChoices,
} from "../../services/addJobFlow.ts";
import {
  asksPassword,
  newJobChoices,
  sidesOfChoices,
  type JobChoices,
} from "../../services/jobModel.ts";
import { clearHandover, handedOverSource } from "../../services/jobsSession.ts";
import { useSession } from "../../session/sessionContext.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { AddJobRun } from "../organisms/AddJobRun.tsx";
import { CopyJobForm } from "../organisms/CopyJobForm.tsx";
import { CopyJobSummary } from "../organisms/CopyJobSummary.tsx";
import { FlowPreflight } from "../organisms/FlowPreflight.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function AddCopyJobPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("rsync.title")} />;
  }
  return <AddCopyJob />;
}

function AddCopyJob() {
  const { t } = useTranslation();
  const system = useSharesSystem();
  const { run } = useMemoryStore(jobFlowStore);
  const reads = useJobFormReads();
  const words = useJobWords(reads.nasZone);
  const api = useJobsApi();
  const fsApi = useFsApi();
  const [initial] = useState(() => newJobChoices(handedOverSource()));
  useEffect(() => {
    clearHandover();
  }, []);
  const [draft, setDraft] = useState<JobChoices>(initial);
  // The password for another computer's rsync server, from the form to the start only.
  const [summary, setSummary] = useState<{
    choices: JobChoices;
    password: string;
  } | null>(null);
  const pending = system.pending;
  const blocked = pending === undefined || pending.length > 0;

  const nameOf = (choices: JobChoices) => {
    if (choices.comment.trim() !== "") {
      return choices.comment;
    }
    const sides = sidesOfChoices(choices);
    return sides === null
      ? t("addJob.title")
      : words.auto(
          words.sideText(sides.from, reads.folders),
          words.sideText(sides.to, reads.folders),
        );
  };

  const start = (kind: "try" | "on") => {
    if (summary === null || blocked) {
      return;
    }
    const flow: JobFlowChoices = {
      choices: summary.choices,
      name: nameOf(summary.choices),
    };
    const password = summary.password;
    setSummary(null);
    startJobFlow(
      { ...api, apply: fsApi.apply },
      {
        apply: t("addJob.task.apply", { job: isolateName(flow.name) }),
        trial: t("runJob.task.title", { job: isolateName(flow.name) }),
      },
      flow,
      kind,
      password,
    );
  };

  let content;
  if (run !== null) {
    content = (
      <AddJobRun run={run} folders={reads.folders} nasZone={reads.nasZone} />
    );
  } else if (summary !== null) {
    content = (
      <div className="flex flex-col gap-4">
        {blocked && pending !== undefined ? (
          <FlowPreflight modules={pending} body={t("addJob.preflightBody")} />
        ) : null}
        <CopyJobSummary
          choices={summary.choices}
          folders={reads.folders}
          keys={reads.keys}
          nasZone={reads.nasZone}
          hasPassword={summary.password !== ""}
          busy={blocked}
          onTry={() => start("try")}
          {...(summary.choices.deletes ? {} : { onTurnOn: () => start("on") })}
          onBack={() => {
            setDraft(summary.choices);
            setSummary(null);
          }}
        />
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col gap-4">
        {pending !== undefined && pending.length > 0 ? (
          <FlowPreflight modules={pending} body={t("addJob.preflightBody")} />
        ) : null}
        {system.failed ? (
          <InlineAlert tone="critical">{t("addJob.err.reads")}</InlineAlert>
        ) : null}
        <CopyJobForm
          key={JSON.stringify(draft.from) + JSON.stringify(draft.to)}
          heading={t("addJob.title")}
          initial={draft}
          reads={reads}
          submitLabel={() => t("addJob.review")}
          onSubmit={(choices, password) =>
            setSummary({
              choices,
              password: asksPassword(choices) ? password : "",
            })
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Breadcrumbs aria-label={t("app.breadcrumb")}>
        <BreadcrumbItem render={<Link to="/services/rsync" />}>
          {t("rsync.tab.jobs")}
        </BreadcrumbItem>
        <BreadcrumbItem current>{t("addJob.title")}</BreadcrumbItem>
      </Breadcrumbs>
      <PageTitle>{t("addJob.title")}</PageTitle>
      {content}
    </div>
  );
}
