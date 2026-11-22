// SPDX-License-Identifier: GPL-3.0-or-later
// The dialog that deletes a group (phase 5 users design 11.2 to 11.4; UI-8; P10). It opens at once and
// reads again what the deletion rests on ("Checking what uses {{group}}…"), then shows a refusal,
// "{{group}} is no longer on this NAS.", the pre-flight when other changes are pending (apply or undo
// them first: the deletion applies its own change straight after, R1), or the confirmation:
// destructive, no typed name (no file is touched and nobody loses their account, P10): who is taken
// out and the access they lose through it, and the box, ticked by default, that takes the group off the
// folders' access lists (D12), with the "nobody can open" line when that applies. Focus starts on
// Cancel; Enter never confirms.
//
// Confirming checks once more ("Checking again…"), then the step list runs here (deleteGroupFlow.ts).
// Nothing closes the dialog while a step runs.
import type { UserGroup } from "@omv-webui/react-api-omv/generated";
import { taskRegistry, useTasks } from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  AlsoPendingNotice,
  AlsoPendingPrompt,
  Button,
  CheckboxField,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  JobFailure,
  JobStepList,
  PreflightNotice,
  type TaskStatus,
} from "@omv-webui/react-ui-components";
import { TriangleAlert } from "lucide-react";
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
import {
  dismissGroupDelete,
  groupDeleteDecision,
  groupDeleteOf,
  groupDeletes,
  groupDeleteSteps,
  startGroupDelete,
  type GroupDeleteStep,
} from "../../groups/deleteGroupFlow.ts";
import { useGroupsApi } from "../../hooks/useGroupsApi.ts";
import { useNamesText } from "../../hooks/useNamesText.ts";
import { useSharesApi } from "../../hooks/useSharesApi.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import type { ListedIn } from "../../users/accessByAccount.ts";
import { GroupNameText } from "../atoms/GroupNameText.tsx";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { StepTask } from "../molecules/StepTask.tsx";
import { ApplyChangesDialog, UndoChangesDialog } from "./PendingChanges.tsx";

export type GroupDeleteCheck =
  | { kind: "refused"; body: ReactNode }
  | { kind: "gone" }
  | { kind: "preflight"; modules: string[] }
  | {
      kind: "confirm";
      /** The group as getGroup read it just now. */
      group: UserGroup;
      /** Its members, as read (the putBack list). */
      members: string[];
      /** The folders whose lists name the group. */
      listing: ListedIn[];
    };

type Phase =
  | { kind: "checking" }
  | GroupDeleteCheck
  | {
      kind: "rechecking";
      previous: Extract<GroupDeleteCheck, { kind: "confirm" }>;
    }
  | { kind: "run" };

