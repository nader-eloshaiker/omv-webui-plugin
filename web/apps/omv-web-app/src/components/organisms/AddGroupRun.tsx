// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a group" as it runs (phase 5 users design 10, 6.4 to 6.6): the step list with each state in
// words (announced politely by the list), the apply's running time and output, the decision a failure
// needs with focus moved to it (assertive), the pause when other changes became pending (R10), and
// the result. The run lives in memory for the session (addGroupFlow.ts), so this view shows it again
// when the reader comes back. Nothing retries by itself (UI-14), and Undo is never offered once the
// group exists (V4): the way back is "Delete {{group}} again", behind a plain confirmation.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  AlsoPendingNotice,
  AlsoPendingPrompt,
  ConfirmDialog,
  ExternalLink,
  JobFailure,
  JobResult,
  JobStepList,
  type JobStep,
  type TaskStatus,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import {
  addGroupAction,
  clearAddGroup,
  clearAddGroupDraft,
  type AddGroupFailure,
  type AddGroupStep,
  type AddGroupRun as Run,
} from "../../groups/addGroupFlow.ts";
import { groupHasPage } from "../../groups/groupPage.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
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

/** The group's page, or (for a group called "add", whose address is this flow's) a line saying so. */
function OpenGroup({ name }: { name: string }) {
  const { t } = useTranslation();
  if (!groupHasPage(name)) {
    return (
      <span className="flex flex-col gap-1">
        <span>{t("addGroup.openNoPage", { group: isolateName(name) })}</span>
        <ExternalLink href={CLASSIC.groups} newTabLabel={t("app.newTab")}>
          {t("groups.classicLink")}
        </ExternalLink>
      </span>
    );
  }
  return (
    <Link
      to="/usermgmt/groups/$group"
      params={{ group: name }}
      className={routerLinkClass}
    >
      {t("addGroup.done.open", { group: inertBidi(name) })}
    </Link>
  );
}

