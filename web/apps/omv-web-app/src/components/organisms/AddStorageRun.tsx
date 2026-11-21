// SPDX-License-Identifier: GPL-3.0-or-later
// Flow A's run as the reader sees it (phase 5 file-systems design 6.6 to 6.8, 7.3): the step list with
// each state in words (announced politely by the list); a task step's running time (not announced) and
// its output on the terminal pair; the decision a failure needs, with focus moved to it; the pause when
// other changes became pending (R10); and the result with the sharing handover. The run lives in memory
// for the session (flowRun.ts), so this view shows it again when the reader comes back.
import type { ConfiguredFilesystem } from "@omv-webui/react-api-omv/generated";
import { useTask } from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  AlsoPendingNotice,
  AlsoPendingPrompt,
  Button,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  JobFailure,
  JobResult,
  JobStepList,
  TaskLog,
  type JobStep,
  type TaskStatus,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  clearFlow,
  flowAction,
  flowStore,
  saveDraft,
  type Failure,
  type FlowRun,
} from "../../filesystems/flowRun.ts";
import { fsAddress, fsName, splitTags } from "../../filesystems/fsModel.ts";
import { taskLines } from "../../filesystems/terminal.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useFlowWords } from "../../hooks/useFlowWords.tsx";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { useNow } from "../../hooks/useNow.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { WipeBlockers } from "../molecules/WipeBlockers.tsx";
import { SharingHandover } from "./SharingHandover.tsx";