const STATES: readonly TaskStatus[] = [
  "waiting",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export type GroupDeleteOutcome = "done" | "pending" | "putBack" | "unknown";

/** Only the folders that give access (Read and write or Read only), with that word. */
const givesAccess = (listing: readonly ListedIn[]) =>
  listing.filter((l) => l.access === "rw" || l.access === "ro");

export function GroupDeleteDialog({
  open,
  onClose,
  name,
  check,
  openerRef,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** The group's name, as the page read it; the run is kept by it. */
  name: string;
  /** Read again what the deletion rests on. */
  check: () => Promise<GroupDeleteCheck>;
  openerRef?: RefObject<HTMLElement | null>;
  /** The run ended (done; stopped with the change pending; members put back) or could not be told. */
  onDone: (outcome: GroupDeleteOutcome) => void;
}) {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const sharesApi = useSharesApi();
  const tasks = useTasks();
  const namesText = useNamesText();
  useMemoryStore(groupDeletes);
  const run = groupDeleteOf(name);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const decisionRef = useRef<HTMLDivElement>(null);
  const checksRef = useRef(0);
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [offLists, setOffLists] = useState(true);
  const [confirming, setConfirming] = useState<"apply" | "undo" | null>(null);
  const [preflightTask, setPreflightTask] = useState<{
    id: number;
    action: "apply" | "undo";
  } | null>(null);

  const unreadBody = (
    <Trans
      i18nKey="groupDelete.blocked.unread"
      components={{ group: <GroupNameText value={name} /> }}
    />
  );

  /** Reads again; the phase is "checking" already (on opening) or set by the caller. */
  const startCheck = () => {
    const mine = ++checksRef.current;
    void check().then(
      (next) => {
        if (checksRef.current === mine) {
          setPhase(next);
        }
      },
      () => {
        if (checksRef.current === mine) {
          setPhase({ kind: "refused", body: unreadBody });
        }
      },
    );
  };

  const runCheck = () => {
    setPhase({ kind: "checking" });
    startCheck();
  };

  // Reset on the opening edge, during render; the check runs in an effect.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOffLists(true);
      setPreflightTask(null);
      setPhase(run === undefined ? { kind: "checking" } : { kind: "run" });
    }
  }
  const needsCheck = open && phase.kind === "checking" && run === undefined;
  const checkOnOpen = useEffectEvent(() => startCheck());
  useEffect(() => {
    if (needsCheck) {
      checkOnOpen();
    }
  }, [needsCheck]);

  const runPhase = run?.phase.kind;
  const done = useEffectEvent((outcome: GroupDeleteOutcome) => {
    dismissGroupDelete(name);
    onDone(outcome);
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
      done("done");
    }
    if (runPhase === "stopped") {
      done("pending");
    }
    if (runPhase === "putBack") {
      done("putBack");
    }
  }, [runPhase, name]);

  const preflightRunning =
    preflightTask !== null &&
    tasks.find((task) => task.id === preflightTask.id)?.state === "running";
  const runPreflight = (action: "apply" | "undo") => {
    setConfirming(null);
    const id = taskRegistry.start(
      t(action === "apply" ? "pending.applyTask" : "pending.undoTask"),
      action === "apply" ? api.apply() : api.revert(),
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
    setPhase({ kind: "rechecking", previous: phase });
    let next: GroupDeleteCheck;
    try {
      next = await check();
    } catch {
      next = { kind: "refused", body: unreadBody };
    }
    if (checksRef.current !== mine) {
      return;
    }
    if (next.kind !== "confirm") {
      setPhase(next);
      return;
    }
    const started = startGroupDelete(
      {
        setGroup: api.setGroup,
        deleteGroup: api.deleteGroup,
        group: api.group,
        folders: api.folders,
        users: api.users,
        groups: api.groups,
        shares: api.shares,
        setPrivileges: sharesApi.setPrivileges,
        pending: api.pending,
        apply: api.apply,
      },
      {
        name,
        comment: next.group.comment ?? "",
        members: next.members,
        access: offLists ? next.listing.map((l) => l.folder.uuid) : [],
      },
      { apply: t("pending.applyTask") },
    );
    setPhase(started ? { kind: "run" } : phase);
  };

  const running =
    run !== undefined && (run.busy || run.phase.kind === "running");
  const statusLabels = Object.fromEntries(
    STATES.map((s) => [s, t(`addStorage.state.${s}`)]),
  ) as Record<TaskStatus, string>;
  const groupSlot = <GroupNameText value={name} />;
  const plainName = isolateName(name);

  let title: ReactNode = t("groupDelete.dialog.title", { group: plainName });
  let description: ReactNode = null;
  let body: ReactNode = null;
  let destructive = false;

  if (phase.kind === "run" && run !== undefined) {
    const failure = run.phase.kind === "failed" ? run.phase : null;
    const stepLabel = (id: GroupDeleteStep) =>
      t(`groupDelete.step.${id}`, { group: plainName });
    description = stepLabel(groupDeleteSteps(run.input)[0] ?? "delete");
    const serverMessage = (error: unknown) =>
      isRpcError(error)
        ? { label: t("app.serverMessage"), text: error.message }
        : undefined;
    let decision: ReactNode = null;
    if (failure !== null) {
      switch (failure.at) {
        case "empty":
          decision = (
            <JobFailure
              title={t("groupDelete.failed.empty", { group: plainName })}
              message={t("addStorage.stopped")}
              serverMessage={serverMessage(failure.error)}
              retryLabel={t("zfsDelete.close")}
              onRetry={() => {
                dismissGroupDelete(name);
                onClose();
              }}
            />
          );
          break;
        case "delete":
          decision = run.emptied ? (
            <JobFailure
              title={
                <Trans
                  i18nKey="groupDelete.failed.delete"
                  components={{ group: groupSlot }}
                />
              }
              message={
                failure.error === undefined
                  ? t("groupDelete.failed.notDeleted", { group: plainName })
                  : null
              }
              serverMessage={serverMessage(failure.error)}
              retryLabel={t("addPerson.tryAgain")}
              onRetry={() => groupDeleteDecision(name, "retryDelete")}
              undo={{
                label: t("groupDelete.putBack"),
                onUndo: () => groupDeleteDecision(name, "putBack"),
              }}
              busy={run.busy ? "retry" : undefined}
            />
          ) : (
            <JobFailure
              title={t("groupDelete.failed.notDeleted", { group: plainName })}
              message={null}
              serverMessage={serverMessage(failure.error)}
              retryLabel={t("zfsDelete.close")}
              onRetry={() => {
                dismissGroupDelete(name);
                onClose();
              }}
            />
          );
          break;
        case "access":
          decision = (
            <JobFailure
              title={
                <Trans
                  i18nKey="groupDelete.failed.access"
                  values={{
                    folders: namesText(failure.folders ?? [], 5),
                  }}
                  components={{ group: groupSlot }}
                />
              }
              message={t("personDelete.failed.accessStop")}
              serverMessage={serverMessage(failure.error)}
              retryLabel={t("addPerson.tryStep")}
              onRetry={() => groupDeleteDecision(name, "retryAccess")}
              undo={{
                label: t("addPerson.fail.stopHere"),
                onUndo: () => groupDeleteDecision(name, "stop"),
              }}
              busy={run.busy ? "retry" : undefined}
            />
          );
          break;
        case "save":
          decision = (
            <JobFailure
              title={t("shareDelete.saveFailedTitle")}
              message={
                <Trans
                  i18nKey="groupDelete.failed.saveBody"
                  components={{ group: groupSlot }}
                />
              }
              serverMessage={serverMessage(failure.error)}
              retryLabel={t("addPerson.tryApply")}
              onRetry={() => groupDeleteDecision(name, "retrySave")}
              undo={{
                label: t("addPerson.fail.stopHere"),
                onUndo: () => groupDeleteDecision(name, "stop"),
              }}
              busy={run.busy ? "retry" : undefined}
            />
          );
          break;
      }
    } else if (run.phase.kind === "alsoPending") {
      decision = (
        <AlsoPendingPrompt
          title={t("addStorage.alsoTitle")}
          applyLabel={t("addStorage.applyToo")}
          stopLabel={t("addPerson.fail.stopHere")}
          onApply={() => groupDeleteDecision(name, "applyToo")}
          onStop={() => groupDeleteDecision(name, "stop")}
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
          title={t("groupDelete.unknown", { group: plainName })}
          message={null}
          retryLabel={t("personDelete.checkAgain")}
          onRetry={() => groupDeleteDecision(name, "checkAgain")}
          undo={{
            label: t("zfsDelete.close"),
            onUndo: () => {
              dismissGroupDelete(name);
              onDone("unknown");
            },
          }}
          busy={run.busy ? "retry" : undefined}
        />
      );
    }
    body = (
      <div className="flex flex-col gap-3">
        <JobStepList
          label={t("addStorage.steps")}
          statusLabels={statusLabels}
          steps={groupDeleteSteps(run.input).map((id) => {
            const state = run.steps[id] ?? { status: "waiting" as const };
            return {
              id,
              label: stepLabel(id),
              status: state.status,
              detail:
                id === "save" && state.taskId !== undefined ? (
                  <StepTask
                    taskId={state.taskId}
                    label={stepLabel("save")}
                    failed={failure?.at === "save"}
                  />
                ) : undefined,
            };
          })}
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
        description = t("personDelete.checking", { name: plainName });
        break;
      case "refused":
        title = t("groupDelete.blockedTitle", { group: plainName });
        description = phase.body;
        break;
      case "gone":
        title = t("groupDelete.blockedTitle", { group: plainName });
        description = t("groupDelete.gone", { group: plainName });
        break;
      case "preflight":
        description = t("groupDelete.preflightTitle");
        body = (
          <PreflightNotice
            title={t("groupDelete.preflightTitle")}
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
            <p>{t("groupDelete.preflightBody")}</p>
          </PreflightNotice>
        );
        break;
      case "confirm":
      case "rechecking": {
        destructive = true;
        const shown = phase.kind === "confirm" ? phase : phase.previous;
        const count = shown.members.length;
        const access = givesAccess(shown.listing);
        const list = namesText(shown.members, 5);
        description =
          count === 0
            ? t("groupDelete.nobody")
            : access.length === 0
              ? t("groupDelete.membersNoAccess", { count, list })
              : t("groupDelete.members", {
                  count,
                  list,
                  folders: new Intl.ListFormat(undefined, {
                    type: "conjunction",
                  }).format(
                    access.map((l) =>
                      t("groupDelete.folderAccess", {
                        folder: isolateName(l.folder.name),
                        access: t(`access.${l.access}`),
                      }),
                    ),
                  ),
                });
        const nobody = shown.listing.filter((l) => l.leavesNobody);
        body =
          shown.listing.length === 0 ? null : (
            <CheckboxField
              label={
                <Trans
                  i18nKey="groupDelete.access"
                  count={shown.listing.length}
                  values={{
                    count: shown.listing.length,
                    list: namesText(
                      shown.listing.map((l) => l.folder.name),
                      5,
                    ),
                  }}
                  components={{ group: groupSlot }}
                />
              }
              hint={
                <Trans
                  i18nKey="groupDelete.accessHint"
                  components={{ group: groupSlot }}
                />
              }
              warning={
                offLists && nobody.length > 0 ? (
                  <Trans
                    i18nKey="groupDelete.leavesNobody"
                    values={{
                      folders: namesText(
                        nobody.map((l) => l.folder.name),
                        5,
                      ),
                    }}
                    components={{ group: groupSlot }}
                  />
                ) : undefined
              }
              checked={offLists}
              onCheckedChange={(checked) => setOffLists(checked === true)}
            />
          );
        break;
      }
    }
  }

  const confirmShown = phase.kind === "confirm" || phase.kind === "rechecking";
  const closeWord =
    confirmShown || phase.kind === "checking" || phase.kind === "preflight"
      ? t("personDelete.cancel")
      : t("zfsDelete.close");
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !running) {
            checksRef.current += 1;
            onClose();
          }
        }}
        disablePointerDismissal
      >
        <DialogContent
          role="alertdialog"
          aria-busy={
            phase.kind === "checking" ||
            phase.kind === "rechecking" ||
            running ||
            undefined
          }
          initialFocus={cancelRef}
          finalFocus={openerRef}
        >
          <div className="flex items-start gap-3">
            {destructive ? (
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-foreground"
              />
            ) : null}
            <div className="flex min-w-0 flex-col gap-1.5">
              <DialogTitle className="[overflow-wrap:anywhere]">
                {title}
              </DialogTitle>
              <DialogDescription
                render={<div />}
                className="flex flex-col gap-2 text-foreground"
              >
                {description}
              </DialogDescription>
            </div>
          </div>
          {body}
          <DialogFooter>
            <DialogClose
              ref={cancelRef}
              disabled={running}
              render={<Button variant="neutral" focusableWhenDisabled />}
            >
              {closeWord}
            </DialogClose>
            {confirmShown ? (
              <Button
                variant="destructive"
                loading={phase.kind === "rechecking"}
                onClick={() => void confirm()}
              >
                {phase.kind === "rechecking"
                  ? t("personDelete.checkingAgain")
                  : t("groupDelete.confirm")}
              </Button>
            ) : null}
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
