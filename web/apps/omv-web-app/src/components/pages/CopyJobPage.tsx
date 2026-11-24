// SPDX-License-Identifier: GPL-3.0-or-later
// A copy job's page (phase 5 services design 4, 6, 7, 8): its direction sentence, what to do now, its
// summary, Run now with its task, Change in place, and Delete. Addressed by the job's UUID (D3), which
// the route checks before anything is read; the page then reads Rsync.get (its password replaced by
// whether one is set, 0.8) and the jobs list, and a UUID the list does not hold is "no longer
// exists". Opening it only reads (UI-4); every action follows the reader's own press.
//
// A change that touches only the schedule, "only when I start it", email or the note is a save to
// the band, read-modify-write (0.11). A change of its sides, direction or turning deletion on goes
// through the add flow's summary and trial (section 6), applying its own changes.
import type {
  RsyncJob,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import {
  getRsyncGetListQueryKey,
  getRsyncGetQueryKey,
  useRsyncSet,
} from "@omv-webui/react-api-omv/generated";
import { useTask } from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  CopyButton,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Identifier,
  InlineAlert,
  ServerMessage,
  Skeleton,
  useToast,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useJobFormReads } from "../../hooks/useJobFormReads.ts";
import { useJobsApi } from "../../hooks/useJobsApi.ts";
import { useRsyncJob, useRsyncJobs } from "../../hooks/useJobsReads.ts";
import { useJobWords } from "../../hooks/useJobWords.ts";
import { useSharesSystem } from "../../hooks/useSharesReads.ts";
import {
  jobFlowStore,
  startJobFlow,
  startTurnOn,
} from "../../services/addJobFlow.ts";
import {
  asksPassword,
  changeNeed,
  choicesFromJob,
  deletionOf,
  extraOptionFacts,
  jobRequest,
  otherOptionsSet,
  runBlock,
  sidesOf,
  trialKey,
  trialOnly,
  unreachableFolders,
  type JobChoices,
  type JobSides,
} from "../../services/jobModel.ts";
import {
  changeRequested,
  clearChangeRequest,
  jobPending,
  jobsSession,
  recordJobSaved,
} from "../../services/jobsSession.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { FolderLink } from "../atoms/FolderLink.tsx";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import {
  JobDirection,
  JobSentence,
  JobSideView,
  SlotText,
} from "../molecules/JobDirection.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import {
  AddJobRun,
  TurnOnDeleteDialog,
  TurnOnDialog,
} from "../organisms/AddJobRun.tsx";
import { CopyJobForm, type JobFormReads } from "../organisms/CopyJobForm.tsx";
import { CopyJobSummary } from "../organisms/CopyJobSummary.tsx";
import { DeleteJobDialog } from "../organisms/DeleteJobDialog.tsx";
import { FlowPreflight } from "../organisms/FlowPreflight.tsx";
import {
  JobTask,
  RunBlockReason,
  RunJobConfirm,
  type RunTarget,
} from "../organisms/RunJob.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function CopyJobRoutePage() {
  const { job } = useParams({ from: "/_signedIn/services/rsync/jobs/$job" });
  return <CopyJobPage address={job} />;
}

export function CopyJobPage({ address }: { address: string | null }) {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("rsync.title")} />;
  }
  return address === null ? <Gone /> : <JobView uuid={address} />;
}

function Crumbs({ name }: { name: string | null }) {
  const { t } = useTranslation();
  return (
    <Breadcrumbs aria-label={t("app.breadcrumb")}>
      <BreadcrumbItem render={<Link to="/services/rsync" />}>
        {t("rsync.tab.jobs")}
      </BreadcrumbItem>
      {name === null ? null : (
        <BreadcrumbItem current>
          <bdi dir="auto">{inertBidi(name)}</bdi>
        </BreadcrumbItem>
      )}
    </Breadcrumbs>
  );
}

