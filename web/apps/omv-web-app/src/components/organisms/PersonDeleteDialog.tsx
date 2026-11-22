// SPDX-License-Identifier: GPL-3.0-or-later
// The dialog that deletes a person (phase 5 users design 7.2 to 7.5; UI-8; P9, D12). It opens at once
// and reads again what the deletion rests on ("Checking what uses {{name}}…"), then shows a refusal,
// "{{name}} is no longer on this NAS.", the pre-flight when other changes are pending (apply or undo
// them first: the deletion applies its own change straight after), or the confirmation: destructive,
// "What goes" and "What stays", taking them off the folders' access lists ticked by default with what
// is left when they were the only one, the sentence about settings this page cannot list, and the
// name typed (exact, spaces around ignored). Focus starts on Cancel; Enter never confirms. Confirming
// checks once more ("Checking again…"), then the step list runs here (deletePersonFlow.ts). Nothing
// closes the dialog while a step runs.
import type { UserAccount } from "@omv-webui/react-api-omv/generated";
import { taskRegistry, useTasks } from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  AlsoPendingNotice,
  AlsoPendingPrompt,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  JobFailure,
  JobStepList,
  PreflightNotice,
  ServerMessage,
  TypeToConfirmDialog,
  type JobStep,
  type TaskStatus,
} from "@omv-webui/react-ui-components";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { isolateName } from "../../format/isolate.ts";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useUsersApi } from "../../hooks/useUsersApi.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import {
  checkDelete,
  dismissPersonDelete,
  leftWithNobody,
  personDeleteDecision,
  personDeleteOf,
  personDeletes,
  startPersonDelete,
  type DeleteBlocker,
  type DeleteCheck,
  type DeleteFacts,
  type DeleteStep,
} from "../../users/deletePersonFlow.ts";
import type { SelfReading } from "../../users/userModel.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { PersonNameText } from "../atoms/PersonNameText.tsx";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { StepTask } from "../molecules/StepTask.tsx";
import { ApplyChangesDialog, UndoChangesDialog } from "./PendingChanges.tsx";

type Phase =
  | { kind: "checking" }
  | DeleteCheck
  | { kind: "rechecking"; facts: DeleteFacts }
  | { kind: "run" };

