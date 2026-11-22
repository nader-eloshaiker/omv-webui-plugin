// SPDX-License-Identifier: GPL-3.0-or-later
// The deletion dialog of a snapshot, a file system and a pool (phase 5 ZFS design 5.5, 9; owner, P7 to
// P9, P15). It opens at once and reads again what the deletion rests on, then shows a refusal that
// appeared meanwhile, "no longer exists", the pre-flight when other changes are pending (an undo could
// not bring the object back, so they are applied or undone first), or the confirmation: red, with the
// object's name typed (UI-8). "Delete …" checks once more. Then the step list runs in the dialog: the
// deletion as a task, and the change saved (R10); a failure stays here with the server's words, the
// checkpoint with "Try again" first (R7). Focus starts on Cancel, Enter never confirms, the scrim does
// not close it, and nothing closes it while a step runs.
import type { ZfsDeleteObjectRequest } from "@omv-webui/react-api-omv/generated";
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
  TypeToConfirmField,
  typedMatches,
  type TaskStatus,
} from "@omv-webui/react-ui-components";
import { TriangleAlert } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useZfsApi } from "../../hooks/useZfsApi.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import {
  deleteDecision,
  deleteRunOf,
  dismissDelete,
  startDelete,
  zfsActions,
  type DeleteKind,
} from "../../zfs/zfsActions.ts";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { StepTask } from "../molecules/StepTask.tsx";
import { ApplyChangesDialog, UndoChangesDialog } from "./PendingChanges.tsx";

export type DeleteCheck =
  | { kind: "refused"; body: ReactNode }
  | { kind: "gone" }
  | { kind: "preflight"; modules: string[] }
  | {
      kind: "confirm";
      request: ZfsDeleteObjectRequest;
      /** The object named, and the consequence, as the confirmation shows them. */
      details: ReactNode;
    };

type Phase =
  | { kind: "checking" }
  | DeleteCheck
  | { kind: "rechecking"; previous: Extract<DeleteCheck, { kind: "confirm" }> }
  | { kind: "run" };