function Gone() {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Crumbs name={null} />
      <PageTitle>{t("job.gone")}</PageTitle>
      <p>
        <Link to="/services/rsync" className={routerLinkClass}>
          {t("job.goneLink")}
        </Link>
      </p>
    </div>
  );
}

function JobView({ uuid }: { uuid: string }) {
  const { t } = useTranslation();
  const job = useRsyncJob(uuid, { focus: true });
  const list = useRsyncJobs();
  const reads = useJobFormReads();
  const system = useSharesSystem();
  const pending = system.pending;

  const listed = list.data?.data.some((j) => j.uuid === uuid);
  if (list.data !== undefined && listed === false && job.data === undefined) {
    return <Gone />;
  }
  if (job.data === undefined && job.isError) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <Crumbs name={null} />
        <PageTitle>{t("job.subtitle")}</PageTitle>
        <ReadFailed
          error={job.error}
          onRetry={() => void job.refetch()}
          retrying={job.isFetching}
        >
          {t("job.loadFailed")}
        </ReadFailed>
      </div>
    );
  }
  if (job.data === undefined) {
    return (
      <div
        role="status"
        aria-busy="true"
        className="flex min-w-0 flex-col gap-4"
      >
        <span className="sr-only">{t("job.loading")}</span>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return <JobLoaded job={job.data} reads={reads} pending={pending} />;
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-start gap-1">
      <TriangleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <span>{children}</span>
    </span>
  );
}

