// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a person" as it runs (phase 5 users design 6.4 to 6.7): the step list with each state in words
// (announced politely by the list), the apply's running time and output, the decision a failure needs
// with focus moved to it (assertive), the pause when other changes became pending (R10), and the
// result. The run lives in memory for the session (addPersonFlow.ts), so this view shows it again when
// the reader comes back. Nothing retries by itself (UI-14); Undo is never offered once the person
// exists (V4): "Delete {{name}} again" is the way back, behind a plain confirmation.
//
// A decision that runs step 2 again ("Try again", "Finish setting up {{name}}", "Check again" after a
// cut request) asks for the password again, here, in two masked fields; it is handed to that one
// decision and cleared at once (0.7, UI-6).
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  AlsoPendingNotice,
  AlsoPendingPrompt,
  ConfirmDialog,
  JobFailure,
  JobResult,
  JobStepList,
  NewPasswordFields,
  type JobStep,
  type TaskStatus,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import {
  addPersonAction,
  clearAddPerson,
  clearAddPersonDraft,
  needsPassword,
  passwordProblem,
  type AddPersonAction,
  type AddPersonFailure,
  type AddPersonStep,
  type AddPersonRun as Run,
} from "../../users/addPersonFlow.ts";
import { encryptedConnection } from "../../users/connection.ts";
import { byName } from "../../users/usersList.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { PersonLink } from "../atoms/PersonLink.tsx";
import { PersonNameText } from "../atoms/PersonNameText.tsx";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { PasswordHttpNotice } from "../molecules/PasswordHttpNotice.tsx";
import { StepTask } from "../molecules/StepTask.tsx";