export function AddGroupRun({ run }: { run: Run }) {
  const { t } = useTranslation();
  const decisionRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { phase, choices, busy } = run;
  const shownName = isolateName(choices.name);

  useEffect(() => {
    if (phase.kind === "failed" || phase.kind === "alsoPending") {
      decisionRef.current?.focus();
    }
    // The result replaces the button that was pressed: focus goes to the page title, as in "Add a
    // person", so it is not lost to the page.
    if (
      phase.kind === "done" ||
      phase.kind === "stopped" ||
      phase.kind === "removed"
    ) {
      document.querySelector<HTMLElement>("main h1")?.focus();
    }
  }, [phase.kind]);

  const stepLabel = (step: AddGroupStep) => t(`addGroup.step.${step}`);
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
  const group = <IdentifierText value={inertBidi(choices.name)} />;
  const stopBody = (
    <Trans i18nKey="addGroup.fail.stopBody" components={{ group }} />
  );
  const stop = {
    label: t("addPerson.fail.stopHere"),
    onUndo: () => addGroupAction("stop"),
  };
  const retryBusy =
    busy === "retry" || busy === "checkAgain" || busy === "finish"
      ? ("retry" as const)
      : undefined;
  const changeChoices = () => clearAddGroup();
  const nothingDone = t("addShare.fail.nothingDone");

  const failure = (f: AddGroupFailure): ReactNode => {
    switch (f.kind) {
      case "takenGroup":
      case "takenAccount":
        return (
          <JobFailure
            title={
              <Trans
                i18nKey={
                  f.kind === "takenGroup"
                    ? "addPerson.fail.takenGroup"
                    : "addPerson.fail.takenAccount"
                }
                components={{ name: group }}
              />
            }
            message={nothingDone}
            retryLabel={t("addPerson.changeChoices")}
            onRetry={changeChoices}
          />
        );
      case "name":
        return (
          <JobFailure
            title={t(
              f.problem.key === "reserved" || f.problem.key === "reservedHere"
                ? `addGroup.name.${f.problem.key}`
                : `addPerson.name.${f.problem.key}`,
              { group: shownName },
            )}
            message={nothingDone}
            retryLabel={t("addPerson.changeChoices")}
            onRetry={changeChoices}
          />
        );
      case "pending":
        return (
          <JobFailure
            title={
              <Trans
                i18nKey="addGroup.fail.pending"
                components={{ list: <ModuleNames ids={f.modules} /> }}
              />
            }
            message={t("addGroup.fail.pendingBody")}
            retryLabel={t("addPerson.changeChoices")}
            onRetry={changeChoices}
          />
        );
      case "personGone":
        return (
          <JobFailure
            title={t("personDelete.gone", { name: isolateName(f.person) })}
            message={nothingDone}
            retryLabel={t("addPerson.changeChoices")}
            onRetry={changeChoices}
          />
        );
      case "checkRead":
        return (
          <JobFailure
            title={t("addGroup.fail.checkRead")}
            message={nothingDone}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addPerson.tryAgain")}
            onRetry={() => addGroupAction("retry")}
            undo={{
              label: t("addPerson.changeChoices"),
              onUndo: changeChoices,
            }}
            busy={retryBusy}
          />
        );
      case "notAdded":
        return (
          <JobFailure
            title={t("addGroup.fail.notAdded", { group: shownName })}
            message={nothingDone}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addPerson.tryAgain")}
            onRetry={() => addGroupAction("retry")}
            undo={{
              label: t("addPerson.changeChoices"),
              onUndo: changeChoices,
            }}
            busy={retryBusy}
          />
        );
      case "partlyAdded":
      case "deleteFailed":
        return (
          <JobFailure
            title={t(
              f.kind === "partlyAdded"
                ? "addPerson.fail.partlyAdded"
                : "addGroup.fail.deleteFailed",
              { name: shownName, group: shownName },
            )}
            message={null}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addPerson.fail.finish", { name: shownName })}
            onRetry={() => addGroupAction("finish")}
            undo={{
              label: t("addGroup.fail.deleteAgain", { group: shownName }),
              onUndo: () => setConfirmDelete(true),
            }}
            busy={
              busy === "finish"
                ? "retry"
                : busy === "deleteAgain"
                  ? "undo"
                  : undefined
            }
          />
        );
      case "access":
        return (
          <JobFailure
            title={t("addPerson.fail.access", {
              name: shownName,
              folders: f.failed.map(isolateName).join(", "),
            })}
            message={stopBody}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addPerson.tryStep")}
            onRetry={() => addGroupAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "apply":
        return (
          <JobFailure
            title={t("addPerson.fail.apply")}
            message={stopBody}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addPerson.tryApply")}
            onRetry={() => addGroupAction("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "notAsChosen":
        return (
          <JobFailure
            title={t("addPerson.fail.notAsChosen", {
              name: shownName,
              what:
                f.what.kind === "members"
                  ? t("addGroup.fail.what.members")
                  : t("addGroup.fail.what.access", {
                      folder: isolateName(f.what.folder),
                    }),
            })}
            message={<OpenGroup name={choices.name} />}
            retryLabel={t("addPerson.checkAgain")}
            onRetry={() => addGroupAction("checkAgain")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "unknown":
        return (
          <JobFailure
            title={t("addPerson.fail.unknown", { step: stepLabel(f.step) })}
            message={t("addShare.fail.unknownBody")}
            retryLabel={t("addPerson.checkAgain")}
            onRetry={() => addGroupAction("checkAgain")}
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
        stopLabel={t("addPerson.fail.stopHere")}
        onApply={() => addGroupAction("applyToo")}
        onStop={() => addGroupAction("stop")}
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
  const forget = () => {
    clearAddGroupDraft();
    clearAddGroup();
  };
  if (phase.kind === "done") {
    result = {
      status: "succeeded" as const,
      statusLabel: t("addStorage.state.succeeded"),
      message: (
        <>
          <span className="block font-semibold">
            {t("addGroup.done.title", { group: shownName })}
          </span>
          <span className="block">
            {phase.folders.length > 0
              ? t("addGroup.done.access", {
                  list: phase.folders.map(isolateName).join(", "),
                })
              : t("addGroup.done.noAccess")}
          </span>
        </>
      ),
    };
    links = (
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <OpenGroup name={choices.name} />
        <Link
          to="/usermgmt/groups/add"
          className={routerLinkClass}
          onClick={forget}
        >
          {t("addGroup.done.another")}
        </Link>
      </p>
    );
  } else if (phase.kind === "stopped" || phase.kind === "removed") {
    const made = phase.kind === "stopped" && run.made;
    result = {
      status: "cancelled" as const,
      statusLabel: t("addStorage.state.cancelled"),
      message:
        phase.kind === "removed" ? (
          t("addGroup.removed", { group: shownName })
        ) : (
          <>
            <span className="block">{t("addStorage.stopped")}</span>
            {made ? <span className="block">{stopBody}</span> : null}
          </>
        ),
    };
    links = (
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {made ? <OpenGroup name={choices.name} /> : null}
        <Link to="/usermgmt/groups" className={routerLinkClass}>
          {t("groupDelete.toList")}
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
        onDismiss={forget}
      />
      {links}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("addGroup.fail.deleteAgainTitle", { group: shownName })}
        description={t("addGroup.fail.deleteAgainBody")}
        confirmLabel={t("addGroup.fail.deleteAgain", { group: shownName })}
        cancelLabel={t("personDelete.cancel")}
        onConfirm={() => {
          setConfirmDelete(false);
          addGroupAction("deleteAgain");
        }}
      />
    </div>
  );
}