function JobLoaded({
  job,
  reads,
  pending,
}: {
  job: RsyncJob;
  reads: JobFormReads;
  pending: readonly string[] | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const words = useJobWords(reads.nasZone);
  const memory = useMemoryStore(jobsSession);
  const { run } = useMemoryStore(jobFlowStore);
  const api = useJobsApi();
  const fsApi = useFsApi();
  const save = useRsyncSet();
  const queryClient = useQueryClient();
  const folders = reads.folders;
  const name = words.name(job, folders);
  const sides = sidesOf(job);
  const deletion = deletionOf(job);
  const extra = extraOptionFacts(job.extraoptions);
  const trial = trialOnly(job);
  const marked = pending !== undefined && jobPending(memory, job.uuid, pending);
  const runTaskId = memory.runs[job.uuid];
  const { task } = useTask(runTaskId);
  const running = task?.state === "running";
  const unreachable =
    sides === null
      ? undefined
      : unreachableFolders(sides, folders, reads.fileSystems);
  const block = runBlock({
    pending,
    runningTask: running ? task.id : undefined,
    unreachable,
  });
  const ownRun =
    run !== null && (run.uuid === job.uuid || run.flow.base?.uuid === job.uuid)
      ? run
      : null;

  const [changing, setChanging] = useState(() => changeRequested(job.uuid));
  useEffect(() => {
    clearChangeRequest();
  }, []);
  const [summary, setSummary] = useState<{
    choices: JobChoices;
    password: string;
  } | null>(null);
  // The form's choices kept while the summary is shown, for "Back" (5.5: every choice kept).
  const [draft, setDraft] = useState<JobChoices | null>(null);
  const [readError, setReadError] = useState<unknown>(null);
  const [runTarget, setRunTarget] = useState<RunTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [turningOn, setTurningOn] = useState(false);
  const [focusTask, setFocusTask] = useState(false);
  const changeRef = useRef<HTMLButtonElement>(null);
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (changing) {
      formHeadingRef.current?.focus();
    }
  }, [changing]);

  const before = choicesFromJob(job);
  const target: RunTarget | null =
    sides === null
      ? null
      : {
          uuid: job.uuid,
          name,
          sides,
          trialOnly: trial,
          deletes: deletion !== "no",
          trialKey: trialKey(job),
        };
  const seen = memory.trials[job.uuid];
  const triedNow = seen !== undefined && seen.key === trialKey(job);
  const onSchedule = memory.intended[job.uuid] ?? true;
  const labels = {
    apply: t("addJob.task.apply", { job: isolateName(name) }),
    trial: t("runJob.task.title", { job: isolateName(name) }),
  };

  const saveOnly = (choices: JobChoices, password: string) => {
    save.reset();
    setReadError(null);
    void (async () => {
      let base: RsyncJob;
      try {
        // Read immediately before the write (R4): the job is written back as it is stored now.
        base = await api.job(job.uuid);
      } catch (error) {
        setReadError(error);
        return;
      }
      const request = jobRequest({
        uuid: base.uuid,
        choices,
        enable: choices.schedule.mode === "schedule" && !trialOnly(base),
        dryrun: base.optiondryrun === true,
        password,
        base,
      });
      if (request === null) {
        return;
      }
      save.mutate(
        { data: request },
        {
          onSuccess: () => {
            recordJobSaved(job.uuid);
            void queryClient.invalidateQueries({
              queryKey: getRsyncGetListQueryKey().slice(0, 2),
            });
            void queryClient.invalidateQueries({
              queryKey: getRsyncGetQueryKey({ uuid: job.uuid }),
            });
            toast.show({
              title: t("changeJob.saved", { job: isolateName(name) }),
            });
            setDraft(null);
            setChanging(false);
            requestAnimationFrame(() => changeRef.current?.focus());
          },
        },
      );
    })();
  };

  const onFormSubmit = (choices: JobChoices, password: string) => {
    if (before === null) {
      return;
    }
    const need = changeNeed(before, choices, job.extraoptions);
    if (need.need === "save") {
      saveOnly(choices, password);
    } else {
      setSummary({ choices, password: asksPassword(choices) ? password : "" });
      setChanging(false);
    }
  };

  const blocked = pending === undefined || pending.length > 0;
  const startChange = () => {
    if (summary === null || blocked) {
      return;
    }
    const { choices, password } = summary;
    setSummary(null);
    startJobFlow(
      { ...api, apply: fsApi.apply },
      labels,
      { choices, name, base: job },
      "try",
      password,
    );
  };

  const keyRow = reads.keys?.find((k) => k.uuid === job.sshcertificateref);
  const destName =
    sides === null
      ? ""
      : sides.to.kind === "folder"
        ? (folders?.find(
            (f) => sides.to.kind === "folder" && f.uuid === sides.to.uuid,
          )?.name ?? "")
        : before?.to.kind === "remote"
          ? before.to.remote.host
          : "";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Crumbs name={name} />
        <PageTitle documentTitle={t("app.documentTitleJob", { job: name })}>
          <bdi dir="auto">{inertBidi(name)}</bdi>
        </PageTitle>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {t("job.subtitle")}
          {marked ? <PendingMark /> : null}
        </p>
      </div>
      {sides === null ? (
        <p>{t("job.sentence.unknown")}</p>
      ) : (
        <JobDirection sides={sides} folders={folders} link />
      )}

      <NowSection
        trial={trial}
        notApplied={marked}
        unreachable={unreachable ?? []}
        folders={folders}
        canTurnOn={!(deletion !== "no" && !triedNow)}
        onTurnOn={() => setTurningOn(true)}
      />

      <FactList>
        <FactListItem>
          <FactListLabel>{t("job.fact.from")}</FactListLabel>
          <FactListValue>
            {sides === null ? null : (
              <JobSideView side={sides.from} folders={folders} link />
            )}
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("job.fact.to")}</FactListLabel>
          <FactListValue>
            {sides === null ? null : (
              <JobSideView side={sides.to} folders={folders} link />
            )}
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("job.fact.deletes")}</FactListLabel>
          <FactListValue>
            <DeletesValue sides={sides} folders={folders} deletion={deletion} />
            {extra.removesSource && sides !== null ? (
              <InlineAlert tone="neutral" icon="warning" className="mt-2">
                <Trans
                  i18nKey="job.removesSource"
                  components={{
                    src: <JobSideView side={sides.from} folders={folders} />,
                  }}
                />
              </InlineAlert>
            ) : null}
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("job.fact.when")}</FactListLabel>
          <FactListValue>
            <span className="flex flex-col gap-1">
              <span>{words.when(job)}</span>
              {words.whenNote(job) === null ? null : (
                <span className="text-sm text-muted-foreground">
                  {words.whenNote(job)}
                </span>
              )}
              {trial ? <Warn>{t("job.state.trialOnly")}</Warn> : null}
            </span>
          </FactListValue>
        </FactListItem>
        {job.type === "remote" ? (
          <FactListItem>
            <FactListLabel>{t("job.fact.signIn")}</FactListLabel>
            <FactListValue>
              {job.authentication === "pubkey" ? (
                keyRow === undefined ? (
                  t("job.signIn.keyUnread")
                ) : (
                  <span className="flex flex-col gap-1">
                    <span>
                      <Trans
                        i18nKey="job.signIn.key"
                        components={{
                          key: <FolderNameText value={keyRow.comment} />,
                        }}
                      />
                    </span>
                    <Disclosure>
                      <DisclosureTrigger>
                        {t("job.signIn.showKey")}
                      </DisclosureTrigger>
                      <DisclosurePanel>
                        <span className="flex items-start gap-1">
                          <Identifier className="break-all whitespace-pre-wrap">
                            {keyRow.publickey}
                          </Identifier>
                          <CopyButton
                            text={keyRow.publickey}
                            label={t("job.signIn.copyKey", {
                              key: inertBidi(keyRow.comment),
                            })}
                            copiedLabel={t("common.copied")}
                            selectedLabel={t("common.copySelected")}
                            size="icon-sm"
                          />
                        </span>
                      </DisclosurePanel>
                    </Disclosure>
                  </span>
                )
              ) : job.password === true ? (
                t("job.signIn.passwordSet")
              ) : job.password === false ? (
                t("job.signIn.none")
              ) : (
                t("job.signIn.passwordMaybe")
              )}
            </FactListValue>
          </FactListItem>
        ) : null}
        <FactListItem>
          <FactListLabel>{t("job.fact.email")}</FactListLabel>
          <FactListValue>
            {job.sendemail === true ? t("job.email.on") : t("job.email.off")}
            {job.sendemail === true && reads.emailSetUp === false ? (
              <span className="block text-sm text-muted-foreground">
                {t("job.email.notSetUp")}
              </span>
            ) : null}
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("job.fact.note")}</FactListLabel>
          <FactListValue>
            {(job.comment ?? "").trim() === "" ? (
              t("job.note.none")
            ) : (
              <bdi dir="auto">{inertBidi(job.comment ?? "")}</bdi>
            )}
          </FactListValue>
        </FactListItem>
        {otherOptionsSet(job) ? (
          <FactListItem>
            <FactListLabel>{t("job.fact.other")}</FactListLabel>
            <FactListValue>
              <span className="flex flex-col gap-1">
                <span>{t("job.other")}</span>
                {(job.extraoptions ?? "").trim() === "" ? null : (
                  <Identifier>{inertBidi(job.extraoptions ?? "")}</Identifier>
                )}
              </span>
            </FactListValue>
          </FactListItem>
        ) : null}
      </FactList>

      <section className="flex flex-col gap-3" aria-labelledby="job-run-title">
        <h2 id="job-run-title" className="text-lg font-semibold">
          {t("job.run.title")}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="neutral"
            disabled={block !== null || target === null}
            focusableWhenDisabled
            onClick={() => {
              if (block === null && target !== null) {
                setRunTarget(target);
              }
            }}
          >
            {t("jobs.action.run")}
          </Button>
          {block === null ? null : (
            <span className="text-sm text-muted-foreground">
              <RunBlockReason block={block} folders={folders} />
            </span>
          )}
        </div>
        {runTaskId === undefined ? null : (
          <JobTask
            taskId={runTaskId}
            name={name}
            focusOnMount={focusTask}
            onRunAgain={
              target === null ? undefined : () => setRunTarget(target)
            }
          />
        )}
        <p className="text-sm text-muted-foreground">
          {t("jobs.lastRunUnknown")}{" "}
          <Link to="/diagnostics/system-logs" className={routerLinkClass}>
            {t("jobs.logLink")}
          </Link>
        </p>
      </section>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="job-change-title"
      >
        <h2
          id="job-change-title"
          ref={formHeadingRef}
          tabIndex={-1}
          className="text-lg font-semibold outline-hidden"
        >
          {t("job.change.title")}
        </h2>
        {ownRun !== null ? (
          <AddJobRun run={ownRun} folders={folders} nasZone={reads.nasZone} />
        ) : summary !== null ? (
          <div className="flex flex-col gap-3">
            <p>{t("changeJob.retrial")}</p>
            {blocked && pending !== undefined ? (
              <FlowPreflight
                modules={pending}
                body={t("addJob.preflightBody")}
              />
            ) : null}
            <CopyJobSummary
              choices={summary.choices}
              folders={folders}
              keys={reads.keys}
              nasZone={reads.nasZone}
              hasPassword={summary.password !== ""}
              busy={blocked}
              onTry={startChange}
              onBack={() => {
                setDraft(summary.choices);
                setSummary(null);
                setChanging(true);
              }}
            />
          </div>
        ) : changing && before !== null ? (
          <CopyJobForm
            heading={t("changeJob.title")}
            initial={draft ?? before}
            reads={reads}
            passwordStored={job.password === true}
            busy={save.isPending}
            checkFolders={(choices) => ({
              from:
                JSON.stringify(choices.from) !== JSON.stringify(before.from),
              to: JSON.stringify(choices.to) !== JSON.stringify(before.to),
            })}
            submitLabel={(choices) =>
              changeNeed(before, choices, job.extraoptions).need === "save"
                ? t("changeJob.save")
                : t("changeJob.review")
            }
            notes={(choices) => {
              const need = changeNeed(before, choices, job.extraoptions);
              return (
                <div className="flex flex-col gap-1 text-sm">
                  {need.need === "trial" ? (
                    <p>{t("changeJob.retrial")}</p>
                  ) : null}
                  {need.deletionOff ? (
                    <p>{t("changeJob.deletedStay")}</p>
                  ) : null}
                  {need.extraStillDeletes ||
                  (!choices.deletes && extra.deletes) ? (
                    <p>{t("changeJob.extraStillDeletes")}</p>
                  ) : null}
                </div>
              );
            }}
            error={
              (save.error ?? readError) ? (
                <InlineAlert tone="critical" title={t("changeJob.failed")}>
                  {isRpcError(save.error ?? readError) ? (
                    <ServerMessage label={t("app.serverMessage")}>
                      {(save.error ?? (readError as Error)).message}
                    </ServerMessage>
                  ) : null}
                </InlineAlert>
              ) : null
            }
            onSubmit={onFormSubmit}
            onCancel={() => {
              setDraft(null);
              setChanging(false);
              save.reset();
              requestAnimationFrame(() => changeRef.current?.focus());
            }}
          />
        ) : (
          <div>
            <Button
              ref={changeRef}
              variant="neutral"
              onClick={() => setChanging(true)}
              disabled={before === null}
            >
              {t("jobs.action.change")}
            </Button>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="neutral"
            disabled={running}
            focusableWhenDisabled
            onClick={() => {
              if (!running) {
                setDeleting(true);
              }
            }}
          >
            {t("job.delete.button")}
          </Button>
          {running ? (
            <span className="text-sm text-muted-foreground">
              {t("deleteJob.running")}
            </span>
          ) : null}
        </div>
      </div>

      <RunJobConfirm
        target={runTarget}
        folders={folders}
        onClose={() => setRunTarget(null)}
        onStarted={() => setFocusTask(true)}
      />
      <DeleteJobDialog
        target={deleting ? { uuid: job.uuid, name, sides } : null}
        folders={folders}
        onClose={() => setDeleting(false)}
        onDeleted={() => void navigate({ to: "/services/rsync" })}
      />
      {sides === null ? null : deletion !== "no" ? (
        <TurnOnDeleteDialog
          open={turningOn}
          name={name}
          destName={destName}
          count={seen?.deleteCount ?? 0}
          src={<JobSideView side={sides.from} folders={folders} />}
          dest={<JobSideView side={sides.to} folders={folders} />}
          asksPassword={
            job.authentication === "password" && job.type === "remote"
          }
          onClose={() => setTurningOn(false)}
          onConfirm={(password) => {
            setTurningOn(false);
            startTurnOn({ ...api, apply: fsApi.apply }, labels, job, {
              name,
              onSchedule,
              tried: seen?.key ?? null,
              password: password ?? "",
            });
          }}
        />
      ) : (
        <TurnOnDialog
          open={turningOn}
          name={name}
          sentence={<JobSentence sides={sides} folders={folders} />}
          when={
            onSchedule
              ? words.when({ ...job, enable: true })
              : t("jobs.when.manual")
          }
          asksPassword={
            job.authentication === "password" && job.type === "remote"
          }
          onClose={() => setTurningOn(false)}
          onConfirm={(password) => {
            setTurningOn(false);
            startTurnOn({ ...api, apply: fsApi.apply }, labels, job, {
              name,
              onSchedule,
              tried: trialKey(job),
              password: password ?? "",
            });
          }}
        />
      )}
    </div>
  );
}