const STATES: readonly TaskStatus[] = [
  "waiting",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

/** A task step's time and output: "Running for 12 s", then its output behind a disclosure. */
function StepTask({
  taskId,
  label,
  failed,
}: {
  taskId: number;
  label: string;
  failed: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const { task } = useTask(taskId);
  const running = task?.state === "running";
  const now = useNow(running ? 1000 : null);
  const [open, setOpen] = useState(failed);
  if (task === undefined) {
    return null;
  }
  const elapsed = Math.max(
    0,
    Math.floor(((task.endedAt ?? now) - task.startedAt) / 1000),
  );
  return (
    <div className="flex flex-col gap-1">
      {running ? (
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("addStorage.runningFor", { duration: format.duration(elapsed) })}
        </span>
      ) : null}
      <Disclosure open={open || failed} onOpenChange={setOpen}>
        <DisclosureTrigger>
          {open || failed
            ? t("addStorage.hideOutput")
            : t("addStorage.showOutput")}
        </DisclosureTrigger>
        <DisclosurePanel>
          <TaskLog
            lines={taskLines(task.output)}
            label={t("addStorage.outputLabel", { step: label })}
            copyLabel={t("tasks.copy")}
            copiedLabel={t("tasks.copied")}
            selectedLabel={t("tasks.selected")}
            emptyLabel={running ? t("tasks.waiting") : t("tasks.noOutput")}
          />
        </DisclosurePanel>
      </Disclosure>
    </div>
  );
}

export function AddStorageRun({ run }: { run: FlowRun }) {
  const { t } = useTranslation();
  const words = useFlowWords();
  const fsWords = useFsWords();
  const decisionRef = useRef<HTMLDivElement>(null);
  const { phase, choices } = run;
  const kind = choices.kind;
  const busy = run.busy;

  useEffect(() => {
    if (phase.kind === "failed" || phase.kind === "alsoPending") {
      decisionRef.current?.focus();
    }
  }, [phase.kind]);

  const statusLabels = Object.fromEntries(
    STATES.map((s) => [s, t(`addStorage.state.${s}`)]),
  ) as Record<TaskStatus, string>;
  const failedAt = phase.kind === "failed" ? phase.at : null;
  const steps: JobStep[] = run.steps.map((step) => {
    const state = run.state[step.id] ?? { status: "waiting" as const };
    const label = words.stepLabel(step, choices);
    return {
      id: step.id,
      label,
      status: state.status,
      detail:
        state.taskId === undefined ? undefined : (
          <StepTask
            taskId={state.taskId}
            label={label}
            failed={failedAt === step.id && step.kind !== "mount"}
          />
        ),
    };
  });

  const serverMessage = (error: unknown) =>
    isRpcError(error)
      ? { label: t("app.serverMessage"), text: error.message }
      : undefined;
  const stop = {
    label: t("addStorage.stop"),
    onUndo: () => flowAction("stop"),
  };
  const backToForm = (clearChoice: boolean) => {
    const draft = flowStore.getState().draft[kind];
    if (draft !== undefined && clearChoice) {
      saveDraft(kind, { ...draft, chosen: [] });
    }
    clearFlow();
  };
  const erasedNote = (erased: readonly string[]) =>
    kind === "multi" && erased.length > 0 ? (
      <span className="block">
        {t("addStorage.multi.fail.someErased", {
          count: erased.length,
          erased: erased.join(", "),
        })}
      </span>
    ) : null;

  const failure = (f: Failure): ReactNode => {
    switch (f.kind) {
      case "blocked":
        return (
          <JobFailure
            title={t("addStorage.fail.blocked", { device: f.device })}
            message={
              f.blockers.length > 0 ? (
                <WipeBlockers blockers={f.blockers} />
              ) : (
                t("addStorage.fail.notOffered")
              )
            }
            retryLabel={t("addStorage.chooseOther")}
            onRetry={() => backToForm(true)}
          />
        );
      case "changed":
        return (
          <JobFailure
            title={t("addStorage.fail.changed", { device: f.device })}
            message={t("addStorage.fail.notOffered")}
            retryLabel={t("addStorage.chooseAgain")}
            onRetry={() => backToForm(true)}
          />
        );
      case "checkRead":
        return (
          <JobFailure
            title={t("addStorage.fail.checkRead", { device: f.device })}
            message={t("addStorage.stopped")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => flowAction("retry")}
            undo={stop}
            busy={busy === "retry" ? "retry" : undefined}
          />
        );
      case "erase":
        return (
          <JobFailure
            title={t("addStorage.fail.erase", { device: f.device })}
            message={
              <>
                {erasedNote(f.erased)}
                <span className="block">{t("addStorage.fail.mayBeEmpty")}</span>
              </>
            }
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => flowAction("retry")}
            undo={stop}
            busy={busy === "retry" ? "retry" : undefined}
          />
        );
      case "notCandidate":
        return (
          <JobFailure
            title={t("addStorage.fail.notCandidate", { device: f.device })}
            message={erasedNote(f.erased) ?? t("addStorage.stopped")}
            retryLabel={t("addStorage.checkAgain")}
            onRetry={() => flowAction("retry")}
            undo={stop}
            busy={busy === "retry" ? "retry" : undefined}
          />
        );
      case "create":
        return (
          <JobFailure
            title={t("addStorage.fail.create", { device: f.device })}
            message={
              <>
                {erasedNote(f.erased)}
                <span className="block">{t("addStorage.fail.noFs")}</span>
              </>
            }
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => flowAction("retry")}
            undo={stop}
            busy={busy === "retry" ? "retry" : undefined}
          />
        );
      case "notFound":
        return (
          <div className="flex flex-col gap-2">
            <JobFailure
              title={t("addStorage.fail.notFound")}
              message={t("addStorage.fail.listedFound")}
              retryLabel={t("addStorage.lookAgain")}
              onRetry={() => flowAction("lookAgain")}
              undo={stop}
              busy={busy === "lookAgain" ? "retry" : undefined}
            />
            <div>
              <Button
                variant="neutral"
                loading={busy === "rescan"}
                disabled={busy !== null && busy !== "rescan"}
                focusableWhenDisabled
                onClick={() => flowAction("rescan")}
              >
                {t("addStorage.rescan")}
              </Button>
            </div>
          </div>
        );
      case "ambiguous":
        return (
          <JobFailure
            title={t("addStorage.fail.ambiguous", { device: f.device })}
            message={t("addStorage.fail.listedFound")}
            retryLabel={t("addStorage.stop")}
            onRetry={() => flowAction("stop")}
          />
        );
      case "setUp":
        return (
          <JobFailure
            title={t("addStorage.fail.setUp")}
            message={t("addStorage.fail.listedFound")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => flowAction("retry")}
            undo={stop}
            busy={busy === "retry" ? "retry" : undefined}
          />
        );
      case "mount":
        // R7: trying again first; the undo second (safe: the pre-flight held, so only this flow's
        // changes are pending).
        return (
          <JobFailure
            title={t("addStorage.fail.mount")}
            message={t("addStorage.fail.mountBody")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryMount")}
            onRetry={() => flowAction("retry")}
            undo={{
              label: t("addStorage.undoMount"),
              onUndo: () => flowAction("undoMount"),
            }}
            busy={
              busy === "retry"
                ? "retry"
                : busy === "undoMount"
                  ? "undo"
                  : undefined
            }
          />
        );
      case "notMounted":
        return (
          <div className="flex flex-col gap-2">
            <JobFailure
              title={t("addStorage.fail.notMounted")}
              message={t("addStorage.stopped")}
              retryLabel={t("addStorage.checkAgain")}
              onRetry={() => flowAction("retry")}
              undo={stop}
              busy={busy === "retry" ? "retry" : undefined}
            />
            {run.found !== null &&
            fsAddress({ ...run.found, status: 1 }) !== null ? (
              <p>
                <Link
                  to="/storage/filesystems/$fs"
                  params={{ fs: fsAddress({ ...run.found, status: 1 }) ?? "" }}
                  className={routerLinkClass}
                >
                  {t("addStorage.openFs")}
                </Link>
              </p>
            ) : null}
          </div>
        );
      case "otherModules":
        return (
          <JobFailure
            title={
              f.modules.length > 0 ? (
                <Trans
                  i18nKey="addStorage.fail.otherModules"
                  components={{ modules: <ModuleNames ids={f.modules} /> }}
                />
              ) : (
                t("addStorage.fail.otherModulesUnknown")
              )
            }
            message={t("addStorage.fail.mountBody")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryApply")}
            onRetry={() => flowAction("retryApply")}
            undo={{
              label: t("addStorage.continueAnyway"),
              onUndo: () => flowAction("continue"),
            }}
            busy={
              busy === "retryApply"
                ? "retry"
                : busy === "continue"
                  ? "undo"
                  : undefined
            }
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
        stopLabel={t("addStorage.stop")}
        onApply={() => flowAction("applyToo")}
        onStop={() => flowAction("stop")}
        busy={busy === "applyToo" ? "apply" : undefined}
      >
        <AlsoPendingNotice>
          <Trans
            i18nKey="addStorage.alsoBody"
            components={{ list: <ModuleNames ids={phase.others} /> }}
          />
        </AlsoPendingNotice>
      </AlsoPendingPrompt>
    );
  }

  let result;
  let done: ConfiguredFilesystem | null = null;
  if (phase.kind === "done") {
    done = phase.row;
    const name = fsName(phase.row);
    const tags = splitTags(phase.row.comment);
    const free = parseByteCount(phase.row.available);
    result = {
      status: "succeeded" as const,
      statusLabel: t("addStorage.state.succeeded"),
      message: (
        <>
          <span className="block font-semibold">
            {t("addStorage.doneTitle")}
          </span>
          <span className="block">
            {t("addStorage.doneBody", {
              name:
                tags.length > 0
                  ? `${fsWords.nameOf(name)} (${tags.join(", ")})`
                  : fsWords.nameOf(name),
              device:
                phase.row.parentdevicefile || phase.row.canonicaldevicefile,
              size: free === null ? "" : formatBytes(free),
            })}
          </span>
        </>
      ),
    };
  } else if (phase.kind === "stopped") {
    const afterCreate =
      run.state.create?.status === "succeeded" &&
      run.state.mount?.status !== "succeeded";
    result = {
      status: "cancelled" as const,
      statusLabel: t("addStorage.state.cancelled"),
      message: (
        <>
          <span className="block">{t("addStorage.stopped")}</span>
          {afterCreate ? (
            <span className="block">{t("addStorage.fail.listedFound")}</span>
          ) : null}
        </>
      ),
    };
  } else if (phase.kind === "undone") {
    result = {
      status: "cancelled" as const,
      statusLabel: t("addStorage.state.cancelled"),
      message: t("addStorage.undone"),
    };
  }
  const address = done === null ? null : fsAddress(done);

  return (
    <div className="flex flex-col gap-4">
      <JobStepList
        steps={steps}
        statusLabels={statusLabels}
        label={t("addStorage.steps")}
      />
      {decision ? (
        <div ref={decisionRef} tabIndex={-1} className="outline-hidden">
          {decision}
        </div>
      ) : null}
      <JobResult
        result={result}
        dismissLabel={t("addStorage.dismiss")}
        onDismiss={() => clearFlow()}
      />
      {phase.kind === "done" ||
      phase.kind === "stopped" ||
      phase.kind === "undone" ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {address === null ? null : (
            <Link
              to="/storage/filesystems/$fs"
              params={{ fs: address }}
              className={routerLinkClass}
            >
              {t("addStorage.openFs")}
            </Link>
          )}
          <Link to="/storage/filesystems" className={routerLinkClass}>
            {t("addStorage.toList")}
          </Link>
        </p>
      ) : null}
      {done !== null ? <SharingHandover fs={done} /> : null}
    </div>
  );
}
