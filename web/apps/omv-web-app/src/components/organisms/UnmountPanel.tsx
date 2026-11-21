// SPDX-License-Identifier: GPL-3.0-or-later
// An unmount or removal once confirmed (phase 5 file-systems design 5.3, 5.4): the step list with each
// state in words (changes announced politely by the list), the decision a failure needs (focus moved to
// it, announced assertively), the pause when other changes became pending (R10), and the result, which
// stays until dismissed. It runs in the session's actions (fsActions.ts), so it is shown again when the
// reader comes back, and above the "not set up" state once the file system is gone.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  AlsoPendingNotice,
  AlsoPendingPrompt,
  JobFailure,
  JobResult,
  JobStepList,
  type TaskStatus,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  actionOf,
  dismissAction,
  fsActions,
  unmountDecision,
  type UnmountRun,
} from "../../filesystems/fsActions.ts";
import { isBusyUnmount } from "../../filesystems/fsTasks.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { ModuleNames } from "../molecules/ModuleNames.tsx";

const STATES: readonly TaskStatus[] = [
  "waiting",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export function UnmountPanel({
  address,
  onTryAgain,
}: {
  address: string;
  /** "Try again…": the whole checked dialog again (only while the file system is still there). */
  onTryAgain?: () => void;
}) {
  const { t } = useTranslation();
  useMemoryStore(fsActions);
  const action = actionOf(address);
  const decisionRef = useRef<HTMLDivElement>(null);
  const run: UnmountRun | undefined =
    action !== undefined && action.kind !== "grow" ? action : undefined;
  const phaseKind = run?.phase.kind;

  useEffect(() => {
    if (
      phaseKind === "failed" ||
      phaseKind === "alsoPending" ||
      phaseKind === "stillThere"
    ) {
      decisionRef.current?.focus();
    }
  }, [phaseKind]);

  if (run === undefined) {
    return null;
  }
  const remove = run.kind === "remove";
  const statusLabels = Object.fromEntries(
    STATES.map((s) => [s, t(`addStorage.state.${s}`)]),
  ) as Record<TaskStatus, string>;
  const steps = [
    {
      id: "unmount",
      label: remove
        ? t("fsRemove.step", { name: run.name })
        : t("fsUnmount.step.unmount", { name: run.name }),
      status: run.steps.unmount,
    },
    {
      id: "apply",
      label: t("fsUnmount.step.apply"),
      status: run.steps.apply,
    },
    {
      id: "verify",
      label: remove ? t("fsRemove.stepVerify") : t("fsUnmount.step.verify"),
      status: run.steps.verify,
    },
  ];

  const phase = run.phase;
  const serverMessage = (error: unknown) =>
    isRpcError(error)
      ? { label: t("app.serverMessage"), text: error.message }
      : undefined;
  let decision = null;
  if (phase.kind === "alsoPending") {
    decision = (
      <AlsoPendingPrompt
        title={t("fsUnmount.alsoTitle")}
        applyLabel={t("fsUnmount.applyToo")}
        stopLabel={t("fsUnmount.stop")}
        onApply={() => unmountDecision(address, "applyToo")}
        onStop={() => unmountDecision(address, "stop")}
        busy={run.busy ? "apply" : undefined}
      >
        <AlsoPendingNotice>
          <Trans
            i18nKey="fsUnmount.alsoBody"
            components={{ list: <ModuleNames ids={phase.others} /> }}
          />
        </AlsoPendingNotice>
      </AlsoPendingPrompt>
    );
  } else if (phase.kind === "failed" && phase.at === "unmount") {
    decision = (
      <JobFailure
        title={
          remove
            ? t("fsRemove.failedTitle", { name: run.name })
            : t("fsUnmount.failedTitle", { name: run.name })
        }
        message={
          isBusyUnmount(phase.error)
            ? t("fsUnmount.busyBody")
            : t("fsUnmount.failedBody")
        }
        serverMessage={serverMessage(phase.error)}
        retryLabel={t("fsUnmount.again")}
        onRetry={() => {
          dismissAction(address);
          onTryAgain?.();
        }}
        undo={{
          label: t("fsUnmount.dismiss"),
          onUndo: () => dismissAction(address),
        }}
      />
    );
  } else if (phase.kind === "failed") {
    decision = (
      <JobFailure
        title={
          remove
            ? t("fsRemove.applyFailed", { name: run.name })
            : t("fsUnmount.applyFailed", { name: run.name })
        }
        message={t("fsUnmount.applyFailedBody")}
        serverMessage={serverMessage(phase.error)}
        retryLabel={t("fsUnmount.tryApply")}
        onRetry={() => unmountDecision(address, "retryApply")}
        busy={run.busy ? "retry" : undefined}
      />
    );
  } else if (phase.kind === "stillThere") {
    decision = (
      <JobFailure
        title={t("fsUnmount.stillThere", { name: run.name })}
        message={t("fsUnmount.applyFailedBody")}
        retryLabel={t("fsUnmount.checkAgain")}
        onRetry={() => unmountDecision(address, "checkAgain")}
        busy={run.busy ? "retry" : undefined}
      />
    );
  }

  const result =
    phase.kind === "done"
      ? {
          status: "succeeded" as const,
          statusLabel: t("addStorage.state.succeeded"),
          message: (
            <>
              <span className="block font-semibold">
                {remove
                  ? t("fsRemove.doneTitle", { name: run.name })
                  : t("fsUnmount.doneTitle", { name: run.name })}
              </span>
              {remove ? null : (
                <span className="block">{t("fsUnmount.doneBody")}</span>
              )}
            </>
          ),
        }
      : phase.kind === "stopped"
        ? {
            status: "cancelled" as const,
            statusLabel: t("addStorage.state.cancelled"),
            message: t("fsUnmount.stopped"),
          }
        : undefined;

  return (
    <div data-slot="unmount-panel" className="flex flex-col gap-3">
      <JobStepList
        steps={steps}
        statusLabels={statusLabels}
        label={t("fsUnmount.steps")}
      />
      {decision ? (
        <div ref={decisionRef} tabIndex={-1} className="outline-hidden">
          {decision}
        </div>
      ) : null}
      <JobResult
        result={result}
        dismissLabel={t("fsUnmount.dismiss")}
        onDismiss={() => dismissAction(address)}
      />
      {phase.kind === "done" || phase.kind === "stopped" ? (
        <p>
          <Link to="/storage/filesystems" className={routerLinkClass}>
            {t("fsUnmount.toList")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