function DeletesValue({
  sides,
  folders,
  deletion,
}: {
  sides: JobSides | null;
  folders: readonly SharedFolder[] | undefined;
  deletion: "no" | "option" | "extra";
}) {
  const { t } = useTranslation();
  if (deletion === "no" || sides === null) {
    return <>{t("job.deletes.no")}</>;
  }
  const src = <JobSideView side={sides.from} folders={folders} />;
  const dest = <JobSideView side={sides.to} folders={folders} />;
  return (
    <Warn>
      <Trans
        i18nKey={
          deletion === "option" ? "job.deletes.yes" : "job.deletes.extra"
        }
        components={{ src, dest }}
      />
    </Warn>
  );
}

/** 4.2's "What to do now", only when there is something. */
function NowSection({
  trial,
  notApplied,
  unreachable,
  folders,
  canTurnOn,
  onTurnOn,
}: {
  trial: boolean;
  notApplied: boolean;
  unreachable: readonly string[];
  folders: readonly SharedFolder[] | undefined;
  canTurnOn: boolean;
  onTurnOn: () => void;
}) {
  const { t } = useTranslation();
  if (!trial && !notApplied && unreachable.length === 0) {
    return null;
  }
  return (
    <section
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4"
      aria-labelledby="job-now-title"
    >
      <h2 id="job-now-title" className="text-base font-semibold">
        {t("job.now.title")}
      </h2>
      {trial ? (
        <div className="flex flex-col gap-2">
          <p>{t("job.now.trialOnly")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={!canTurnOn || notApplied}
              focusableWhenDisabled
              onClick={() => {
                if (canTurnOn && !notApplied) {
                  onTurnOn();
                }
              }}
            >
              {t("job.now.turnOn")}
            </Button>
            {canTurnOn ? null : (
              <span className="text-sm text-muted-foreground">
                {t("job.turnOn.needsTrial")}
              </span>
            )}
          </div>
        </div>
      ) : null}
      {notApplied ? <p>{t("job.now.notApplied")}</p> : null}
      {unreachable.map((uuid) => {
        const folder = folders?.find((f) => f.uuid === uuid);
        return (
          <p key={uuid}>
            <Trans
              i18nKey="job.now.unreachable"
              components={{
                folder:
                  folder === undefined ? (
                    <SlotText value={t("job.folderGone")} />
                  ) : (
                    <FolderLink uuid={folder.uuid} name={folder.name} />
                  ),
              }}
            />
          </p>
        );
      })}
    </section>
  );
}