const STATES: readonly TaskStatus[] = [
  "waiting",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

const listOf = (names: readonly string[]) =>
  new Intl.ListFormat(undefined, { type: "conjunction" }).format(
    [...names].sort(byName).map(isolateName),
  );

export function AddPersonRun({ run }: { run: Run }) {
  const { t } = useTranslation();
  const notice = encryptedConnection() ? undefined : <PasswordHttpNotice />;
  const decisionRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [checked, setChecked] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { phase, choices, busy } = run;
  const name = choices.name;
  const slot = { name: <PersonNameText value={name} /> };
  const shown = isolateName(name);

  useEffect(() => {
    if (phase.kind === "failed" || phase.kind === "alsoPending") {
      decisionRef.current?.focus();
    }
  }, [phase.kind]);

  const asking = needsPassword(run);
  const problem = asking ? passwordProblem(password, again) : null;
  /** A decision; with the password when this one runs step 2 again, which is then cleared. */
  const act = (action: AddPersonAction) => {
    if (
      asking &&
      (action === "retry" || action === "finish" || action === "checkAgain")
    ) {
      setChecked(true);
      if (problem !== null) {
        passwordRef.current?.focus();
        return;
      }
      const typed = password;
      setPassword("");
      setAgain("");
      setChecked(false);
      addPersonAction(action, typed);
      return;
    }
    addPersonAction(action);
  };

  const stepLabel = (step: AddPersonStep) =>
    step === "verify"
      ? t("addPerson.step.verify", { name: shown })
      : t(`addPerson.step.${step}`);
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
  const changeChoices = () => clearAddPerson();
  const retryBusy =
    busy === "retry" || busy === "checkAgain" || busy === "finish"
      ? ("retry" as const)
      : undefined;
  const stop = {
    label: t("addPerson.fail.stopHere"),
    onUndo: () => addPersonAction("stop"),
  };
  const stopBody = (
    <Trans i18nKey="addPerson.fail.stopBody" components={slot} />
  );
  const nothing = t("addShare.fail.nothingDone");

  const failure = (f: AddPersonFailure): ReactNode => {
    switch (f.kind) {
      case "takenAccount":
      case "takenGroup":
        return (
          <JobFailure
            title={
              <Trans i18nKey={`addPerson.fail.${f.kind}`} components={slot} />
            }
            message={nothing}
            retryLabel={t("addPerson.changeChoices")}
            onRetry={changeChoices}
          />
        );
      case "groupGone":
        return (
          <JobFailure
            title={
              <Trans
                i18nKey="addPerson.fail.groupGone"
                components={{ group: <PersonNameText value={f.group} /> }}
              />
            }
            message={nothing}
            retryLabel={t("addPerson.changeChoices")}
            onRetry={changeChoices}
          />
        );
      case "pending":
        return (
          <JobFailure
            title={
              <Trans
                i18nKey="addPerson.fail.pending"
                components={{ list: <ModuleNames ids={f.modules} /> }}
              />
            }
            message={t("addPerson.fail.pendingBody")}
            retryLabel={t("addPerson.changeChoices")}
            onRetry={changeChoices}
          />
        );
      case "checkRead":
      case "nameUnknown":
        return (
          <JobFailure
            title={t(
              f.kind === "checkRead"
                ? "addPerson.fail.checkRead"
                : "addPerson.fail.nameUnknown",
            )}
            message={nothing}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addPerson.tryAgain")}
            onRetry={() => act("retry")}
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
            title={t("addPerson.fail.notAdded", { name: shown })}
            message={nothing}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addPerson.tryAgain")}
            onRetry={() => act("retry")}
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
            title={
              f.kind === "partlyAdded"
                ? t("addPerson.fail.partlyAdded", { name: shown })
                : t("addPerson.fail.deleteFailed", { name: shown })
            }
            message={stopBody}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addPerson.fail.finish", { name: shown })}
            onRetry={() => act("finish")}
            undo={{
              label: t("addPerson.fail.deleteAgain", { name: shown }),
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
              name: shown,
              folders: listOf(f.folders),
            })}
            message={stopBody}
            serverMessage={serverMessage(f.error)}
            retryLabel={t("addPerson.tryStep")}
            onRetry={() => act("retry")}
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
            onRetry={() => act("retry")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "notAsChosen":
        return (
          <JobFailure
            title={t("addPerson.fail.notAsChosen", {
              name: shown,
              what:
                f.what === "groups"
                  ? t("addPerson.fail.what.groups")
                  : t("addPerson.fail.what.access", {
                      folder: isolateName(f.folder),
                    }),
            })}
            message={
              <PersonLink
                name={name}
                label={t("addPerson.done.open", { name: inertBidi(name) })}
              />
            }
            retryLabel={t("addPerson.checkAgain")}
            onRetry={() => act("checkAgain")}
            undo={stop}
            busy={retryBusy}
          />
        );
      case "unknown":
        return (
          <JobFailure
            title={t("addPerson.fail.unknown", { step: stepLabel(f.step) })}
            message={t("addPerson.fail.unknownBody")}
            retryLabel={t("addPerson.checkAgain")}
            onRetry={() => act("checkAgain")}
            undo={stop}
            busy={retryBusy}
          />
        );
    }
  };

  let decision: ReactNode = null;
  if (phase.kind === "failed") {
    decision = (
      <div className="flex flex-col gap-3">
        {asking ? (
          <div className="flex max-w-[40rem] flex-col gap-2">
            <p className="text-sm">{t("addPerson.fail.passwordAgain")}</p>
            <NewPasswordFields
              password={{
                label: t("addPerson.password.label"),
                error:
                  checked && (problem === "empty" || problem === "lineBreak")
                    ? problem === "lineBreak"
                      ? t("password.lineBreak")
                      : t("addPerson.password.empty")
                    : undefined,
                value: password,
                onValueChange: setPassword,
                inputRef: passwordRef,
              }}
              confirmation={{
                label: t("addPerson.password.again"),
                error:
                  checked && problem === "mismatch"
                    ? t("password.mismatch")
                    : undefined,
                value: again,
                onValueChange: setAgain,
              }}
              revealLabels={{
                show: t("password.show"),
                hide: t("password.hide"),
              }}
              notice={notice}
              disabled={busy !== null}
            />
          </div>
        ) : null}
        {failure(phase.failure)}
      </div>
    );
  } else if (phase.kind === "alsoPending") {
    decision = (
      <AlsoPendingPrompt
        title={t("addStorage.alsoTitle")}
        applyLabel={t("addStorage.applyToo")}
        stopLabel={t("addPerson.fail.stopHere")}
        onApply={() => addPersonAction("applyToo")}
        onStop={() => addPersonAction("stop")}
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

  const accessNames = Object.entries(choices.access)
    .filter(([, access]) => access === "rw" || access === "ro")
    .map(([uuid]) => choices.folderNames[uuid] ?? uuid);
  let result;
  let links: ReactNode = null;
  if (phase.kind === "done") {
    result = {
      status: "succeeded" as const,
      statusLabel: t("addStorage.state.succeeded"),
      message: (
        <>
          <span className="block font-semibold">
            {t("addPerson.done.title", { name: shown })}
          </span>
          <span className="block">
            {accessNames.length > 0 ? (
              <Trans
                i18nKey="addPerson.done.access"
                values={{ list: listOf(accessNames) }}
                components={slot}
              />
            ) : (
              t("addPerson.done.noAccess")
            )}
          </span>
          <span className="block">{t("addPerson.done.account")}</span>
        </>
      ),
    };
    links = (
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <PersonLink
          name={name}
          label={t("addPerson.done.open", { name: inertBidi(name) })}
        />
        <Link
          to="/usermgmt/users/add"
          className={routerLinkClass}
          onClick={() => {
            clearAddPersonDraft();
            clearAddPerson();
          }}
        >
          {t("addPerson.done.another")}
        </Link>
      </p>
    );
  } else if (phase.kind === "stopped" || phase.kind === "deleted") {
    result = {
      status: "cancelled" as const,
      statusLabel: t("addStorage.state.cancelled"),
      message:
        phase.kind === "deleted" ? (
          <>
            <span className="block">
              {t("addPerson.fail.deletedAgain", { name: shown })}
            </span>
            <span className="block">{t("addPerson.fail.deleteAgainBody")}</span>
          </>
        ) : (
          <>
            <span className="block">{t("addStorage.stopped")}</span>
            {run.made ? <span className="block">{stopBody}</span> : null}
          </>
        ),
    };
    links = (
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {phase.kind === "stopped" && run.made ? (
          <PersonLink
            name={name}
            label={t("addPerson.done.open", { name: inertBidi(name) })}
          />
        ) : null}
        <Link to="/usermgmt/users" className={routerLinkClass}>
          {t("person.toList")}
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
          clearAddPersonDraft();
          clearAddPerson();
        }}
      />
      {links}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("addPerson.fail.deleteAgainTitle", { name: shown })}
        description={
          <>
            <span className="block">{t("addPerson.fail.deleteAgainBody")}</span>
            {choices.homeFolder === null ? null : (
              <span className="mt-2 block">
                <Trans
                  i18nKey="personDelete.stays.home"
                  components={{
                    folder: <FolderNameText value={choices.homeFolder} />,
                    ...slot,
                  }}
                />
              </span>
            )}
          </>
        }
        cancelLabel={t("personDelete.cancel")}
        confirmLabel={t("addPerson.fail.deleteAgain", { name: shown })}
        onConfirm={() => {
          setConfirmDelete(false);
          addPersonAction("deleteAgain");
        }}
      />
    </div>
  );
}
