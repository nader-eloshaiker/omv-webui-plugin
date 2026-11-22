// SPDX-License-Identifier: GPL-3.0-or-later
// A ZFS flow's run as the reader sees it (phase 5 ZFS design 3.4 to 3.7, 4.2, 7.2): the step list with
// each state in words (announced politely by the list), a task step's running time and output, the
// decision a failure needs with focus moved to it (assertive), the pause when other changes became
// pending (R10), and the result with the sharing handover. The run lives in memory for the session
// (zfsRun.ts), so this view shows it again when the reader comes back. A failed checkpoint offers "Try
// again", never "Undo": the pool already exists on its disks. A refused create may have changed the
// disks (observed), so it sends the reader back to choose again, which reads the disks again.
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
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { formatBytes } from "../../format/format.ts";
import { useZfsWords } from "../../hooks/useZfsWords.tsx";
import { routerLinkClass } from "../../shell/linkClass.ts";
import {
  createProtection,
  isFsAddress,
  layoutOfCreate,
} from "../../zfs/zfsModel.ts";
import {
  clearZfsFlow,
  fsPathOf,
  poolOfRun,
  targetDevice,
  zfsFlowAction,
  type Failure,
  type PlanStep,
  type ZfsRun,
} from "../../zfs/zfsRun.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
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

function useStepLabel() {
  const { t } = useTranslation();
  return (step: PlanStep, run: ZfsRun): string => {
    const { choices } = run;
    switch (step.kind) {
      case "check":
        return choices.kind === "create"
          ? t("zfsCreate.step.check")
          : choices.kind === "addFs"
            ? t("zfsFsAdd.step.check")
            : t("zfsReplace.step.check");
      case "erase":
        return t("addStorage.step.erase", { device: step.device ?? "" });
      case "create":
        return t("zfsCreate.step.create");
      case "find":
        return t("zfsCreate.step.find");
      case "fs":
        return choices.kind === "create"
          ? t("zfsCreate.step.fs", { name: choices.fs ?? "" })
          : t("zfsFsAdd.step.make");
      case "limit":
        return t("zfsFsAdd.step.limit");
      case "replace":
        return choices.kind === "replace"
          ? t("zfsReplace.step.replace", {
              device: targetDevice(choices.target),
            })
          : "";
      case "save":
        return choices.kind === "create"
          ? t("zfsCreate.step.save")
          : t("zfsFsAdd.step.save");
      case "verify":
        return choices.kind === "replace"
          ? t("zfsReplace.step.verify")
          : t("zfsCreate.step.verify");
    }
  };
}