const STATES: readonly TaskStatus[] = [
  "waiting",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export interface DeleteWords {
  checkingTitle: string;
  checking: string;
  title: string;
  description: ReactNode;
  typed: { confirmText: string; prompt: string };
  confirm: string;
  goneBody: string;
  stepDelete: string;
  task: string;
  failed: string;
  goneAnyway: string;
  unknown: string;
}

export function ZfsDeleteDialog({
  open,
  onClose,
  kind,
  pool,
  name,
  check,
  words,
  openerRef,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  kind: DeleteKind;
  pool: string;
  /** The object's full name: what the run is kept by. */
  name: string;
  /** Read again what the deletion rests on. */
  check: () => Promise<DeleteCheck>;
  words: DeleteWords;
  openerRef?: RefObject<HTMLElement | null>;
  /** The deletion and its checkpoint ended (done, or the change left pending by "Stop here"). */
  onDone: (outcome: "done" | "pending" | "unknown") => void;
}) {
  const { t } = useTranslation();
  const fsApi = useFsApi();
  const zfsApi = useZfsApi();
  const tasks = useTasks();
  useMemoryStore(zfsActions);
  const run = deleteRunOf(name);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const decisionRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const runRef = useRef(0);
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [typed, setTyped] = useState("");
  const [confirming, setConfirming] = useState<"apply" | "undo" | null>(null);
  const [preflightTask, setPreflightTask] = useState<{
    id: number;
    action: "apply" | "undo";
  } | null>(null);

  const recheck = () => {
    const mine = ++runRef.current;
    setPhase({ kind: "checking" });
    void check().then(
      (next) => {
        if (runRef.current === mine) {
          setPhase(next);
        }
      },
      () => {
        if (runRef.current === mine) {
          setPhase({ kind: "refused", body: words.failed });
        }
      },
    );
  };

  // Reset and check on the opening edge, during render; the check runs in an effect.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTyped("");
      setPreflightTask(null);
      setPhase(run === undefined ? { kind: "checking" } : { kind: "run" });
    }
  }
  const needsCheck = open && phase.kind === "checking" && run === undefined;
  // The check runs once per opening, after the reset above; its result arrives later.
  const checkOnOpen = useEffectEvent(() => {
    const mine = ++runRef.current;
    void check().then(
      (next) => {
        if (runRef.current === mine) {
          setPhase(next);
        }
      },
      () => {
        if (runRef.current === mine) {
          setPhase({ kind: "refused", body: words.failed });
        }
      },
    );
  });
  useEffect(() => {
    if (needsCheck) {
      checkOnOpen();
    }
  }, [needsCheck]);

  const runPhase = run?.phase.kind;
  useEffect(() => {
    if (
      runPhase === "failed" ||
      runPhase === "alsoPending" ||
      runPhase === "unknown"
    ) {
      decisionRef.current?.focus();
    }
    if (runPhase === "done") {
      dismissDelete(name);
      onDone("done");
    }
    if (runPhase === "stopped") {
      dismissDelete(name);
      onDone("pending");
    }
    if (runPhase === "unknown") {
      // The result is not known: the page reads again and says so.
    }
  }, [runPhase, name, onDone]);

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
        recheck();
      }
    });
  };

  const confirm = async () => {
    if (
      phase.kind !== "confirm" ||
      !typedMatches(typed, words.typed.confirmText)
    ) {
      return;
    }
    const mine = ++runRef.current;
    setPhase({ kind: "rechecking", previous: phase });
    let next: DeleteCheck;
    try {
      next = await check();
    } catch {
      next = { kind: "refused", body: words.failed };
    }
    if (runRef.current !== mine) {
      return;
    }
    if (next.kind !== "confirm") {
      setPhase(next);
      return;
    }
    const started = startDelete(fsApi, zfsApi, kind, pool, next.request, {
      task: words.task,
      apply: t("pending.applyTask"),
    });
    setPhase(
      started
        ? { kind: "run" }
        : { kind: "refused", body: t("zfsBlock.changing") },
    );
  };

  const running =
    run !== undefined && (run.busy || run.phase.kind === "running");
  const statusLabels = Object.fromEntries(
    STATES.map((s) => [s, t(`addStorage.state.${s}`)]),
  ) as Record<TaskStatus, string>;

  let title: ReactNode = words.title;
  let description: ReactNode = words.description;
  let body: ReactNode = null;
  const showRun = phase.kind === "run" && run !== undefined;
  if (showRun) {
    const failedAt = run.phase.kind === "failed" ? run.phase.at : null;
    body = (
      <div className="flex flex-col gap-3">
        <JobStepList
          label={t("addStorage.steps")}
          statusLabels={statusLabels}
          steps={[
            {
              id: "delete",
              label: words.stepDelete,
              status: run.steps.delete.status,
              detail:
                run.steps.delete.taskId === undefined ? undefined : (
                  <StepTask
                    taskId={run.steps.delete.taskId}
                    label={words.stepDelete}
                    failed={failedAt === "delete"}
                  />
                ),
            },
            {
              id: "save",
              label: t("zfsDelete.step.save"),
              status: run.steps.save.status,
            },
          ]}
        />
        <div ref={decisionRef} tabIndex={-1} className="outline-hidden">
          {run.phase.kind === "failed" ? (
            <JobFailure
              title={
                run.phase.at === "delete"
                  ? words.failed
                  : t("zfsCreate.fail.save")
              }
              message={
                run.phase.at === "delete"
                  ? t("addStorage.stopped")
                  : words.goneAnyway
              }
              serverMessage={
                isRpcError(run.phase.error)
                  ? {
                      label: t("app.serverMessage"),
                      text: run.phase.error.message,
                    }
                  : undefined
              }
              retryLabel={
                run.phase.at === "delete"
                  ? t("zfsDelete.close")
                  : t("zfsDelete.tryAgain")
              }
              onRetry={() =>
                run.phase.kind === "failed" && run.phase.at === "save"
                  ? deleteDecision(name, "retrySave")
                  : (dismissDelete(name), onClose())
              }
              undo={
                run.phase.at === "save"
                  ? {
                      label: t("zfsDelete.stop"),
                      onUndo: () => deleteDecision(name, "stop"),
                    }
                  : undefined
              }
              busy={run.busy ? "retry" : undefined}
            />
          ) : run.phase.kind === "alsoPending" ? (
            <AlsoPendingPrompt
              title={t("addStorage.alsoTitle")}
              applyLabel={t("addStorage.applyToo")}
              stopLabel={t("zfsDelete.stop")}
              onApply={() => deleteDecision(name, "applyToo")}
              onStop={() => deleteDecision(name, "stop")}
              busy={run.busy ? "apply" : undefined}
            >
              <AlsoPendingNotice>
                <Trans
                  i18nKey="zfsDelete.alsoBody"
                  components={{ list: <ModuleNames ids={run.phase.others} /> }}
                />
              </AlsoPendingNotice>
            </AlsoPendingPrompt>
          ) : run.phase.kind === "unknown" ? (
            <JobFailure
              title={words.unknown}
              message={t("addStorage.stopped")}
              retryLabel={t("zfsDelete.close")}
              onRetry={() => {
                dismissDelete(name);
                onDone("unknown");
              }}
            />
          ) : null}
        </div>
      </div>
    );
  } else {
    switch (phase.kind) {
      case "checking":
        title = words.checkingTitle;
        description = words.checking;
        break;
      case "refused":
        title = t("zfsDelete.blocked.title");
        description = phase.body;
        break;
      case "gone":
        title = t("zfsDelete.blocked.title");
        description = words.goneBody;
        break;
      case "preflight":
        description = t("zfsDelete.preflightTitle");
        body = (
          <PreflightNotice
            title={t("zfsDelete.preflightTitle")}
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
            <p>{t("zfsDelete.preflightBody")}</p>
          </PreflightNotice>
        );
        break;
      case "confirm":
      case "rechecking": {
        const shown = phase.kind === "confirm" ? phase : phase.previous;
        body = (
          <div className="flex flex-col gap-3">
            {shown.details}
            <div className="flex flex-col gap-1">
              <TypeToConfirmField
                confirmText={words.typed.confirmText}
                prompt={words.typed.prompt}
                value={typed}
                onValueChange={setTyped}
              />
              <p id={hintId} className="text-sm text-muted-foreground">
                {t("zfsSnap.del.typeHint")}
              </p>
            </div>
          </div>
        );
        break;
      }
      case "run":
        title = words.checkingTitle;
        description = words.checking;
        break;
    }
  }

  const confirmShown = phase.kind === "confirm" || phase.kind === "rechecking";
  const matches = typedMatches(typed, words.typed.confirmText);
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !running) {
            runRef.current += 1;
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
            {confirmShown ? (
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
              {confirmShown ||
              phase.kind === "checking" ||
              phase.kind === "preflight"
                ? t("zfsDelete.cancel")
                : t("zfsDelete.close")}
            </DialogClose>
            {confirmShown ? (
              <Button
                variant="destructive"
                loading={phase.kind === "rechecking"}
                disabled={!matches}
                focusableWhenDisabled
                aria-describedby={matches ? undefined : hintId}
                onClick={() => void confirm()}
              >
                {phase.kind === "rechecking"
                  ? t("zfsDelete.checkingAgain")
                  : words.confirm}
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
