// SPDX-License-Identifier: GPL-3.0-or-later
// A RAID flow's run as the reader sees it (phase 5 RAID design 3.4 to 3.7, 4.5 to 4.7): the step list
// with each state in words (announced politely by the list), a task step's running time and output, the
// decision a failure needs with focus moved to it (assertive), the pause when other changes became
// pending (R10), and the result. The run lives in memory for the session (raidRun.ts), so this view
// shows it again when the reader comes back. A failed checkpoint offers "Try again", never "Undo": the
// array already exists on the disks (D12).
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  AlsoPendingNotice,
  AlsoPendingPrompt,
  JobFailure,
  JobResult,
  JobStepList,
  type JobStep,
  type TaskStatus,
} from "@omv-webui/react-ui-components";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { fsAddress, fsName } from "../../filesystems/fsModel.ts";
import { handOffDisk } from "../../filesystems/fsSession.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { useRaidStepLabel } from "../../hooks/useRaidStepLabel.ts";
import { useRaidWords } from "../../hooks/useRaidWords.tsx";
import { bytesOf } from "../../raid/raidChoices.ts";
import { arrayAddress, levelKey, usableSize } from "../../raid/raidModel.ts";
import {
  clearRaidFlow,
  raidFlowAction,
  targetDevice,
  type Failure,
  type RaidRun,
} from "../../raid/raidRun.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { StepTask } from "../molecules/StepTask.tsx";
import { WipeBlockers } from "../molecules/WipeBlockers.tsx";
import { SharingHandover } from "./SharingHandover.tsx";

