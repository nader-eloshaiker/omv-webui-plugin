// SPDX-License-Identifier: GPL-3.0-or-later
// Flow D, "Set up disk monitoring" (phase 5 disks design 7; UX audit 4.5 and R1 to R10): pre-flight,
// one form of decisions, one summary and confirmation, then the run. Opening the page only reads (R9):
// the settings, the scheduled tests, the disks and the email settings, none of which wakes a disk; the
// disks to offer come from the session's disk-health check, which runs only when the reader asks.
import {
  useConfigApplyChangesBg,
  useConfigRevertChangesBg,
  useEmailNotificationGet,
  type EmailNotificationSettings,
  type SmartScheduleEntry,
  type SmartSettings,
} from "@omv-webui/react-api-omv/generated";
import { taskRegistry, useTasks } from "@omv-webui/react-api-omv/tasks";
import {
  JobRunner,
  JobSummary,
  PreflightNotice,
} from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ALERT_MARGIN } from "../../disks/diskWords.ts";
import {
  choicesOf,
  diskOffer,
  emailConfigured,
  hourName,
  initialDraft,
  parseLimit,
  setUpPlan,
  skipsSleeping,
  weekdayName,
  type DiskOffer,
  type SetUpChoices,
  type SetUpDraft,
  type SetUpPlan,
} from "../../disks/setupPlan.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import {
  ON_OPEN,
  useDiskList,
  useScheduleList,
  useSmartSettings,
} from "../../hooks/useDiskReads.ts";
import { useSetUpRun } from "../../hooks/useSetUpRun.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { Slotted } from "../atoms/Slotted.tsx";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { ApplyChangesDialog, UndoChangesDialog } from "./PendingChanges.tsx";
import { SetUpDecisions } from "./SetUpDecisions.tsx";
import { SetUpRun } from "./SetUpRun.tsx";

/** R1: pending changes from elsewhere stop the flow before its first decision. */
function SetUpPreflight({ modules }: { modules: readonly string[] }) {
  const { t } = useTranslation();
  const tasks = useTasks();
  const apply = useConfigApplyChangesBg();
  const undo = useConfigRevertChangesBg();
  const [confirming, setConfirming] = useState<"apply" | "undo" | null>(null);
  const [last, setLast] = useState<{
    id: number;
    action: "apply" | "undo";
  } | null>(null);
  const running =
    last !== null && tasks.find((x) => x.id === last.id)?.state === "running";
  const start = (action: "apply" | "undo") => {
    setConfirming(null);
    const id = taskRegistry.start(
      t(action === "apply" ? "pending.applyTask" : "pending.undoTask"),
      () =>
        action === "apply"
          ? apply.mutateAsync({ data: { modules: [], force: false } })
          : undo.mutateAsync({ data: { filename: "" } }),
    );
    setLast({ id, action });
  };
  return (
    <>
      <PreflightNotice
        title={t("smart.setup.preflightTitle")}
        applyLabel={t("smart.setup.applyThem")}
        undoLabel={t("smart.setup.undoThem")}
        onApply={() => setConfirming("apply")}
        onUndo={() => setConfirming("undo")}
        busy={running ? last.action : undefined}
      >
        <p>
          {t("pending.message", { count: modules.length })}{" "}
          <ModuleNames ids={modules} />
        </p>
        <p>{t("smart.setup.preflightBody")}</p>
      </PreflightNotice>
      <ApplyChangesDialog
        open={confirming === "apply"}
        onOpenChange={(open) => !open && setConfirming(null)}
        modules={modules}
        onConfirm={() => start("apply")}
      />
      <UndoChangesDialog
        open={confirming === "undo"}
        onOpenChange={(open) => !open && setConfirming(null)}
        modules={modules}
        onConfirm={() => start("undo")}
      />
    </>
  );
}

/** 7.4: the summary in plain words, one item per choice. */
function useSummaryItems(
  plan: SetUpPlan,
  choices: SetUpChoices,
  settings: SmartSettings,
  email: EmailNotificationSettings | undefined,
): ReactNode[] {
  const { t } = useTranslation();
  const format = useFormat();
  const items: ReactNode[] = [];
  if (!settings.enable) {
    items.push(t("smart.setup.sum.globalOn"));
  }
  if (plan.watch.length > 0) {
    items.push(
      t("smart.setup.sum.watch", {
        count: plan.watch.length,
        list: plan.watch.map((d) => d.canonicaldevicefile).join(", "),
      }),
    );
  }
  const count = plan.testDisks.length;
  if (choices.tests === "none") {
    items.push(t("smart.setup.sum.noTests"));
  } else if (count > 0) {
    if (choices.tests !== "long") {
      items.push(
        t("smart.setup.sum.short", {
          count,
          when: t("smart.setup.sum.whenWeekly", {
            weekday: weekdayName(choices.shortWeekday),
            hour: hourName(choices.shortHour),
          }),
        }),
      );
    }
    if (choices.tests !== "short") {
      items.push(
        t("smart.setup.sum.long", {
          count,
          when: t("smart.setup.sum.whenMonthly", {
            day: choices.longDay,
            hour: hourName(choices.longHour),
          }),
        }),
      );
    }
  }
  if (plan.keeps.length > 0) {
    items.push(
      t("smart.setup.sum.keeps", {
        list: plan.keeps.map((k) => k.device).join(", "),
      }),
    );
  }
  items.push(
    skipsSleeping(plan.settings.powermode)
      ? t("smart.setup.sum.sleepOn")
      : t("smart.setup.sum.sleepOff"),
  );
  items.push(
    plan.settings.tempmax > 0
      ? t("smart.setup.sum.tempOn", {
          limit: format.celsius(plan.settings.tempmax),
          alert: format.celsius(plan.settings.tempmax + ALERT_MARGIN),
        })
      : t("smart.setup.sum.tempOff"),
  );
  items.push(
    emailConfigured(email) && email ? (
      <Slotted
        key="email"
        sentence={(tokens) => t("smart.setup.sum.emailOn", tokens)}
        values={{ address: email.primaryemail }}
      />
    ) : (
      t("smart.setup.sum.emailOff")
    ),
  );
  items.push(
    t("smart.setup.sum.interval", {
      interval: format.interval(settings.interval),
    }),
  );
  items.push(t("smart.setup.sum.apply"));
  return items;
}