const STATES: readonly TaskStatus[] = [
  "waiting",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export type PersonDeleteOutcome = "done" | "stopped" | "unknown";

const listOf = (names: readonly string[]) =>
  new Intl.ListFormat(undefined, { type: "conjunction" }).format(
    names.map(isolateName),
  );

/** One blocker in words (7.1), for the section and the dialog's refusal. */
export function DeleteBlockerWords({
  blocker,
  name,
  onRetry,
}: {
  blocker: DeleteBlocker;
  name: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  switch (blocker.kind) {
    case "self":
      return <>{t("personDelete.blocked.self")}</>;
    case "unknownSelf":
      return <>{t("personCan.adminUnknownSelf")}</>;
    case "running":
      return (
        <>
          {t("personDelete.blocked.running", {
            action: t(`users.action.${blocker.action}`),
          })}
        </>
      );
    case "unread":
      return (
        <span className="flex flex-col items-start gap-1">
          <span>
            <Trans
              i18nKey="personDelete.blocked.unread"
              components={{ name: <PersonNameText value={name} /> }}
            />
          </span>
          {isRpcError(blocker.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {blocker.error.message}
            </ServerMessage>
          ) : null}
          {onRetry === undefined ? null : (
            <Button variant="neutral" size="sm" onClick={onRetry}>
              {t("common.tryAgain")}
            </Button>
          )}
        </span>
      );
  }
}

export function PersonDeleteDialog({
  open,
  onClose,
  person,
  self,
  openerRef,
  onShowCurrent,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** The person as the page shows them. */
  person: UserAccount;
  self: SelfReading;
  openerRef?: RefObject<HTMLElement | null>;
  /** The person changed since the page read them: the page reads them again. */
  onShowCurrent: () => void;
  /** The deletion ended (done, or stopped with something left), or a cut request was closed. */
  onDone: (outcome: PersonDeleteOutcome, stoppedAt?: DeleteStep) => void;
}) {
  const { t } = useTranslation();
  const api = useUsersApi();
  const fsApi = useFsApi();
  const tasks = useTasks();
  useMemoryStore(personDeletes);
  const name = person.name;
  const run = personDeleteOf(name);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const decisionRef = useRef<HTMLDivElement>(null);
  const checksRef = useRef(0);
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [takeOff, setTakeOff] = useState(true);
  const [confirming, setConfirming] = useState<"apply" | "undo" | null>(null);
  const [preflightTask, setPreflightTask] = useState<{
    id: number;
    action: "apply" | "undo";
  } | null>(null);
  const slot = { name: <PersonNameText value={name} /> };

  const check = () => checkDelete(api, person, self);
  /** The check's reads, then its outcome; the caller shows "Checking…" first when it needs to. */
  const readCheck = () => {
    const mine = ++checksRef.current;
    void check().then(
      (next) => {
        if (checksRef.current === mine) {
          setPhase(next);
        }
      },
      (error: unknown) => {
        if (checksRef.current === mine) {
          setPhase({ kind: "refused", blocker: { kind: "unread", error } });
        }
      },
    );
  };
  const runCheck = () => {
    setPhase({ kind: "checking" });
    readCheck();
  };

  // Reset on the opening edge, during render; the check runs in an effect.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTakeOff(true);
      setPreflightTask(null);
      setPhase(run === undefined ? { kind: "checking" } : { kind: "run" });
    }
  }
  const needsCheck = open && phase.kind === "checking" && run === undefined;
  const checkOnOpen = useEffectEvent(() => readCheck());
  useEffect(() => {
    if (needsCheck) {
      checkOnOpen();
    }
  }, [needsCheck]);

  const runPhase = run?.phase.kind;
  const ended = useEffectEvent((outcome: PersonDeleteOutcome) => {
    const last = personDeleteOf(name);
    const at = last?.phase.kind === "stopped" ? last.phase.at : undefined;
    dismissPersonDelete(name);
    onDone(outcome, at);
  });
  useEffect(() => {
    if (
      runPhase === "failed" ||
      runPhase === "alsoPending" ||
      runPhase === "unknown"
    ) {
      decisionRef.current?.focus();
    }
    if (runPhase === "done") {
      ended("done");
    }
    if (runPhase === "stopped") {
      ended("stopped");
    }
  }, [runPhase, name]);

  const preflightRunning =
    preflightTask !== null &&
    tasks.find((task) => task.id === preflightTask.id)?.state === "running";
  const runPreflight = (action: "apply" | "undo") => {
    setConfirming(null);
    const id = taskRegistry.start(
      t(action === "apply" ? "pending.applyTask" : "pending.undoTask"),
      action === "apply"
        ? fsApi.apply({ modules: [], force: false })
        : fsApi.revert(),
    );
    setPreflightTask({ id, action });
    const off = taskRegistry.onSettled((task) => {
      if (task.id === id) {
        off();
        runCheck();
      }
    });
  };

  const confirm = async () => {
    if (phase.kind !== "confirm") {
      return;
    }
    const mine = ++checksRef.current;
    setPhase({ kind: "rechecking", facts: phase.facts });
    let next: DeleteCheck;
    try {
      next = await check();
    } catch (error) {
      next = { kind: "refused", blocker: { kind: "unread", error } };
    }
    if (checksRef.current !== mine) {
      return;
    }
    if (next.kind !== "confirm") {
      setPhase(next);
      return;
    }
    const started = startPersonDelete(
      {
        users: api,
        apply: () => fsApi.apply({ modules: [], force: false }),
      },
      next.facts,
      takeOff && next.facts.listedIn.length > 0,
      { apply: t("pending.applyTask") },
    );
    setPhase(started ? { kind: "run" } : next);
  };

  const close = () => {
    checksRef.current += 1;
    onClose();
  };
  const running =
    run !== undefined && (run.busy || run.phase.kind === "running");
  const title = t("personDelete.dialog.title", { name: isolateName(name) });

  // ---- The confirmation (7.3) ------------------------------------------------------------------------
  if (phase.kind === "confirm" || phase.kind === "rechecking") {
    const { facts } = phase;
    const goes: ReactNode[] = [
      <Trans
        key="account"
        i18nKey="personDelete.goes.account"
        components={slot}
      />,
    ];
    if (facts.admin) {
      goes.push(t("personDelete.goes.admin"));
    }
    if (facts.ssh) {
      goes.push(t("personDelete.goes.ssh"));
    }
    if (facts.keys > 0) {
      goes.push(t("personDelete.goes.keys", { count: facts.keys }));
    }
    if (facts.groups.length > 0) {
      goes.push(
        t("personDelete.goes.groups", { groups: listOf(facts.groups) }),
      );
    }
    if ((facts.person.email ?? "") !== "") {
      goes.push(
        <Trans
          key="email"
          i18nKey="personDelete.goes.email"
          components={{
            email: <IdentifierText value={facts.person.email ?? ""} />,
          }}
        />,
      );
    }
    const stays: ReactNode[] = [t("personDelete.stays.files")];
    if (facts.home !== null) {
      stays.push(
        <Trans
          key="home"
          i18nKey="personDelete.stays.home"
          components={{
            folder: <FolderNameText value={facts.home.name} />,
            ...slot,
          }}
        />,
      );
    }
    const nobody = leftWithNobody(facts.listedIn);
    return (
      <TypeToConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && phase.kind !== "rechecking") {
            close();
          }
        }}
        title={title}
        sections={[
          { title: t("personDelete.goes.title"), items: goes },
          { title: t("personDelete.stays.title"), items: stays },
        ]}
        checkbox={
          facts.listedIn.length > 0
            ? {
                label: (
                  <Trans
                    i18nKey="personDelete.access"
                    count={facts.listedIn.length}
                    values={{
                      list: listOf(facts.listedIn.map((l) => l.folder.name)),
                    }}
                    components={slot}
                  />
                ),
                hint: (
                  <Trans i18nKey="personDelete.accessHint" components={slot} />
                ),
                note:
                  nobody.length > 0 ? (
                    <Trans
                      i18nKey="personDelete.leavesNobody"
                      values={{
                        folders: listOf(nobody.map((l) => l.folder.name)),
                      }}
                      components={slot}
                    />
                  ) : undefined,
                checked: takeOff,
                onCheckedChange: setTakeOff,
              }
            : undefined
        }
        confirmText={name}
        prompt={t("personDelete.typePrompt", { name })}
        confirmLabel={
          phase.kind === "rechecking"
            ? t("personDelete.checkingAgain")
            : t("personDelete.confirm")
        }
        cancelLabel={t("personDelete.cancel")}
        pending={phase.kind === "rechecking"}
        onConfirm={() => void confirm()}
      >
        <p className="text-sm">
          <Trans i18nKey="personDelete.elsewhere" components={slot} />
        </p>
      </TypeToConfirmDialog>
    );
  }

  // ---- Everything else: checking, a refusal, the pre-flight, the run -------------------------------
  let shownTitle: ReactNode = title;
  let description: ReactNode = null;
  let body: ReactNode = null;

  if (phase.kind === "run" && run !== undefined) {
    const failure = run.phase.kind === "failed" ? run.phase : null;
    const statusLabels = Object.fromEntries(
      STATES.map((s) => [s, t(`addStorage.state.${s}`)]),
    ) as Record<TaskStatus, string>;
    const steps: JobStep[] = [
      {
        id: "delete",
        label: t("personDelete.step.delete"),
        status: run.steps.delete.status,
      },
      ...(run.folders.length > 0
        ? [
            {
              id: "access",
              label: t("personDelete.step.access", { name: isolateName(name) }),
              status: run.steps.access.status,
            },
          ]
        : []),
      {
        id: "save",
        label: t("personDelete.step.save"),
        status: run.steps.save.status,
        detail:
          run.steps.save.taskId === undefined ? undefined : (
            <StepTask
              taskId={run.steps.save.taskId}
              label={t("personDelete.step.save")}
              failed={failure?.at === "save"}
            />
          ),
      },
    ];
    const serverMessage = (error: unknown) =>
      isRpcError(error)
        ? { label: t("app.serverMessage"), text: error.message }
        : undefined;
    let decision: ReactNode = null;
    if (failure !== null && failure.at === "delete") {
      decision = (
        <JobFailure
          title={t("personDelete.failed.title", { name: isolateName(name) })}
          message={
            failure.error === undefined
              ? t("personDelete.failed.stillThere", { name: isolateName(name) })
              : t("addStorage.stopped")
          }
          serverMessage={serverMessage(failure.error)}
          retryLabel={t("zfsDelete.close")}
          onRetry={() => {
            dismissPersonDelete(name);
            close();
          }}
        />
      );
    } else if (failure !== null && failure.at === "access") {
      decision = (
        <JobFailure
          title={
            <Trans
              i18nKey="personDelete.failed.access"
              values={{ folders: listOf(failure.folders ?? []) }}
              components={slot}
            />
          }
          message={t("personDelete.failed.accessStop")}
          serverMessage={serverMessage(failure.error)}
          retryLabel={t("addPerson.tryStep")}
          onRetry={() => personDeleteDecision(name, "retryAccess")}
          undo={{
            label: t("addPerson.fail.stopHere"),
            onUndo: () => personDeleteDecision(name, "stop"),
          }}
          busy={run.busy ? "retry" : undefined}
        />
      );
    } else if (failure !== null) {
      decision = (
        <JobFailure
          title={t("personDelete.failed.save")}
          message={
            <Trans i18nKey="personDelete.failed.saveBody" components={slot} />
          }
          serverMessage={serverMessage(failure.error)}
          retryLabel={t("pending.retry")}
          onRetry={() => personDeleteDecision(name, "retrySave")}
          undo={{
            label: t("addPerson.fail.stopHere"),
            onUndo: () => personDeleteDecision(name, "stop"),
          }}
          busy={run.busy ? "retry" : undefined}
        />
      );
    } else if (run.phase.kind === "alsoPending") {
      decision = (
        <AlsoPendingPrompt
          title={t("addStorage.alsoTitle")}
          applyLabel={t("addStorage.applyToo")}
          stopLabel={t("zfsDelete.stop")}
          onApply={() => personDeleteDecision(name, "applyToo")}
          onStop={() => personDeleteDecision(name, "stop")}
          busy={run.busy ? "apply" : undefined}
        >
          <AlsoPendingNotice>
            <Trans
              i18nKey="zfsDelete.alsoBody"
              components={{ list: <ModuleNames ids={run.phase.others} /> }}
            />
          </AlsoPendingNotice>
        </AlsoPendingPrompt>
      );
    } else if (run.phase.kind === "unknown") {
      decision = (
        <JobFailure
          title={t("personDelete.unknown", { name: isolateName(name) })}
          message={null}
          retryLabel={t("personDelete.checkAgain")}
          onRetry={() => personDeleteDecision(name, "checkAgain")}
          undo={{
            label: t("zfsDelete.close"),
            onUndo: () => {
              dismissPersonDelete(name);
              onDone("unknown");
            },
          }}
          busy={run.busy ? "retry" : undefined}
        />
      );
    }
    description = t("personDelete.step.delete");
    body = (
      <div className="flex flex-col gap-3">
        <JobStepList
          label={t("addStorage.steps")}
          statusLabels={statusLabels}
          steps={steps}
        />
        <div ref={decisionRef} tabIndex={-1} className="outline-hidden">
          {decision}
        </div>
      </div>
    );
  } else {
    switch (phase.kind) {
      case "checking":
      case "run":
        description = t("personDelete.checking", { name: isolateName(name) });
        break;
      case "refused":
        shownTitle = t("personDelete.blockedTitle", {
          name: isolateName(name),
        });
        description = (
          <DeleteBlockerWords
            blocker={phase.blocker}
            name={name}
            onRetry={phase.blocker.kind === "unread" ? runCheck : undefined}
          />
        );
        break;
      case "gone":
        shownTitle = t("personDelete.blockedTitle", {
          name: isolateName(name),
        });
        description = t("personDelete.gone", { name: isolateName(name) });
        break;
      case "changed":
        shownTitle = t("personDelete.blockedTitle", {
          name: isolateName(name),
        });
        description = (
          <span className="flex flex-col items-start gap-2">
            <span>
              <Trans i18nKey="person.changedElsewhere" components={slot} />
            </span>
            <Button
              variant="neutral"
              size="sm"
              onClick={() => {
                close();
                onShowCurrent();
              }}
            >
              {t("person.showCurrent")}
            </Button>
          </span>
        );
        break;
      case "preflight":
        description = t("shareDelete.preflightTitle");
        body = (
          <PreflightNotice
            title={t("shareDelete.preflightTitle")}
            applyLabel={t("zfsDelete.applyThem")}
            undoLabel={t("zfsDelete.undoThem")}
            onApply={() => setConfirming("apply")}
            onUndo={() => setConfirming("undo")}
            busy={preflightRunning ? preflightTask.action : undefined}
          >
            <p>
              {t("pending.message", { count: phase.modules.length })}{" "}
              <ModuleNames ids={phase.modules} />
            </p>
            <p>{t("personDelete.preflightBody")}</p>
          </PreflightNotice>
        );
        break;
    }
  }

  const closeWord =
    phase.kind === "checking" || phase.kind === "preflight"
      ? t("personDelete.cancel")
      : t("zfsDelete.close");
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !running) {
            close();
          }
        }}
        disablePointerDismissal
      >
        <DialogContent
          role="alertdialog"
          aria-busy={phase.kind === "checking" || running || undefined}
          initialFocus={cancelRef}
          finalFocus={openerRef}
        >
          <DialogTitle className="[overflow-wrap:anywhere]">
            {shownTitle}
          </DialogTitle>
          <DialogDescription
            render={<div />}
            className="flex flex-col gap-2 text-foreground"
          >
            {description}
          </DialogDescription>
          {body}
          <DialogFooter>
            <DialogClose
              ref={cancelRef}
              disabled={running}
              render={<Button variant="neutral" focusableWhenDisabled />}
            >
              {closeWord}
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {phase.kind === "preflight" ? (
        <>
          <ApplyChangesDialog
            open={confirming === "apply"}
            onOpenChange={(o) => !o && setConfirming(null)}
            modules={phase.modules}
            onConfirm={() => runPreflight("apply")}
          />
          <UndoChangesDialog
            open={confirming === "undo"}
            onOpenChange={(o) => !o && setConfirming(null)}
            modules={phase.modules}
            onConfirm={() => runPreflight("undo")}
          />
        </>
      ) : null}
    </>
  );
}