const STATES: readonly TaskStatus[] = [
  "waiting",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export function RaidRunView({ run }: { run: RaidRun }) {
  const { t } = useTranslation();
  const words = useRaidWords();
  const fsWords = useFsWords();
  const navigate = useNavigate();
  const stepLabel = useRaidStepLabel();
  const decisionRef = useRef<HTMLDivElement>(null);
  const { phase, choices, busy } = run;
  const arrayDevice =
    run.array?.devicefile ??
    (choices.kind === "add" ? choices.array.devicefile : "");

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
    const label = stepLabel(step, run);
    return {
      id: step.id,
      label,
      status: state.status,
      detail:
        state.taskId === undefined ? undefined : (
          <StepTask
            taskId={state.taskId}
            label={label}
            failed={failedAt === step.id && step.kind !== "save"}
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
    onUndo: () => raidFlowAction("stop"),
  };
  const retryBusy = busy === "retry" ? ("retry" as const) : undefined;
  const backToForm = () => clearRaidFlow();

  const failure = (f: Failure): ReactNode => {
    switch (f.kind) {
      case "blocked":
        return (
          <JobFailure
            title={t("addStorage.fail.blocked", { device: f.device })}
            message={
              f.reason?.kind === "blocked" ? (
                <WipeBlockers blockers={f.reason.blockers} />
              ) : f.reason?.kind === "usb" ? (
                t("raidCreate.cannotUsb")
              ) : f.reason?.kind === "small" ? (
                t("raidAdd.cannotSmall", { size: formatBytes(f.reason.min) })
              ) : (
                t("addStorage.fail.notOffered")
              )
            }
            retryLabel={t("addStorage.back")}
            onRetry={backToForm}
          />
        );
      case "changed":
        return (
          <JobFailure
            title={t("addStorage.fail.changed", { device: f.device })}
            message={t("addStorage.fail.notOffered")}
            retryLabel={t("addStorage.back")}
            onRetry={backToForm}
          />
        );
      case "arrayChanged":
        return (
          <JobFailure
            title={t("raidAdd.fail.arrayChanged", { array: arrayDevice })}
            message={t("addStorage.stopped")}
            retryLabel={t("addStorage.back")}
            onRetry={backToForm}
          />
        );
      case "checkRead":
        return (
          <JobFailure
            title={t("raidCreate.fail.checkRead")}
            message={t("addStorage.stopped")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => raidFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "erase":
        return (
          <JobFailure
            title={t("addStorage.fail.erase", { device: f.device })}
            message={
              f.erased.length > 0
                ? t("addStorage.multi.fail.someErased", {
                    count: f.erased.length,
                    erased: f.erased.join(", "),
                  })
                : t("addStorage.fail.mayBeEmpty")
            }
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => raidFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "notCandidate":
        return (
          <JobFailure
            title={t("raidCreate.fail.notCandidate", { device: f.device })}
            message={t("addStorage.stopped")}
            retryLabel={t("addStorage.checkAgain")}
            onRetry={() => raidFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "create":
        return (
          <JobFailure
            title={t("raidCreate.fail.create")}
            message={t("raidCreate.fail.createParts")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => raidFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "notFound":
        return (
          <JobFailure
            title={t("raidCreate.fail.notFound")}
            message={t("raidCreate.fail.listedLater")}
            retryLabel={t("addStorage.lookAgain")}
            onRetry={() => raidFlowAction("lookAgain")}
            undo={stop}
            busy={busy === "lookAgain" ? "retry" : undefined}
          />
        );
      case "fsCandidate":
      case "fsCreate":
        return (
          <JobFailure
            title={
              f.kind === "fsCandidate"
                ? t("raidCreate.fail.fsCandidate")
                : t("raidCreate.fail.fsCreate")
            }
            message={t("raidCreate.fail.arrayStays")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => raidFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "clear":
        // Stop, with the server's words: nothing else was erased (owner, 2026-11-22).
        return (
          <JobFailure
            title={t("raidCreate.fail.clear")}
            message={t("raidCreate.fail.clearBody")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.stop")}
            onRetry={() => raidFlowAction("stop")}
          />
        );
      case "fsNotFound":
        return (
          <JobFailure
            title={t("addStorage.fail.notFound")}
            message={t("addStorage.fail.listedFound")}
            retryLabel={t("addStorage.lookAgain")}
            onRetry={() => raidFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "fsSetUp":
        return (
          <JobFailure
            title={t("addStorage.fail.setUp")}
            message={t("addStorage.fail.listedFound")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => raidFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "add":
        return (
          <JobFailure
            title={t("raidAdd.fail.add", {
              device: f.device,
              array: arrayDevice,
            })}
            message={t("raidAdd.fail.addBody")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => raidFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "spareOnly":
        // No retry: the server would add the disk again first, and fail (4.7).
        return (
          <JobFailure
            title={t("raidAdd.fail.spareOnly", { device: f.device })}
            message={t("raidAdd.fail.spareStays")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.stop")}
            onRetry={() => raidFlowAction("stop")}
          />
        );
      case "notReported":
        return (
          <JobFailure
            title={t("raidAdd.fail.notReported")}
            message={t("addStorage.stopped")}
            retryLabel={t("addStorage.checkAgain")}
            onRetry={() => raidFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "takeOut":
        return (
          <JobFailure
            title={t("raidAdd.fail.takeOut")}
            message={t("raidAdd.fail.takeOutLater")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => raidFlowAction("retry")}
            undo={{
              label: t("addStorage.continueAnyway"),
              onUndo: () => raidFlowAction("continue"),
            }}
            busy={retryBusy ?? (busy === "continue" ? "undo" : undefined)}
          />
        );
      case "save":
        return (
          <JobFailure
            title={
              choices.kind === "create" && choices.forFiles
                ? t("raidCreate.fail.saveAndMount")
                : t("raidCreate.fail.save")
            }
            message={t("raidCreate.fail.saveBody")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("common.tryAgain")}
            onRetry={() => raidFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "notVerified":
        return (
          <JobFailure
            title={t("raidCreate.fail.notVerified")}
            message={t("addStorage.stopped")}
            retryLabel={t("addStorage.checkAgain")}
            onRetry={() => raidFlowAction("retry")}
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
        stopLabel={t("addStorage.stop")}
        onApply={() => raidFlowAction("applyToo")}
        onStop={() => raidFlowAction("stop")}
        busy={busy === "applyToo" ? "apply" : undefined}
      >
        <AlsoPendingNotice>
          <Trans
            i18nKey="raidCreate.alsoBody"
            components={{ list: <ModuleNames ids={phase.others} /> }}
          />
        </AlsoPendingNotice>
      </AlsoPendingPrompt>
    );
  }

  const address = run.array === null ? null : arrayAddress(run.array);
  let result;
  let links: ReactNode = null;
  if (phase.kind === "done" && choices.kind === "create") {
    const sizes = choices.targets.map((t2) => bytesOf(t2.disk.size));
    const size = formatBytes(
      run.array !== null
        ? (parseByteCount(run.array.size) ?? 0)
        : usableSize(levelKey(choices.level), sizes),
    );
    const fs = run.fsRow;
    const free = fs === null ? null : parseByteCount(fs.available);
    result = {
      status: "succeeded" as const,
      statusLabel: t("addStorage.state.succeeded"),
      message: (
        <>
          <span className="block font-semibold">
            {t("raidCreate.doneTitle")}
          </span>
          <span className="block">
            {choices.level === "stripe"
              ? t("raidCreate.doneBodyStripe", { device: arrayDevice, size })
              : t("raidCreate.doneBody", {
                  device: arrayDevice,
                  level: words.levelWord(choices.level),
                  size,
                })}
          </span>
          {fs !== null ? (
            <span className="block">
              {t("raidCreate.doneFs", {
                name: fsWords.nameOf(fsName(fs)),
                size: free === null ? "" : formatBytes(free),
              })}
            </span>
          ) : null}
        </>
      ),
    };
    const fsPage = fs === null ? null : fsAddress(fs);
    links = (
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {address === null ? null : (
          <Link
            to="/storage/md/$array"
            params={{ array: address }}
            className={routerLinkClass}
          >
            {t("raidCreate.openArray", { device: arrayDevice })}
          </Link>
        )}
        {fsPage === null ? null : (
          <Link
            to="/storage/filesystems/$fs"
            params={{ fs: fsPage }}
            className={routerLinkClass}
          >
            {t("addStorage.openFs")}
          </Link>
        )}
        {choices.forFiles || run.array === null ? null : (
          <button
            type="button"
            className={routerLinkClass}
            onClick={() => {
              handOffDisk(arrayDevice);
              clearRaidFlow();
              void navigate({ to: "/storage/filesystems/add" });
            }}
          >
            {t("raidCreate.addStorage")}
          </button>
        )}
      </p>
    );
  } else if (phase.kind === "done" && choices.kind === "add") {
    const device = choices.targets.map(targetDevice).join(", ");
    const grown =
      choices.estimate === null ? "" : formatBytes(choices.estimate);
    const taken = choices.takeOut;
    const title =
      choices.purpose === "replace"
        ? t("raidAdd.done.replaceTitle")
        : choices.purpose === "spare"
          ? t("raidAdd.done.spareTitle", { device, array: arrayDevice })
          : t("raidAdd.done.biggerTitle");
    const body =
      choices.purpose === "replace"
        ? t("raidAdd.done.replaceBody", { device })
        : choices.purpose === "spare"
          ? t("raidAdd.done.spareBody")
          : t("raidAdd.done.biggerBody", { array: arrayDevice, new: grown });
    result = {
      status: "succeeded" as const,
      statusLabel: t("addStorage.state.succeeded"),
      message: (
        <>
          <span className="block font-semibold">{title}</span>
          <span className="block">{body}</span>
          {taken !== null && run.state.takeOut?.status === "succeeded" ? (
            <span className="block">
              {t("raidAdd.done.disconnect", {
                device: taken.device,
                model: taken.model,
                serial: taken.serial,
              })}
            </span>
          ) : null}
        </>
      ),
    };
    links =
      address === null ? null : (
        <p>
          <Link
            to="/storage/md/$array"
            params={{ array: address }}
            className={routerLinkClass}
          >
            {t("raidCreate.openArray", { device: arrayDevice })}
          </Link>
        </p>
      );
  } else if (phase.kind === "stopped") {
    const exists = run.array !== null && choices.kind === "create";
    result = {
      status: "cancelled" as const,
      statusLabel: t("addStorage.state.cancelled"),
      message: (
        <>
          <span className="block">{t("addStorage.stopped")}</span>
          {exists ? (
            <span className="block">{t("raidCreate.fail.arrayStays")}</span>
          ) : null}
        </>
      ),
    };
    links = (
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {address === null ? null : (
          <Link
            to="/storage/md/$array"
            params={{ array: address }}
            className={routerLinkClass}
          >
            {t("raidCreate.openArray", { device: arrayDevice })}
          </Link>
        )}
        <Link to="/storage/md" className={routerLinkClass}>
          {t("raidCreate.toList")}
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-group">
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
        onDismiss={() => clearRaidFlow()}
      />
      {links}
      {phase.kind === "done" && run.fsRow !== null ? (
        <SharingHandover fs={run.fsRow} />
      ) : null}
    </div>
  );
}