/** The summary, then the run, for one set of choices (mounted when the reader presses Continue). */
function SetUpConfirmAndRun({
  plan,
  choices,
  settings,
  email,
  offer,
  onBack,
  onStarted,
}: {
  plan: SetUpPlan;
  choices: SetUpChoices;
  settings: SmartSettings;
  email: EmailNotificationSettings | undefined;
  offer: DiskOffer;
  onBack: () => void;
  onStarted: () => void;
}) {
  const { t } = useTranslation();
  const run = useSetUpRun(plan, choices);
  const items = useSummaryItems(plan, choices, settings, email);
  const summaryRef = useRef<HTMLDivElement>(null);
  const started = run.phase.kind !== "idle";

  useEffect(() => {
    summaryRef.current?.focus();
  }, []);

  if (!started) {
    return (
      <div ref={summaryRef} tabIndex={-1} className="outline-hidden">
        <JobSummary
          title={t("smart.setup.summaryTitle")}
          items={items}
          confirmLabel={t("smart.setup.confirm")}
          backLabel={t("smart.setup.back")}
          onBack={onBack}
          onConfirm={() => {
            onStarted();
            run.start();
          }}
        />
      </div>
    );
  }
  return (
    <SetUpRun
      run={run}
      plan={plan}
      choices={choices}
      interval={settings.interval}
      alreadyWatched={offer.watched.length}
      email={email}
    />
  );
}

export function SetUpFlow() {
  const { t } = useTranslation();
  const info = useSystemInformation();
  const settings = useSmartSettings();
  const schedule = useScheduleList();
  const disks = useDiskList();
  const email = useEmailNotificationGet({ query: ON_OPEN });
  const check = useDiskCheck();
  const [draft, setDraft] = useState<SetUpDraft | null>(null);
  // The choices and the plan, fixed when Continue is pressed: a later check does not change the run.
  const [chosen, setChosen] = useState<{
    choices: SetUpChoices;
    plan: SetUpPlan;
  } | null>(null);
  const [started, setStarted] = useState(false);

  const failed = [settings, schedule, disks].find(
    (q) => q.data === undefined && q.isError,
  );
  if (failed) {
    return (
      <ReadFailed
        error={failed.error}
        retrying={failed.isFetching}
        onRetry={() => {
          for (const q of [settings, schedule, disks]) {
            if (q.isError) {
              void q.refetch();
            }
          }
        }}
      >
        {t("smart.setup.loadFailed")}
      </ReadFailed>
    );
  }
  if (
    info.data === undefined ||
    settings.data === undefined ||
    schedule.data === undefined ||
    disks.data === undefined
  ) {
    return (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("smart.setup.loading")}
      </p>
    );
  }

  const pending = pendingModules(info.data.dirtyModules);
  if (!started && (pending.length > 0 || info.data.configDirty === true)) {
    return <SetUpPreflight modules={pending} />;
  }

  const saved = settings.data;
  const entries: readonly SmartScheduleEntry[] = schedule.data.data;
  const values = draft ?? initialDraft(saved);
  const offer = check.result
    ? diskOffer(check.result.list.data, disks.data.data)
    : undefined;

  return (
    <JobRunner title={t("smart.setup.title")}>
      {chosen && offer ? (
        <SetUpConfirmAndRun
          plan={chosen.plan}
          choices={chosen.choices}
          settings={saved}
          email={email.data}
          offer={offer}
          onBack={() => setChosen(null)}
          onStarted={() => setStarted(true)}
        />
      ) : (
        <SetUpDecisions
          check={{
            readAt: check.result?.readAt,
            checking: check.checking,
            failed: check.failed,
            error: check.error,
            onCheck: check.start,
          }}
          offer={offer}
          schedule={entries}
          email={email.data}
          emailFailed={email.data === undefined && email.isError}
          draft={values}
          onDraftChange={setDraft}
          onContinue={() => {
            const limit = parseLimit(values.tempText);
            if (offer && check.result && (!values.temp || limit !== null)) {
              const choices = choicesOf(values, offer, limit ?? 0);
              setDraft(values);
              setChosen({
                choices,
                plan: setUpPlan(choices, {
                  settings: saved,
                  check: check.result.list.data,
                  schedule: entries,
                }),
              });
            }
          }}
        />
      )}
    </JobRunner>
  );
}
