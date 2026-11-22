// SPDX-License-Identifier: GPL-3.0-or-later
// The dialog that deletes a shared folder, either way (phase 5 shares design 8.2 to 8.6; UI-8; P13,
// P14). It opens at once and reads again what the deletion rests on ("Checking what uses this shared
// folder…"), then shows a refusal, "This shared folder no longer exists.", the pre-flight when other
// changes are pending (apply or undo them first: the deletion applies its own change straight after),
// or the confirmation:
// - "Remove, keep the files": plain; it says where the files stay;
// - "Delete with all its files": destructive, naming the folder, its file system and its full path,
//   with the folder's name typed (exact, case-sensitive, spaces around ignored) and a switch to
//   removing it while keeping the files. Enter never confirms; focus starts on Cancel, and Tab goes
//   Cancel, the typed field, the confirm button (unavailable but focusable), then the switch (8.6),
//   while the page keeps its reading order.
// Confirming checks once more ("Checking again…"), then the step list runs here (deleteRun.ts): the
// deletion, then the change saved (R10). Nothing closes the dialog while a step runs.
import type {
  ConfiguredFilesystem,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
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
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Identifier,
  JobFailure,
  JobStepList,
  PreflightNotice,
  TypeToConfirmField,
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
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { useSharesApi } from "../../hooks/useSharesApi.ts";
import {
  dismissShareDelete,
  shareDeleteDecision,
  shareDeleteOf,
  shareDeletes,
  startShareDelete,
  type DeleteWay,
  type ShareDeleteWords,
} from "../../sharedFolders/deleteRun.ts";
import {
  displayPath,
  isWholeFs,
  typedNameMatches,
} from "../../sharedFolders/nameRules.ts";
import { shownFsName } from "../../sharedFolders/shownNames.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { followTabSequence } from "../../shell/tabSequence.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { FsNameSlot } from "../atoms/FsNameSlot.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { StepTask } from "../molecules/StepTask.tsx";
import { ApplyChangesDialog, UndoChangesDialog } from "./PendingChanges.tsx";

export type ShareDeleteCheck =
  | { kind: "refused"; body: ReactNode }
  | { kind: "gone" }
  | { kind: "preflight"; modules: string[] }
  | {
      kind: "confirm";
      folder: SharedFolder;
      fs: ConfiguredFilesystem | undefined;
    };

type Phase =
  | { kind: "checking" }
  | ShareDeleteCheck
  | {
      kind: "rechecking";
      previous: Extract<ShareDeleteCheck, { kind: "confirm" }>;
    }
  | { kind: "run" };

const STATES: readonly TaskStatus[] = [
  "waiting",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export type ShareDeleteOutcome = "done" | "pending" | "unknown";

export function ShareDeleteDialog({
  open,
  onClose,
  uuid,
  name,
  way,
  onWayChange,
  check,
  openerRef,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** The folder's `uuid`, which the run is kept by. */
  uuid: string;
  /** The folder's name, as read when the page opened. */
  name: string;
  way: DeleteWay;
  onWayChange: (way: DeleteWay) => void;
  /** Read again what the deletion rests on, for this way of deleting. */
  check: (way: DeleteWay) => Promise<ShareDeleteCheck>;
  openerRef?: RefObject<HTMLElement | null>;
  /**
   * The deletion and its checkpoint ended (done, or the change left pending by "Stop here"), or the
   * reader closed a result that could not be told: with what the run said of the folder.
   */
  onDone: (
    outcome: ShareDeleteOutcome,
    way: DeleteWay,
    words: ShareDeleteWords,
  ) => void;
}) {
  const { t } = useTranslation();
  const fsWords = useFsWords();
  const fsApi = useFsApi();
  const sharesApi = useSharesApi();
  const tasks = useTasks();
  useMemoryStore(shareDeletes);
  const run = shareDeleteOf(uuid);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const decisionRef = useRef<HTMLDivElement>(null);
  const typedRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const insteadRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const checksRef = useRef(0);
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [typed, setTyped] = useState("");
  const [confirming, setConfirming] = useState<"apply" | "undo" | null>(null);
  const [preflightTask, setPreflightTask] = useState<{
    id: number;
    action: "apply" | "undo";
  } | null>(null);

  const runCheck = (forWay: DeleteWay) => {
    const mine = ++checksRef.current;
    setPhase({ kind: "checking" });
    void check(forWay).then(
      (next) => {
        if (checksRef.current === mine) {
          setPhase(next);
        }
      },
      () => {
        if (checksRef.current === mine) {
          setPhase({ kind: "refused", body: t("shareDelete.blocked.unread") });
        }
      },
    );
  };

  // Reset on the opening edge, during render; the check runs in an effect.
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
    const mine = ++checksRef.current;
    void check(way).then(
      (next) => {
        if (checksRef.current === mine) {
          setPhase(next);
        }
      },
      () => {
        if (checksRef.current === mine) {
          setPhase({ kind: "refused", body: t("shareDelete.blocked.unread") });
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
  const done = useEffectEvent((outcome: ShareDeleteOutcome) => {
    const ended = shareDeleteOf(uuid);
    dismissShareDelete(uuid);
    if (ended !== undefined) {
      onDone(outcome, ended.way, ended.words);
    }
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
  }, [runPhase, uuid]);

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
        runCheck(way);
      }
    });
  };

  const confirm = async () => {
    if (phase.kind !== "confirm") {
      return;
    }
    if (way === "files" && !typedNameMatches(typed, phase.folder.name)) {
      return;
    }
    const mine = ++checksRef.current;
    setPhase({ kind: "rechecking", previous: phase });
    let next: ShareDeleteCheck;
    try {
      next = await check(way);
    } catch {
      next = { kind: "refused", body: t("shareDelete.blocked.unread") };
    }
    if (checksRef.current !== mine) {
      return;
    }
    if (next.kind !== "confirm") {
      setPhase(next);
      return;
    }
    const started = startShareDelete(
      {
        deleteFolder: sharesApi.deleteFolder,
        folders: sharesApi.folders,
        pending: sharesApi.pending,
        apply: () => fsApi.apply({ modules: [], force: false }),
      },
      uuid,
      way,
      {
        folder: next.folder.name,
        fs:
          next.fs === undefined
            ? next.folder.device
            : fsWords.nameOf(shownFsName(next.fs)),
        fullPath: next.folder.absdirpath ?? "",
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

  const shownName = run?.words.folder ?? name;
  const folderSlot = <FolderNameText value={shownName} />;
  const keepTitle = t("shareDelete.keep.title", {
    folder: isolateName(shownName),
  });
  const filesTitle = t("shareDelete.files.title", {
    folder: isolateName(shownName),
  });
  let title: ReactNode = way === "keep" ? keepTitle : filesTitle;
  let description: ReactNode = null;
  let body: ReactNode = null;
  let destructive = false;

  if (phase.kind === "run" && run !== undefined) {
    title = run.way === "keep" ? keepTitle : filesTitle;
    const failure = run.phase.kind === "failed" ? run.phase : null;
    const deleteLabel =
      run.way === "keep"
        ? t("shareDelete.step.keep")
        : t("shareDelete.step.files");
    description = deleteLabel;
    body = (
      <div className="flex flex-col gap-3">
        <JobStepList
          label={t("addStorage.steps")}
          statusLabels={statusLabels}
          steps={[
            {
              id: "delete",
              label: deleteLabel,
              status: run.steps.delete.status,
              detail:
                run.way === "files" && run.steps.delete.status === "running" ? (
                  <span className="text-sm text-muted-foreground">
                    {t("shareDelete.step.filesHint")}
                  </span>
                ) : undefined,
            },
            {
              id: "save",
              label: t("shareDelete.step.save"),
              status: run.steps.save.status,
              detail:
                run.steps.save.taskId === undefined ? undefined : (
                  <StepTask
                    taskId={run.steps.save.taskId}
                    label={t("shareDelete.step.save")}
                    failed={failure?.at === "save"}
                  />
                ),
            },
          ]}
        />
        <div ref={decisionRef} tabIndex={-1} className="outline-hidden">
          {failure !== null && failure.at === "delete" ? (
            <JobFailure
              title={t(
                run.way === "keep"
                  ? "shareDelete.failed.keep"
                  : "shareDelete.failed.files",
                { folder: isolateName(shownName) },
              )}
              message={
                failure.error === undefined
                  ? t("shareDelete.stillThere", {
                      folder: isolateName(shownName),
                    })
                  : run.way === "files"
                    ? t("shareDelete.failed.partly")
                    : t("addStorage.stopped")
              }
              serverMessage={
                isRpcError(failure.error)
                  ? {
                      label: t("app.serverMessage"),
                      text: failure.error.message,
                    }
                  : undefined
              }
              retryLabel={t("zfsDelete.close")}
              onRetry={() => {
                dismissShareDelete(uuid);
                onClose();
              }}
            />
          ) : failure !== null ? (
            <JobFailure
              title={t("shareDelete.saveFailedTitle")}
              message={t("shareDelete.failed.saveBody")}
              serverMessage={
                isRpcError(failure.error)
                  ? {
                      label: t("app.serverMessage"),
                      text: failure.error.message,
                    }
                  : undefined
              }
              retryLabel={t("pending.retry")}
              onRetry={() => shareDeleteDecision(uuid, "retrySave")}
              undo={{
                label: t("zfsDelete.stop"),
                onUndo: () => shareDeleteDecision(uuid, "stop"),
              }}
              busy={run.busy ? "retry" : undefined}
            />
          ) : run.phase.kind === "alsoPending" ? (
            <AlsoPendingPrompt
              title={t("addStorage.alsoTitle")}
              applyLabel={t("addStorage.applyToo")}
              stopLabel={t("zfsDelete.stop")}
              onApply={() => shareDeleteDecision(uuid, "applyToo")}
              onStop={() => shareDeleteDecision(uuid, "stop")}
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
              title={t("shareDelete.unknown", {
                folder: isolateName(shownName),
              })}
              message={
                run.way === "files" ? t("shareDelete.failed.partly") : null
              }
              retryLabel={t("shareDelete.checkAgain")}
              onRetry={() => shareDeleteDecision(uuid, "checkAgain")}
              undo={{
                label: t("zfsDelete.close"),
                onUndo: () => {
                  dismissShareDelete(uuid);
                  onDone("unknown", run.way, run.words);
                },
              }}
              busy={run.busy ? "retry" : undefined}
            />
          ) : null}
        </div>
      </div>
    );
  } else {
    switch (phase.kind) {
      case "checking":
      case "run":
        description = t("shareDelete.checking");
        break;
      case "refused":
        title = t("shareDelete.blockedTitle");
        description = phase.body;
        break;
      case "gone":
        title = t("shareDelete.blockedTitle");
        description = t("shareDelete.gone");
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
            <p>{t("shareDelete.preflightBody")}</p>
          </PreflightNotice>
        );
        break;
      case "confirm":
      case "rechecking": {
        const shown = phase.kind === "confirm" ? phase : phase.previous;
        const fullPath = (
          <IdentifierText value={inertBidi(shown.folder.absdirpath ?? "")} />
        );
        const fsSlot = (
          <FsNameSlot fs={shown.fs} fallback={shown.folder.device} />
        );
        if (way === "keep") {
          description = (
            <Trans
              i18nKey="shareDelete.keep.body"
              components={{ fs: fsSlot, path: fullPath, folder: folderSlot }}
            />
          );
          body = <p>{t("shareDelete.keep.later")}</p>;
        } else {
          destructive = true;
          description = (
            <Trans
              i18nKey="shareDelete.files.consequence"
              components={{ path: fullPath }}
            />
          );
          body = (
            <div className="flex flex-col gap-3">
              <FactList>
                <FactListItem>
                  <FactListLabel>{t("sharedFolder.fact.fs")}</FactListLabel>
                  <FactListValue>{fsSlot}</FactListValue>
                </FactListItem>
                <FactListItem>
                  <FactListLabel>{t("sharedFolder.fact.path")}</FactListLabel>
                  <FactListValue>
                    {isWholeFs(shown.folder.reldirpath) ? (
                      t("sharedFolder.fact.wholeFs")
                    ) : (
                      <Identifier dir="auto">
                        {inertBidi(displayPath(shown.folder.reldirpath))}
                      </Identifier>
                    )}
                  </FactListValue>
                </FactListItem>
                <FactListItem>
                  <FactListLabel>
                    {t("sharedFolder.fact.fullPath")}
                  </FactListLabel>
                  <FactListValue>
                    <Identifier dir="auto" className="[overflow-wrap:anywhere]">
                      {inertBidi(shown.folder.absdirpath ?? "")}
                    </Identifier>
                  </FactListValue>
                </FactListItem>
              </FactList>
              {shown.fs?.type === "btrfs" ? (
                <p>
                  <Trans
                    i18nKey="shareDelete.files.btrfs"
                    components={{ fs: fsSlot }}
                  />
                </p>
              ) : null}
              <div className="flex flex-col items-start gap-2">
                <p>{t("shareDelete.files.copyFirst")}</p>
                <Button
                  ref={insteadRef}
                  variant="neutral"
                  size="sm"
                  onClick={() => onWayChange("keep")}
                >
                  {t("shareDelete.files.instead")}
                </Button>
              </div>
              <div ref={typedRef} className="flex flex-col gap-1">
                {/* The prompt shows the name as every other place does, controls as "�", and
                    typedNameMatches compares in that shown form (8.4, format/isolate.ts). */}
                <TypeToConfirmField
                  confirmText={inertBidi(shown.folder.name)}
                  prompt={t("shareDelete.files.typePrompt", {
                    folder: inertBidi(shown.folder.name),
                  })}
                  value={typed}
                  onValueChange={setTyped}
                />
                <p id={hintId} className="text-sm text-muted-foreground">
                  {t("shareDelete.files.typeHint")}
                </p>
              </div>
            </div>
          );
        }
        break;
      }
    }
  }

  const confirmShown = phase.kind === "confirm" || phase.kind === "rechecking";
  const confirmName =
    phase.kind === "confirm"
      ? phase.folder.name
      : phase.kind === "rechecking"
        ? phase.previous.folder.name
        : shownName;
  const matches = way === "keep" || typedNameMatches(typed, confirmName);
  const closeWord =
    confirmShown || phase.kind === "checking" || phase.kind === "preflight"
      ? t("shareDelete.cancel")
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
          onKeyDown={
            confirmShown && way === "files"
              ? (event) =>
                  followTabSequence(event, [
                    cancelRef.current,
                    typedRef.current,
                    confirmRef.current,
                    insteadRef.current,
                  ])
              : undefined
          }
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
                ref={confirmRef}
                variant={way === "files" ? "destructive" : "primary"}
                loading={phase.kind === "rechecking"}
                disabled={!matches}
                focusableWhenDisabled
                aria-describedby={matches ? undefined : hintId}
                onClick={() => void confirm()}
              >
                {phase.kind === "rechecking"
                  ? t("shareDelete.checkingAgain")
                  : way === "keep"
                    ? t("shareDelete.keep.confirm")
                    : t("shareDelete.files.confirm")}
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