export function ZfsRunView({ run }: { run: ZfsRun }) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const stepLabel = useStepLabel();
  const decisionRef = useRef<HTMLDivElement>(null);
  const { phase, choices, busy } = run;
  const pool = poolOfRun(choices);

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
    onUndo: () => zfsFlowAction("stop"),
  };
  const retryBusy = busy === "retry" ? ("retry" as const) : undefined;
  const backToForm = () => clearZfsFlow();
  const back = t("zfsCreate.changeChoices");

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
                t("zfsCreate.cannot.usb")
              ) : f.reason?.kind === "small" ? (
                t("zfsCreate.cannot.small", { size: formatBytes(f.reason.min) })
              ) : f.reason?.kind === "noId" ? (
                t("zfsCreate.cannot.noId")
              ) : (
                t("addStorage.fail.notOffered")
              )
            }
            retryLabel={back}
            onRetry={backToForm}
          />
        );
      case "changed":
        return (
          <JobFailure
            title={t("addStorage.fail.changed", { device: f.device })}
            message={t("addStorage.fail.notOffered")}
            retryLabel={back}
            onRetry={backToForm}
          />
        );
      case "nameTaken":
        return (
          <JobFailure
            title={t("zfsCreate.fail.nameTaken", { pool })}
            message={t("addStorage.stopped")}
            retryLabel={back}
            onRetry={backToForm}
          />
        );
      case "fsTaken": {
        const path = fsPathOf(choices) ?? "";
        const name = path.slice(pool.length + 1);
        return (
          <JobFailure
            title={t("zfsCreate.fail.fsTaken", { name, pool })}
            message={
              choices.kind === "create"
                ? t("zfsCreate.fail.poolStays")
                : t("addStorage.stopped")
            }
            retryLabel={
              choices.kind === "create" ? t("zfsCreate.fail.goOnPool") : back
            }
            onRetry={() =>
              choices.kind === "create"
                ? zfsFlowAction("goOnWithoutFs")
                : backToForm()
            }
            undo={choices.kind === "create" ? stop : undefined}
            busy={busy === "goOnWithoutFs" ? "retry" : undefined}
          />
        );
      }
      case "poolChanged":
        return (
          <JobFailure
            title={t("zfsReplace.fail.changed")}
            message={t("addStorage.stopped")}
            retryLabel={back}
            onRetry={backToForm}
          />
        );
      case "poolRefused":
        return (
          <JobFailure
            title={t("zfsFsAdd.fail.check")}
            message={t("addStorage.stopped")}
            retryLabel={t("addStorage.stop")}
            onRetry={() => zfsFlowAction("stop")}
          />
        );
      case "checkRead":
        return (
          <JobFailure
            title={
              choices.kind === "replace"
                ? t("zfsReplace.fail.checkRead")
                : t("zfsCreate.fail.checkRead")
            }
            message={t("addStorage.stopped")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => zfsFlowAction("retry")}
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
            onRetry={() => zfsFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "notCandidate":
        return (
          <JobFailure
            title={
              choices.kind === "replace"
                ? t("zfsReplace.fail.notCandidate", { device: f.device })
                : t("zfsCreate.fail.notCandidate", { device: f.device })
            }
            message={t("addStorage.stopped")}
            retryLabel={t("addStorage.checkAgain")}
            onRetry={() => zfsFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "create":
        // A refused create may have written a partition table to the disks (observed): choose again,
        // which reads the disks again; they then show under Erase and reuse.
        return (
          <JobFailure
            title={t("zfsCreate.fail.create")}
            message={t("zfsCreate.fail.createParts")}
            serverMessage={serverMessage(f.error)}
            retryLabel={back}
            onRetry={backToForm}
            undo={stop}
          />
        );
      case "notFound":
        return (
          <JobFailure
            title={t("zfsCreate.fail.notFound")}
            message={t("zfsCreate.fail.listedLater")}
            retryLabel={t("addStorage.lookAgain")}
            onRetry={() => zfsFlowAction("lookAgain")}
            undo={stop}
            busy={busy === "lookAgain" ? "retry" : undefined}
          />
        );
      case "fs":
      case "fsNotListed": {
        const path = fsPathOf(choices) ?? "";
        const name = path.slice(pool.length + 1);
        return (
          <JobFailure
            title={
              f.kind === "fs"
                ? t("zfsCreate.fail.fs", { name })
                : t("zfsCreate.fail.fsNotListed", { name })
            }
            message={
              choices.kind === "create"
                ? t("zfsCreate.fail.poolStays")
                : t("addStorage.stopped")
            }
            serverMessage={f.kind === "fs" ? serverMessage(f.error) : undefined}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => zfsFlowAction("retry")}
            undo={
              choices.kind === "create"
                ? {
                    label: t("zfsCreate.fail.goOnPool"),
                    onUndo: () => zfsFlowAction("goOnWithoutFs"),
                  }
                : stop
            }
            busy={retryBusy ?? (busy === "goOnWithoutFs" ? "undo" : undefined)}
          />
        );
      }
      case "limit":
        return (
          <JobFailure
            title={t("zfsFsAdd.fail.limit")}
            message={t("addStorage.stopped")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => zfsFlowAction("retry")}
            undo={{
              label: t("zfsFsAdd.fail.goOn"),
              onUndo: () => zfsFlowAction("goOnWithoutLimit"),
            }}
            busy={
              retryBusy ?? (busy === "goOnWithoutLimit" ? "undo" : undefined)
            }
          />
        );
      case "replace":
        return (
          <JobFailure
            title={t("zfsReplace.fail.replace")}
            message={
              choices.kind === "replace" && choices.target.group === "reuse"
                ? t("zfsReplace.fail.erased", {
                    device: targetDevice(choices.target),
                  })
                : t("addStorage.stopped")
            }
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addStorage.tryStep")}
            onRetry={() => zfsFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "notSeen":
        return (
          <JobFailure
            title={t("zfsReplace.fail.notSeen")}
            message={t("addStorage.stopped")}
            retryLabel={t("addStorage.lookAgain")}
            onRetry={() => zfsFlowAction("lookAgain")}
            undo={stop}
            busy={busy === "lookAgain" ? "retry" : undefined}
          />
        );
      case "save":
        return (
          <JobFailure
            title={
              choices.kind === "create"
                ? t("zfsCreate.fail.save")
                : t("zfsFsAdd.fail.save")
            }
            message={t("zfsCreate.fail.saveBody")}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("common.tryAgain")}
            onRetry={() => zfsFlowAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "notMounted":
        return (
          <JobFailure
            title={t("zfsCreate.fail.notMounted", { name: f.name })}
            message={t("zfsCreate.fail.notMountedBody")}
            retryLabel={t("addStorage.checkAgain")}
            onRetry={() => zfsFlowAction("retry")}
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
        onApply={() => zfsFlowAction("applyToo")}
        onStop={() => zfsFlowAction("stop")}
        busy={busy === "applyToo" ? "apply" : undefined}
      >
        <AlsoPendingNotice>
          <Trans
            i18nKey="zfsCreate.alsoBody"
            components={{ list: <ModuleNames ids={phase.others} /> }}
          />
        </AlsoPendingNotice>
      </AlsoPendingPrompt>
    );
  }

  const poolLink = (
    <Link
      to="/storage/zfs/pools/$pool"
      params={{ pool }}
      className={routerLinkClass}
    >
      {t("zfsCreate.openPool", { pool })}
    </Link>
  );
  const fsPath = fsPathOf(choices);
  const fsLink =
    fsPath === null || run.fsRow === null || !isFsAddress(fsPath) ? null : (
      <Link
        to="/storage/zfs/fs/$"
        params={{ _splat: fsPath }}
        className={routerLinkClass}
      >
        {t("zfsCreate.openFs")}
      </Link>
    );

  let result;
  let links: ReactNode = null;
  if (phase.kind === "done" && choices.kind === "create") {
    const count = choices.targets.length;
    const layout = words.layoutWord(layoutOfCreate(choices.layout, count));
    const size = formatBytes(
      run.root === null ? choices.usable : run.root.used + run.root.available,
    );
    result = {
      status: "succeeded" as const,
      statusLabel: t("addStorage.state.succeeded"),
      message: (
        <>
          <span className="block font-semibold">
            {t("zfsCreate.doneTitle")}
          </span>
          <span className="block">
            <Trans
              i18nKey={
                choices.layout === "basic"
                  ? "zfsCreate.doneBodyNone"
                  : "zfsCreate.doneBody"
              }
              values={{
                layout,
                size,
                protection: words.protectionText(
                  createProtection(choices.layout, count),
                ),
              }}
              components={{ pool: <IdentifierText value={pool} /> }}
            />
          </span>
          {run.fsRow !== null && fsPath !== null ? (
            <span className="block">
              <Trans
                i18nKey="zfsCreate.doneFs"
                values={{ size: formatBytes(run.fsRow.available) }}
                components={{ fs: <IdentifierText value={fsPath} /> }}
              />
            </span>
          ) : null}
        </>
      ),
    };
    links = (
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {poolLink}
        {fsLink}
        {choices.fs === null ? (
          <Link
            to="/storage/zfs/pools/$pool/add"
            params={{ pool }}
            className={routerLinkClass}
          >
            {t("zfsCreate.addFs")}
          </Link>
        ) : null}
      </p>
    );
  } else if (phase.kind === "done" && choices.kind === "addFs") {
    result = {
      status: "succeeded" as const,
      statusLabel: t("addStorage.state.succeeded"),
      message: (
        <Trans
          i18nKey="zfsFsAdd.done"
          values={{ free: formatBytes(run.fsRow?.available ?? 0) }}
          components={{ fs: <IdentifierText value={fsPath ?? ""} /> }}
        />
      ),
    };
    links = (
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {fsLink}
        {poolLink}
      </p>
    );
  } else if (phase.kind === "done" && choices.kind === "replace") {
    const device = targetDevice(choices.target);
    const old = choices.oldDisk;
    const working =
      choices.old.role === "working" || choices.old.role === "workingErrors";
    result = {
      status: "succeeded" as const,
      statusLabel: t("addStorage.state.succeeded"),
      message: (
        <>
          <span className="block font-semibold">
            {t("zfsReplace.doneTitle", { device })}
          </span>
          <span className="block">{t("zfsReplace.doneBody")}</span>
          {working && old !== null ? (
            <span className="block">
              <Trans
                i18nKey="zfsReplace.doneOld"
                values={{ model: old.model.trim() }}
                components={{
                  old: <IdentifierText value={old.canonicaldevicefile} />,
                  serial: <IdentifierText value={old.serialnumber.trim()} />,
                }}
              />{" "}
              {t("zfsReplace.doneOldKept")} {t("zfsReplace.wipeAdvice")}
            </span>
          ) : null}
        </>
      ),
    };
    links = (
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {poolLink}
        {old === null ? null : (
          <Link
            to="/storage/disks/$disk"
            params={{ disk: old.devicename }}
            className={routerLinkClass}
          >
            {t("zfsReplace.openOld", { device: old.canonicaldevicefile })}
          </Link>
        )}
      </p>
    );
  } else if (phase.kind === "stopped") {
    const exists = choices.kind !== "create" || run.created;
    result = {
      status: "cancelled" as const,
      statusLabel: t("addStorage.state.cancelled"),
      message: (
        <>
          <span className="block">{t("addStorage.stopped")}</span>
          {choices.kind === "create" && run.created ? (
            <span className="block">{t("zfsCreate.backingOut")}</span>
          ) : null}
        </>
      ),
    };
    links = (
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {exists ? poolLink : null}
        <Link to="/storage/zfs" className={routerLinkClass}>
          {t("zfsCreate.toList")}
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
        onDismiss={() => clearZfsFlow()}
      />
      {links}
      {phase.kind === "done" &&
      run.omvRow !== null &&
      choices.kind !== "replace" ? (
        <SharingHandover fs={run.omvRow} />
      ) : null}
    </div>
  );
}
