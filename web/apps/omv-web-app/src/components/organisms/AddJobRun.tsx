// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a copy job" as it runs (phase 5 services design 5.6 to 5.8): the step list with each state in
// words, the decision a failure needs (focus moved to it), the pause when other changes became
// pending (R10), the trial's result read from its output (5.7) with "Turn the job on…" and its
// confirmation (typed when the job deletes, UI-8), and the end. The run lives in memory for the
// session (addJobFlow.ts), so this view shows it again when the reader comes back. Nothing retries by
// itself (UI-14).
import type { SharedFolder } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  AlsoPendingNotice,
  AlsoPendingPrompt,
  Button,
  ConfirmDialog,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  JobFailure,
  JobResult,
  JobStepList,
  SecretField,
  StatusPill,
  TaskLog,
  TypeToConfirmDialog,
  type JobStep,
  type TaskStatus,
} from "@omv-webui/react-ui-components";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { useJobWords } from "../../hooks/useJobWords.ts";
import {
  clearJobFlow,
  jobFlowAction,
  turnOnAsksPassword,
  type JobFlowFailure,
  type JobFlowRun,
  type JobFlowStep,
} from "../../services/addJobFlow.ts";
import { remoteOf, sidesOfChoices } from "../../services/jobModel.ts";
import { scheduleFields } from "../../services/jobSchedule.ts";
import { requestChange } from "../../services/jobsSession.ts";
import {
  failureCauses,
  lastLines,
  LISTED_DELETES,
} from "../../services/trialOutput.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { JobSentence, JobSideView } from "../molecules/JobDirection.tsx";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { StepTask } from "../molecules/StepTask.tsx";
import { RunJobConfirm, type RunTarget } from "./RunJob.tsx";

