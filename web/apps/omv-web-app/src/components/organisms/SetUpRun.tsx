// SPDX-License-Identifier: GPL-3.0-or-later
// Flow D's run as the reader sees it (phase 5 disks design 7.5 to 7.8): the step list with each state
// in words (announced politely by the list), the decision a failure needs (announced assertively, with
// focus moved to it), the pause when other changes became pending (R10), and the result.
import type {
  EmailNotificationSettings,
  SmartDevice,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  AlsoPendingNotice,
  AlsoPendingPrompt,
  Button,
  ExternalLink,
  Identifier,
  JobFailure,
  JobResult,
  JobStepList,
  type JobStep,
  type TaskStatus,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  emailConfigured,
  hourName,
  weekdayName,
  type SetUpChoices,
  type SetUpPlan,
} from "../../disks/setupPlan.ts";
import { useFormat } from "../../format/useFormat.ts";
import type { useSetUpRun } from "../../hooks/useSetUpRun.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { ModuleNames } from "../molecules/ModuleNames.tsx";

type Run = ReturnType<typeof useSetUpRun>;

const STATES: readonly TaskStatus[] = [
  "waiting",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export function SetUpRun({
  run,
  plan,
  choices,
  interval,
  alreadyWatched,
  email,
}: {
  run: Run;
  plan: SetUpPlan;
  choices: SetUpChoices;
  /** The saved check interval, in seconds. */
  interval: number;
  /** How many disks were watched before the run. */
  alreadyWatched: number;
  email: EmailNotificationSettings | undefined;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const decisionRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const phase = run.phase;

  // A failure or a pause takes focus, so the reader lands on what it asks (7.8).
  useEffect(() => {
    if (
      phase.kind === "globalFailed" ||
      phase.kind === "disksFailed" ||
      phase.kind === "alsoPending" ||
      phase.kind === "applyFailed" ||
      phase.kind === "verifyFailed"
    ) {
      decisionRef.current?.focus();
    }
  }, [phase]);

  const statusLabels = Object.fromEntries(
    STATES.map((s) => [s, t(`smart.setup.state.${s}`)]),
  ) as Record<TaskStatus, string>;

  const steps: JobStep[] = plan.steps.map((step) => {
    const state = run.steps[step.id] ?? { status: "waiting" as const };
    let label;
    switch (step.kind) {
      case "global":
        label = step.wasOn
          ? t("smart.setup.step.globalUpdate")
          : t("smart.setup.step.global");
        break;
      case "watch":
        label = t("smart.setup.step.watch", {
          device: step.disk.canonicaldevicefile,
        });
        break;
      case "test":
        label = t(
          step.test === "S"
            ? "smart.setup.step.short"
            : "smart.setup.step.long",
          { device: step.disk.canonicaldevicefile },
        );
        break;
      case "apply":
        label = t("smart.setup.step.apply");
        break;
      case "verify":
        label = t("smart.setup.step.verify");
        break;
    }
    return {
      id: step.id,
      label,
      status: state.status,
      detail:
        state.detail === undefined ? undefined : (
          <span dir="auto" className="whitespace-pre-wrap">
            {state.detail}
          </span>
        ),
    };
  });

  const serverMessage = (error: unknown) =>
    isRpcError(error)
      ? { label: t("app.serverMessage"), text: error.message }
      : undefined;
  const busy = run.busy;

  let decision = null;
  switch (phase.kind) {
    case "globalFailed":
      decision = (
        <JobFailure
          title={t("smart.setup.globalFailed")}
          message={t("smart.setup.globalFailedBody")}
          serverMessage={serverMessage(phase.error)}
          retryLabel={t("smart.setup.tryStep")}
          onRetry={run.retryGlobal}
          undo={{ label: t("smart.setup.stop"), onUndo: () => run.stop(false) }}
          busy={busy === "retryGlobal" ? "retry" : undefined}
        />
      );
      break;
    case "disksFailed": {
      const failed = phase.failed;
      decision = (
        <div className="flex flex-col gap-3">
          <JobFailure
            title={t("smart.setup.someFailed", {
              failed: failed.length,
              total: new Set(
                [...plan.watch, ...plan.testDisks].map(
                  (d) => d.canonicaldevicefile,
                ),
              ).size,
            })}
            message={
              <>
                <span className="block">{t("smart.setup.someFailedBody")}</span>
                {failed.map(({ disk, error }) => (
                  <span
                    key={disk.canonicaldevicefile}
                    className="block"
                    dir="auto"
                  >
                    <Identifier>{disk.canonicaldevicefile}</Identifier>
                    {isRpcError(error) ? `: ${error.message}` : null}
                  </span>
                ))}
              </>
            }
            retryLabel={t("smart.setup.continueWithout")}
            onRetry={run.continueWithout}
            undo={{ label: t("smart.setup.undo"), onUndo: run.undo }}
            busy={
              busy === "continueWithout"
                ? "retry"
                : busy === "undo"
                  ? "undo"
                  : undefined
            }
          />
          <div className="flex flex-wrap gap-2">
            {failed.map(({ disk }) => (
              <Button
                key={disk.canonicaldevicefile}
                variant="neutral"
                disabled={busy !== null}
                focusableWhenDisabled
                onClick={() => run.retryDisks([disk])}
              >
                {t("smart.setup.tryDisk", { device: disk.canonicaldevicefile })}
              </Button>
            ))}
            {failed.length > 1 ? (
              <Button
                variant="neutral"
                disabled={busy !== null}
                focusableWhenDisabled
                onClick={() =>
                  run.retryDisks(failed.map((f): SmartDevice => f.disk))
                }
              >
                {t("smart.setup.tryAll")}
              </Button>
            ) : null}
          </div>
        </div>
      );
      break;
    }
    case "alsoPending":
      decision = (
        <AlsoPendingPrompt
          title={t("smart.setup.alsoTitle")}
          applyLabel={t("smart.setup.applyToo")}
          stopLabel={t("smart.setup.stop")}
          onApply={run.applyToo}
          onStop={() => run.stop(true)}
          busy={busy === "applyToo" ? "apply" : undefined}
        >
          <AlsoPendingNotice>
            <Trans
              i18nKey="smart.setup.alsoBodyList"
              components={{ list: <ModuleNames ids={phase.others} /> }}
            />
          </AlsoPendingNotice>
        </AlsoPendingPrompt>
      );
      break;
    case "applyFailed":
      decision = (
        <JobFailure
          title={t("smart.setup.applyFailed")}
          message={t("smart.setup.applyFailedBody")}
          serverMessage={serverMessage(phase.error)}
          retryLabel={t("smart.setup.tryApply")}
          onRetry={run.retryApply}
          undo={{ label: t("smart.setup.undo"), onUndo: run.undo }}
          busy={
            busy === "retryApply"
              ? "retry"
              : busy === "undo"
                ? "undo"
                : undefined
          }
        />
      );
      break;
    case "verifyFailed":
      decision = (
        <JobFailure
          title={t("smart.setup.verifyFailed")}
          message={
            <>
              {phase.global ? (
                <span className="block">{t("smart.setup.verifyGlobal")}</span>
              ) : null}
              {phase.devices.map((device) => (
                <span key={`d:${device}`} className="block">
                  {t("smart.setup.verifyDiff", { device })}
                </span>
              ))}
              {phase.tests.map((device, i) => (
                <span key={`t:${device}:${String(i)}`} className="block">
                  {t("smart.setup.verifyTest", { device })}
                </span>
              ))}
              <span className="block">{t("smart.setup.verifyFailedBody")}</span>
            </>
          }
          retryLabel={t("smart.setup.checkAgain")}
          onRetry={run.checkAgain}
          busy={busy === "checkAgain" ? "retry" : undefined}
        />
      );
      break;
    default:
      break;
  }

  const watchedNow =
    alreadyWatched +
    plan.watch.filter(
      (d) =>
        run.steps[`watch:${d.canonicaldevicefile}`]?.status === "succeeded",
    ).length;
  const intervalText = format.duration(interval);
  const testLines: string[] = [];
  if (plan.testDisks.length > 0 && choices.tests !== "none") {
    if (choices.tests === "short" || choices.tests === "both") {
      testLines.push(
        t("smart.setup.doneShort", {
          when: t("smart.setup.sum.whenWeekly", {
            weekday: weekdayName(choices.shortWeekday),
            hour: hourName(choices.shortHour),
          }),
        }),
      );
    }
    if (choices.tests === "long" || choices.tests === "both") {
      testLines.push(
        t("smart.setup.doneLong", {
          when: t("smart.setup.sum.whenMonthly", {
            day: choices.longDay,
            hour: hourName(choices.longHour),
          }),
        }),
      );
    }
  }
  const emailOn = emailConfigured(email);

  let result;
  if (phase.kind === "done") {
    result = {
      status: "succeeded" as const,
      statusLabel: t("smart.setup.state.succeeded"),
      message: (
        <>
          <span className="block font-semibold">
            {t("smart.setup.doneTitle")}
          </span>
          <span className="block">
            {t("smart.setup.doneBody", {
              count: watchedNow,
              interval: intervalText,
            })}
            {testLines.length > 0 ? ` ${testLines.join(" ")}` : ""}
          </span>
          <span className="block" dir="auto">
            {emailOn && email
              ? t("smart.setup.sum.emailOn", { address: email.primaryemail })
              : t("smart.setup.doneEmailOff")}
          </span>
        </>
      ),
    };
  } else if (phase.kind === "stopped" || phase.kind === "undone") {
    result = {
      status: "cancelled" as const,
      statusLabel: t("smart.setup.state.cancelled"),
      message:
        phase.kind === "undone"
          ? t("smart.setup.undone")
          : phase.saved
            ? t("smart.setup.stoppedPending")
            : t("smart.setup.stoppedNothing"),
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <JobStepList
        steps={steps}
        statusLabels={statusLabels}
        label={t("smart.setup.steps")}
      />
      {decision ? (
        <div ref={decisionRef} tabIndex={-1} className="outline-hidden">
          {decision}
        </div>
      ) : null}
      <JobResult
        result={dismissed ? undefined : result}
        dismissLabel={t("smart.setup.dismiss")}
        onDismiss={() => setDismissed(true)}
      />
      {phase.kind === "done" ||
      phase.kind === "stopped" ||
      phase.kind === "undone" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {phase.kind === "done" && !emailOn ? (
            <ExternalLink
              href={CLASSIC.notifications}
              newTabLabel={t("app.newTab")}
            >
              {t("smart.setup.emailLink")}
            </ExternalLink>
          ) : null}
          <Link to="/storage/smart/overview" className={routerLinkClass}>
            {t("smart.setup.toOverview")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
