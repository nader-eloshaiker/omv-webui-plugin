// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a shared folder" as it runs (phase 5 shares design 6.4 to 6.6, 6.8): the step list with each
// state in words (announced politely by the list), the apply's running time and output, the decision a
// failure needs with focus moved to it (assertive), the pause when other changes became pending (R10),
// and the result with both addresses to copy. The run lives in memory for the session (addFlow.ts), so
// this view shows it again when the reader comes back. Nothing retries by itself (UI-14); undo is only
// the band's, with the sentence about the folder that stays on the disk (R6).
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  AlsoPendingNotice,
  AlsoPendingPrompt,
  CopyButton,
  Identifier,
  JobFailure,
  JobResult,
  JobStepList,
  type JobStep,
  type TaskStatus,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import {
  addFlowAction,
  clearAddDraft,
  clearAddFlow,
  type AddFlowFailure,
  type AddRun,
  type AddStep,
} from "../../sharedFolders/addFlow.ts";
import { displayPath } from "../../sharedFolders/nameRules.ts";
import { shownFsName } from "../../sharedFolders/shownNames.ts";
import { shareAddresses } from "../../sharedFolders/smbModel.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { FolderLink } from "../atoms/FolderLink.tsx";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { FsNameView } from "../atoms/FsNameView.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { StepTask } from "../molecules/StepTask.tsx";