const STATES: readonly TaskStatus[] = [
  "waiting",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export function AddJobRun({
  run,
  folders,
  nasZone,
}: {
  run: JobFlowRun;
  folders: readonly SharedFolder[] | undefined;
  nasZone: string | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const words = useJobWords(nasZone);
  const decisionRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [runTarget, setRunTarget] = useState<RunTarget | null>(null);
  const { phase, flow, busy } = run;
  const name = flow.name;
  const sides = sidesOfChoices(flow.choices);
  const deletes = flow.choices.deletes;

  useEffect(() => {
    if (
      phase.kind === "failed" ||
      phase.kind === "alsoPending" ||
      phase.kind === "trialDone"
    ) {
      decisionRef.current?.focus();
    }
  }, [phase.kind]);

  const stepLabel = (step: JobFlowStep) => t(`addJob.step.${step}`);
  const statusLabels = Object.fromEntries(
    STATES.map((s) => [s, t(`addStorage.state.${s}`)]),
  ) as Record<TaskStatus, string>;
  const steps: JobStep[] = run.steps.map((step) => {
    const state = run.state[step] ?? { status: "waiting" as const };
    return {
      id: step,
      label: stepLabel(step),
      status: state.status,
      detail:
        state.taskId === undefined ? undefined : (
          <StepTask
            taskId={state.taskId}
            label={stepLabel(step)}
            failed={state.status === "failed"}
          />
        ),
    };
  });

  const serverMessage = (error: unknown) =>
    isRpcError(error)
      ? { label: t("app.serverMessage"), text: error.message }
      : undefined;
  const destNode =
    sides === null ? null : <JobSideView side={sides.to} folders={folders} />;
  const srcNode =
    sides === null ? null : <JobSideView side={sides.from} folders={folders} />;
  const toForm = () => {
    if (run.uuid !== null) {
      requestChange(run.uuid);
      const uuid = run.uuid;
      clearJobFlow();
      void navigate({ to: "/services/rsync/jobs/$job", params: { job: uuid } });
    } else {
      clearJobFlow();
    }
  };
  const asksPassword = turnOnAsksPassword(run);
  const retryBusy = busy === "retry" ? ("retry" as const) : undefined;
  const [stepPassword, setStepPassword] = useState("");

  const failure = (f: JobFlowFailure): ReactNode => {
    switch (f.kind) {
      case "pending":
        return (
          <JobFailure
            title={
              <Trans
                i18nKey="addJob.fail.pending"
                components={{ list: <ModuleNames ids={f.modules} /> }}
              />
            }
            message={t("addJob.fail.pendingBody")}
            retryLabel={t("common.tryAgain")}
            onRetry={() => jobFlowAction({ kind: "retry" })}
            undo={{ label: t("addJob.fail.change"), onUndo: toForm }}
            busy={retryBusy}
          />
        );
      case "refused":
      case "keyGone":
        return (
          <JobFailure
            title={t(
              f.kind === "keyGone"
                ? "addJob.fail.keyGone"
                : "addJob.fail.refused",
            )}
            message={t("addJob.fail.nothingDone")}
            retryLabel={t("addJob.fail.change")}
            onRetry={toForm}
          />
        );
      case "checkRead":
        return (
          <JobFailure
            title={t("addJob.fail.checkRead")}
            message={t("addJob.fail.nothingDone")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("common.tryAgain")}
            onRetry={() => jobFlowAction({ kind: "retry" })}
            busy={retryBusy}
          />
        );
      case "notSaved":
        return (
          <div className="flex flex-col gap-2">
            <JobFailure
              title={t("addJob.fail.notSaved")}
              message={
                asksPassword
                  ? t("addJob.fail.passwordStep")
                  : t("addJob.fail.nothingDone")
              }
              serverMessage={serverMessage(f.error)}
              retryLabel={t("addJob.fail.tryStep")}
              onRetry={() => {
                const password = stepPassword;
                setStepPassword("");
                jobFlowAction({ kind: "retry", password });
              }}
              undo={{ label: t("addJob.fail.change"), onUndo: toForm }}
              busy={retryBusy}
            />
            {asksPassword ? (
              <SecretField
                label={t("addJob.password")}
                hint={t("addJob.passwordAgain")}
                revealLabel={t("password.show")}
                onChange={(event) => setStepPassword(event.target.value)}
              />
            ) : null}
          </div>
        );
      case "apply":
        return (
          <JobFailure
            title={t("addJob.fail.apply")}
            message={t("addJob.fail.applyBody")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addJob.fail.tryApply")}
            onRetry={() => jobFlowAction({ kind: "retry" })}
            busy={retryBusy}
          />
        );
      case "trialStart":
        return (
          <JobFailure
            title={t("addJob.fail.trialStart")}
            message={t("addJob.result.left")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addJob.trial.again")}
            onRetry={() => jobFlowAction({ kind: "retry" })}
            undo={{ label: t("addJob.trial.change"), onUndo: toForm }}
            busy={retryBusy}
          />
        );
      case "changed":
        return (
          <JobFailure
            title={t("addJob.turnOn.changed")}
            message={t("addJob.result.left")}
            retryLabel={t("addJob.trial.again")}
            onRetry={() => jobFlowAction({ kind: "retry" })}
            undo={{ label: t("addJob.trial.change"), onUndo: toForm }}
            busy={retryBusy}
          />
        );
      case "gone":
        return (
          <JobFailure
            title={t("addJob.fail.gone")}
            message={t("addJob.fail.nothingDone")}
            retryLabel={t("addJob.toList")}
            onRetry={() => {
              clearJobFlow();
              void navigate({ to: "/services/rsync" });
            }}
          />
        );
      case "unknown":
        return (
          <JobFailure
            title={t("addJob.fail.unknown")}
            message={t("addJob.fail.unknownBody")}
            retryLabel={t("addJob.toList")}
            onRetry={() => {
              clearJobFlow();
              void navigate({ to: "/services/rsync" });
            }}
          />
        );
    }
  };

  let decision: ReactNode = null;
  if (phase.kind === "failed") {
    decision = failure(phase.failure);
  } else if (phase.kind === "alsoPending") {
    decision = (
      <AlsoPendingPrompt
        title={t("addStorage.alsoTitle")}
        applyLabel={t("addStorage.applyToo")}
        stopLabel={t("addJob.fail.change")}
        onApply={() => jobFlowAction({ kind: "applyToo" })}
        onStop={toForm}
        busy={busy === "applyToo" ? "apply" : undefined}
      >
        <AlsoPendingNotice>
          <Trans
            i18nKey="addJob.alsoBody"
            components={{ list: <ModuleNames ids={phase.others} /> }}
          />
        </AlsoPendingNotice>
      </AlsoPendingPrompt>
    );
  } else if (phase.kind === "trialDone" && run.trial !== null) {
    decision = (
      <TrialResultView
        run={run}
        folders={folders}
        onTurnOn={() => setConfirming(true)}
        onChange={toForm}
      />
    );
  }

  const whenText =
    flow.choices.schedule.mode === "manual"
      ? t("jobs.when.manual")
      : words.when({ ...scheduleFields(flow.choices.schedule), enable: true });
  const destName =
    sides === null
      ? ""
      : sides.to.kind === "folder"
        ? (folders?.find(
            (f) => sides.to.kind === "folder" && f.uuid === sides.to.uuid,
          )?.name ?? "")
        : (remoteOf(flow.choices)?.host ?? "");

  let result;
  let links: ReactNode = null;
  if (phase.kind === "on" || phase.kind === "left") {
    result = {
      status:
        phase.kind === "on" ? ("succeeded" as const) : ("cancelled" as const),
      statusLabel: t(
        phase.kind === "on"
          ? "addStorage.state.succeeded"
          : "addStorage.state.cancelled",
      ),
      message:
        phase.kind === "left"
          ? t("addJob.result.left")
          : run.kind === "on"
            ? t("addJob.result.on")
            : t("addJob.turnedOn", { job: isolateName(name), when: whenText }),
    };
    links =
      run.uuid === null ? null : (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {phase.kind === "on" && sides !== null ? (
            <Button
              variant="neutral"
              onClick={() =>
                setRunTarget({
                  uuid: run.uuid ?? "",
                  name,
                  sides,
                  trialOnly: false,
                  deletes,
                  trialKey: null,
                })
              }
            >
              {t("addJob.runNow")}
            </Button>
          ) : null}
          <Link
            to="/services/rsync/jobs/$job"
            params={{ job: run.uuid }}
            className={routerLinkClass}
            onClick={() => clearJobFlow()}
          >
            {t("addJob.openJob")}
          </Link>
          <Link
            to="/services/rsync"
            className={routerLinkClass}
            onClick={() => clearJobFlow()}
          >
            {t("addJob.toList")}
          </Link>
        </p>
      );
  }

  const deleteCount = run.trial?.reading.deleteCount ?? 0;
  const turnOn = (password?: string) => {
    setConfirming(false);
    jobFlowAction({
      kind: "turnOn",
      ...(password === undefined ? {} : { password }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <JobStepList
        steps={steps}
        statusLabels={statusLabels}
        label={t("addJob.steps")}
      />
      {decision ? (
        <div ref={decisionRef} tabIndex={-1} className="outline-hidden">
          {decision}
        </div>
      ) : null}
      <JobResult
        result={result}
        dismissLabel={t("addJob.dismiss")}
        onDismiss={() => clearJobFlow()}
      />
      {links}
      {sides === null ? null : deletes ? (
        <TurnOnDeleteDialog
          open={confirming}
          name={name}
          destName={destName}
          count={deleteCount}
          src={srcNode}
          dest={destNode}
          asksPassword={asksPassword}
          onClose={() => setConfirming(false)}
          onConfirm={turnOn}
        />
      ) : (
        <TurnOnDialog
          open={confirming}
          name={name}
          sentence={<JobSentence sides={sides} folders={folders} />}
          when={whenText}
          asksPassword={asksPassword}
          onClose={() => setConfirming(false)}
          onConfirm={turnOn}
        />
      )}
      <RunJobConfirm
        target={runTarget}
        folders={folders}
        onClose={() => setRunTarget(null)}
      />
    </div>
  );
}

/** 5.7: what the trial says, and what to do next. */
function TrialResultView({
  run,
  folders,
  onTurnOn,
  onChange,
}: {
  run: JobFlowRun;
  folders: readonly SharedFolder[] | undefined;
  onTurnOn: () => void;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const trial = run.trial;
  if (trial === null) {
    return null;
  }
  const sides = sidesOfChoices(run.flow.choices);
  const dest =
    sides === null ? (
      <span />
    ) : (
      <JobSideView side={sides.to} folders={folders} />
    );
  const remote = remoteOf(run.flow.choices);
  const host = <IdentifierText value={inertBidi(remote?.host ?? "")} />;
  const { reading, lines } = trial;
  const ok = trial.outcome === "succeeded";
  const busy = run.busy !== null;
  const output = (
    <Disclosure>
      <DisclosureTrigger>{t("addJob.trial.showAll")}</DisclosureTrigger>
      <DisclosurePanel>
        <TaskLog
          lines={lines}
          label={t("addJob.trial.outputLabel", { job: run.flow.name })}
          copyLabel={t("tasks.copy")}
          copiedLabel={t("tasks.copied")}
          selectedLabel={t("tasks.selected")}
          download={{
            label: t("tasks.download"),
            fileName: t("runJob.task.file"),
          }}
          emptyLabel={t("tasks.noOutput")}
          follow={false}
          cap={{ lines: 10_000, label: () => t("runJob.task.cap") }}
        />
      </DisclosurePanel>
    </Disclosure>
  );
  if (!ok) {
    const causes = failureCauses(lines);
    const folderName =
      sides?.from.kind === "folder"
        ? (folders?.find(
            (f) => sides.from.kind === "folder" && f.uuid === sides.from.uuid,
          )?.name ?? "")
        : "";
    const silent = lines.length === 0;
    return (
      <section className="flex flex-col gap-3" aria-live="polite">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <StatusPill status="failed">
            {t("addStorage.state.failed")}
          </StatusPill>
          {t("addJob.trial.failed")}
        </p>
        {silent ? <p>{t("addJob.trial.failedSilent")}</p> : null}
        {lastLines(lines, 5).length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              {t("addJob.trial.lastLines")}
            </p>
            <pre className="rounded-control bg-muted p-2 font-mono text-sm break-words whitespace-pre-wrap">
              {lastLines(lines, 5).map(inertBidi).join("\n")}
            </pre>
          </div>
        ) : null}
        {causes.map((cause) => (
          <p key={cause}>
            <Trans
              i18nKey={`addJob.trial.${cause}`}
              components={{
                host,
                folder: <FolderNameText value={folderName} />,
              }}
            />
          </p>
        ))}
        {output}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => jobFlowAction({ kind: "trialAgain" })}
            loading={run.busy === "trialAgain"}
            disabled={busy}
          >
            {t("addJob.trial.again")}
          </Button>
          <Button variant="neutral" onClick={onChange} disabled={busy}>
            {t("addJob.trial.change")}
          </Button>
          <Button
            variant="neutral"
            onClick={() => jobFlowAction({ kind: "leave" })}
            disabled={busy}
          >
            {t("addJob.trial.leave")}
          </Button>
        </div>
      </section>
    );
  }
  const listed = reading.deletes.slice(0, LISTED_DELETES);
  return (
    <section className="flex flex-col gap-3" aria-live="polite">
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        <StatusPill status="succeeded">
          {t("addStorage.state.succeeded")}
        </StatusPill>
        {t("addJob.trial.ok")}
      </p>
      <p>
        {reading.exact
          ? t("addJob.trial.copies", { count: reading.copies })
          : t("addJob.trial.copiesAbout", { count: reading.copies })}
      </p>
      {run.flow.choices.deletes || reading.deletes.length > 0 ? (
        reading.deleteCount === 0 && reading.deletes.length === 0 ? (
          <p>
            <Trans i18nKey="addJob.trial.deletesNone" components={{ dest }} />
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <p>
              <Trans
                i18nKey="addJob.trial.deletes"
                count={reading.deleteCount}
                values={{ count: reading.deleteCount }}
                components={{ dest }}
              />
            </p>
            <p className="text-sm text-muted-foreground">
              {t("addJob.trial.deleteList")}
            </p>
            <ul className="flex flex-col gap-0.5 font-mono text-sm">
              {listed.map((path) => (
                <li key={path} dir="auto" className="break-all">
                  {inertBidi(path)}
                </li>
              ))}
            </ul>
            {reading.deletes.length > listed.length ? (
              <p className="text-sm text-muted-foreground">
                {t("addJob.trial.deleteListMore", {
                  count: reading.deletes.length - listed.length,
                })}
              </p>
            ) : null}
          </div>
        )
      ) : null}
      {output}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onTurnOn} disabled={busy}>
          {t("addJob.turnOn.button")}
        </Button>
        <Button variant="neutral" onClick={onChange} disabled={busy}>
          {t("addJob.trial.change")}
        </Button>
        <Button
          variant="neutral"
          onClick={() => jobFlowAction({ kind: "leave" })}
          disabled={busy}
        >
          {t("addJob.trial.leave")}
        </Button>
      </div>
    </section>
  );
}

/** The password typed again for the turn-on's save (0.8), held only while the dialog is open. */
function PasswordAgain({ onChange }: { onChange: (password: string) => void }) {
  const { t } = useTranslation();
  return (
    <SecretField
      label={t("addJob.password")}
      hint={t("addJob.passwordAgain")}
      revealLabel={t("password.show")}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** 5.7 without deletion: a plain confirmation. */
export function TurnOnDialog({
  open,
  name,
  sentence,
  when,
  asksPassword,
  onClose,
  onConfirm,
}: {
  open: boolean;
  name: string;
  sentence: ReactNode;
  when: string;
  asksPassword: boolean;
  onClose: () => void;
  onConfirm: (password?: string) => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const close = () => {
    setPassword("");
    onClose();
  };
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title={t("addJob.turnOn.title", { job: isolateName(name) })}
      description={
        <span className="flex flex-col gap-2">
          <span>{sentence}</span>
          <span>{t("addJob.summary.when", { when })}</span>
        </span>
      }
      confirmLabel={t("addJob.turnOn.confirm")}
      cancelLabel={t("addJob.cancel")}
      onConfirm={() => {
        const typed = password;
        setPassword("");
        onConfirm(asksPassword ? typed : undefined);
      }}
    >
      {asksPassword && open ? <PasswordAgain onChange={setPassword} /> : null}
    </ConfirmDialog>
  );
}

/** 5.7 with deletion: the destructive form, the destination's name typed (UI-8). */
export function TurnOnDeleteDialog({
  open,
  name,
  destName,
  count,
  src,
  dest,
  asksPassword,
  onClose,
  onConfirm,
}: {
  open: boolean;
  name: string;
  destName: string;
  count: number;
  src: ReactElement | null;
  dest: ReactElement | null;
  asksPassword: boolean;
  onClose: () => void;
  onConfirm: (password?: string) => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const close = () => {
    setPassword("");
    onClose();
  };
  return (
    <TypeToConfirmDialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title={t("addJob.turnOnDelete.title", {
        job: isolateName(name),
        dest: isolateName(destName),
      })}
      description={
        <Trans
          i18nKey="addJob.turnOnDelete.body"
          count={count}
          values={{ count }}
          components={{ src: src ?? <span />, dest: dest ?? <span /> }}
        />
      }
      confirmText={destName}
      prompt={t("addJob.turnOnDelete.type", { name: destName })}
      confirmLabel={t("addJob.turnOnDelete.confirm")}
      cancelLabel={t("addJob.cancel")}
      onConfirm={() => {
        const typed = password;
        setPassword("");
        onConfirm(asksPassword ? typed : undefined);
      }}
    >
      {asksPassword && open ? <PasswordAgain onChange={setPassword} /> : null}
    </TypeToConfirmDialog>
  );
}