const STATES: readonly TaskStatus[] = [
  "waiting",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export function AddShareRun({ run }: { run: AddRun }) {
  const { t } = useTranslation();
  const decisionRef = useRef<HTMLDivElement>(null);
  const { phase, choices, busy } = run;

  useEffect(() => {
    if (phase.kind === "failed" || phase.kind === "alsoPending") {
      decisionRef.current?.focus();
    }
  }, [phase.kind]);

  const stepLabel = (step: AddStep) => t(`addShare.step.${step}`);
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
            failed={false}
          />
        ),
    };
  });

  const serverMessage = (error: unknown) =>
    isRpcError(error)
      ? { label: t("app.serverMessage"), text: error.message }
      : undefined;
  const fs = <FsNameView name={shownFsName(choices.fs)} />;
  const name = <FolderNameText value={choices.name} />;
  const path = (
    <IdentifierText value={inertBidi(displayPath(choices.reldirpath))} />
  );
  const stopBody = (
    <Trans i18nKey="addShare.fail.stopBody" components={{ path, fs }} />
  );
  const stop = {
    label: t("addShare.fail.stopHere"),
    onUndo: () => addFlowAction("stop"),
  };
  const retryBusy =
    busy === "retry" || busy === "checkAgain" ? ("retry" as const) : undefined;
  const changeChoices = () => clearAddFlow();
  const reasonWords = (reason: string) =>
    reason === "gone"
      ? t("addShare.fs.reason.missing")
      : t(`addShare.fs.reason.${reason as "missing"}`);

  const failure = (f: AddFlowFailure): ReactNode => {
    switch (f.kind) {
      case "fsGone":
        return (
          <JobFailure
            title={
              <Trans
                i18nKey="addShare.fail.fsGone"
                values={{ reason: reasonWords(f.reason) }}
                components={{ fs }}
              />
            }
            message={t("addShare.fail.nothingDone")}
            retryLabel={t("addShare.changeChoices")}
            onRetry={changeChoices}
          />
        );
      case "nameTaken":
        return (
          <JobFailure
            title={
              <Trans
                i18nKey="addShare.fail.nameTaken"
                components={{ other: <FolderNameText value={f.other} /> }}
              />
            }
            message={t("addShare.fail.nothingDone")}
            retryLabel={t("addShare.changeChoices")}
            onRetry={changeChoices}
          />
        );
      case "name":
      case "path":
        return (
          <JobFailure
            title={t(f.problem.key, f.problem)}
            message={t("addShare.fail.nothingDone")}
            retryLabel={t("addShare.changeChoices")}
            onRetry={changeChoices}
          />
        );
      case "pending":
        return (
          <JobFailure
            title={
              <Trans
                i18nKey="addShare.fail.pending"
                components={{ list: <ModuleNames ids={f.modules} /> }}
              />
            }
            message={t("addShare.fail.pendingBody")}
            retryLabel={t("addShare.changeChoices")}
            onRetry={changeChoices}
          />
        );
      case "hostTooLong":
        return (
          <JobFailure
            title={t("addShare.fail.hostTooLong")}
            message={
              <Trans
                i18nKey="folderSmb.form.hostTooLong"
                values={{ count: f.length }}
                components={{
                  host: <IdentifierText value={inertBidi(f.host)} />,
                }}
              />
            }
            retryLabel={t("addShare.changeChoices")}
            onRetry={changeChoices}
          />
        );
      case "checkRead":
        return (
          <JobFailure
            title={t("addShare.fail.checkRead")}
            message={t("addShare.fail.nothingDone")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addShare.tryAgain")}
            onRetry={() => addFlowAction("retry")}
            undo={{ label: t("addShare.changeChoices"), onUndo: changeChoices }}
            busy={retryBusy}
          />
        );
      case "notMade":
        return (
          <JobFailure
            title={t("addShare.fail.notMade")}
            message={t("addShare.fail.nothingDone")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addShare.tryAgain")}
            onRetry={() => addFlowAction("retry")}
            undo={{ label: t("addShare.changeChoices"), onUndo: changeChoices }}
            busy={retryBusy}
          />
        );
      case "noDir":
      case "removeFailed":
        return (
          <JobFailure
            title={
              f.kind === "noDir" ? (
                <Trans i18nKey="addShare.fail.noDir" components={{ fs }} />
              ) : (
                t("addShare.fail.removeFailed")
              )
            }
            message={stopBody}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addShare.tryAgain")}
            onRetry={() =>
              addFlowAction(f.kind === "noDir" ? "retry" : "removeAgain")
            }
            undo={
              f.kind === "noDir"
                ? {
                    label: t("addShare.fail.removeAgain"),
                    onUndo: () => addFlowAction("removeAgain"),
                  }
                : stop
            }
            busy={
              busy === "retry"
                ? "retry"
                : busy === "removeAgain"
                  ? f.kind === "noDir"
                    ? "undo"
                    : "retry"
                  : undefined
            }
          />
        );
      case "partial":
        return (
          <JobFailure
            title={
              <Trans
                i18nKey="addShare.fail.partial"
                values={{ what: t(`addShare.fail.what.${f.what}`) }}
                components={{ name }}
              />
            }
            message={stopBody}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addShare.tryStep")}
            onRetry={() => addFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "apply":
        return (
          <JobFailure
            title={t("addShare.fail.apply")}
            message={stopBody}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addShare.tryApply")}
            onRetry={() => addFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "notReady":
        return (
          <JobFailure
            title={t("addShare.fail.notReady", {
              what: t(`addShare.fail.what.${f.what}`),
            })}
            message={
              run.uuid === null ? null : (
                <FolderLink uuid={run.uuid} name={choices.name} />
              )
            }
            retryLabel={t("addShare.checkAgain")}
            onRetry={() => addFlowAction("checkAgain")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "unknown":
        return (
          <JobFailure
            title={t("addShare.fail.unknown", { step: stepLabel(f.step) })}
            message={t("addShare.fail.unknownBody")}
            retryLabel={t("addShare.checkAgain")}
            onRetry={() => addFlowAction("checkAgain")}
            undo={stop}
            busy={retryBusy}
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
        stopLabel={t("addShare.fail.stopHere")}
        onApply={() => addFlowAction("applyToo")}
        onStop={() => addFlowAction("stop")}
        busy={busy === "applyToo" ? "apply" : undefined}
      >
        <AlsoPendingNotice>
          <Trans
            i18nKey="addShare.alsoBody"
            components={{ list: <ModuleNames ids={phase.others} /> }}
          />
        </AlsoPendingNotice>
      </AlsoPendingPrompt>
    );
  }

  let result;
  let links: ReactNode = null;
  if (phase.kind === "done") {
    const addresses = shareAddresses(choices.hostname, choices.name);
    result = {
      status: "succeeded" as const,
      statusLabel: t("addStorage.state.succeeded"),
      message: (
        <>
          <span className="block font-semibold">
            {t("addShare.done.title", { name: inertBidi(choices.name) })}
          </span>
          {choices.smb === null ? (
            <span className="block">{t("addShare.done.notShared")}</span>
          ) : (
            <span className="block">
              <Trans
                i18nKey="addShare.done.shared"
                components={{
                  windows: (
                    <IdentifierText value={inertBidi(addresses.windows)} />
                  ),
                  mac: <IdentifierText value={inertBidi(addresses.mac)} />,
                }}
              />
            </span>
          )}
          {choices.smb !== null && choices.smb.guest !== "no" ? (
            <span className="block">{t("addShare.done.guest")}</span>
          ) : null}
        </>
      ),
    };
    links = (
      <div className="flex flex-col gap-3">
        {choices.smb === null ? null : (
          <dl className="flex flex-col gap-2">
            {(
              [
                ["windows", t("sharedFolder.fact.addressWindows")],
                ["mac", t("sharedFolder.fact.addressMac")],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex flex-wrap items-center gap-2">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="flex items-center gap-1">
                  <Identifier>{inertBidi(addresses[key])}</Identifier>
                  <CopyButton
                    text={addresses[key]}
                    label={t("sharedFolder.copyAddress", {
                      folder: inertBidi(choices.name),
                    })}
                    copiedLabel={t("common.copied")}
                    selectedLabel={t("common.copySelected")}
                    size="icon-sm"
                  />
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link
            to="/storage/shared-folders/$folder"
            params={{ folder: phase.folder.uuid }}
            className={routerLinkClass}
          >
            {t("addShare.done.open")}
          </Link>
          <Link
            to="/storage/shared-folders/add"
            className={routerLinkClass}
            onClick={() => {
              clearAddDraft();
              clearAddFlow();
            }}
          >
            {t("addShare.done.another")}
          </Link>
        </p>
      </div>
    );
  } else if (phase.kind === "stopped" || phase.kind === "removed") {
    const made = phase.kind === "stopped" && run.uuid !== null;
    result = {
      status: "cancelled" as const,
      statusLabel: t("addStorage.state.cancelled"),
      message:
        phase.kind === "removed" ? (
          t("addShare.removed")
        ) : (
          <>
            <span className="block">{t("addStorage.stopped")}</span>
            {made ? <span className="block">{stopBody}</span> : null}
          </>
        ),
    };
    links = (
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {made && run.uuid !== null ? (
          <Link
            to="/storage/shared-folders/$folder"
            params={{ folder: run.uuid }}
            className={routerLinkClass}
          >
            {t("addShare.done.open")}
          </Link>
        ) : null}
        <Link to="/storage/shared-folders" className={routerLinkClass}>
          {t("addShare.toList")}
        </Link>
      </p>
    );
  }

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
        onDismiss={() => {
          clearAddDraft();
          clearAddFlow();
        }}
      />
      {links}
    </div>
  );
}
