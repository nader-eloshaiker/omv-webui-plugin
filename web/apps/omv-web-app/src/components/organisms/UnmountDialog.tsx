// SPDX-License-Identifier: GPL-3.0-or-later
// The unmount and removal dialog (phase 5 file-systems design 5.2, 5.3; owner, P6 to P8). It opens at
// once and reads the list, the shared folders and what is pending again, then shows a refusal that
// appeared meanwhile, "no longer set up", the pre-flight when other changes are pending (P7: their undo
// would be lost), or the confirmation. Unmount cuts access, so its confirmation is destructive in form
// (warning shape, the red button with its verb), without typing: nothing is lost (P6). Removing a
// missing file system is a plain confirmation (P8). Either way focus starts on Cancel, there is no form
// (Enter never confirms), Escape and Cancel close it and the scrim does not. The confirm button checks
// once more before anything is called.
import { taskRegistry, useTasks } from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Identifier,
  PreflightNotice,
  ServerMessage,
} from "@omv-webui/react-ui-components";
import { TriangleAlert } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { startUnmount } from "../../filesystems/fsActions.ts";
import { fsUsage } from "../../filesystems/fsModel.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import {
  type UnmountKind,
  type useUnmountDialog,
} from "../../hooks/useUnmountDialog.ts";
import { FsTypeView } from "../atoms/FsNameView.tsx";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { ApplyChangesDialog, UndoChangesDialog } from "./PendingChanges.tsx";
import { UnmountBlockers } from "./UnmountBlockers.tsx";

export function UnmountDialog({
  dialog,
  kind,
  address,
  name,
  disk,
  openerRef,
  panelRef,
  onStarted,
}: {
  dialog: ReturnType<typeof useUnmountDialog>;
  kind: UnmountKind;
  address: string;
  name: string;
  /** The disk it is on, in words ("/dev/sdb, Example HDD"), for the confirmation. */
  disk: string;
  openerRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  onStarted: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const tasks = useTasks();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const startedRef = useRef(false);
  const [confirming, setConfirming] = useState<"apply" | "undo" | null>(null);
  const [preflightTask, setPreflightTask] = useState<{
    id: number;
    action: "apply" | "undo";
  } | null>(null);
  const { control, setControl } = dialog;
  const { phase } = control;
  const remove = kind === "remove";
  const preflightRunning =
    preflightTask !== null &&
    tasks.find((task) => task.id === preflightTask.id)?.state === "running";

  // Reset on the opening edge, during render.
  const [wasOpen, setWasOpen] = useState(control.open);
  if (control.open !== wasOpen) {
    setWasOpen(control.open);
    if (control.open) {
      startedRef.current = false;
      setPreflightTask(null);
    }
  }

  const recheckInto = () => {
    const mine = ++dialog.runRef.current;
    setControl({ open: true, phase: { kind: "checking" } });
    void dialog.check().then((next) => {
      if (dialog.runRef.current === mine) {
        setControl({ open: true, phase: next });
      }
    });
  };

  const runPreflight = (action: "apply" | "undo") => {
    setConfirming(null);
    const id = taskRegistry.start(
      t(action === "apply" ? "pending.applyTask" : "pending.undoTask"),
      action === "apply"
        ? dialog.api.apply({ modules: [], force: false })
        : dialog.api.revert(),
    );
    setPreflightTask({ id, action });
    const off = taskRegistry.onSettled((task) => {
      if (task.id === id) {
        off();
        // When nothing is pending any more the dialog goes on to the confirmation.
        recheckInto();
      }
    });
  };

  const confirm = async () => {
    if (phase.kind !== "confirm" || phase.rechecking) {
      return;
    }
    const mine = ++dialog.runRef.current;
    setControl({ open: true, phase: { ...phase, rechecking: true } });
    const next = await dialog.check();
    if (dialog.runRef.current !== mine) {
      return;
    }
    if (next.kind !== "confirm") {
      setControl({ open: true, phase: next });
      return;
    }
    startUnmount(
      dialog.api,
      { apply: t("pending.applyTask") },
      next.fs,
      name,
      kind,
      address,
    );
    startedRef.current = true;
    onStarted();
    dialog.close();
  };

  const isConfirm = phase.kind === "confirm";
  const checking = phase.kind === "checking";
  let title;
  let description;
  let body = null;
  switch (phase.kind) {
    case "checking":
      title = remove
        ? t("fsRemove.dialogTitle", { name })
        : t("fsUnmount.dialogTitle", { name });
      description = t("fsUnmount.checking");
      break;
    case "refused":
      title = remove ? t("fsRemove.refusedTitle") : t("fsUnmount.refusedTitle");
      description = <UnmountBlockers blockers={phase.blockers} />;
      break;
    case "unchecked":
      title = remove ? t("fsRemove.refusedTitle") : t("fsUnmount.refusedTitle");
      description = (
        <>
          <span className="block">{t("filesystem.loadFailed")}</span>
          {isRpcError(phase.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {phase.error.message}
            </ServerMessage>
          ) : null}
        </>
      );
      break;
    case "gone":
      title = remove ? t("fsRemove.refusedTitle") : t("fsUnmount.refusedTitle");
      description = t("fsUnmount.goneBody");
      break;
    case "preflight":
      title = remove
        ? t("fsRemove.dialogTitle", { name })
        : t("fsUnmount.dialogTitle", { name });
      description = t("fsUnmount.preflightTitle");
      body = (
        <PreflightNotice
          title={t("fsUnmount.preflightTitle")}
          applyLabel={t("fsUnmount.applyThem")}
          undoLabel={t("fsUnmount.undoThem")}
          onApply={() => setConfirming("apply")}
          onUndo={() => setConfirming("undo")}
          busy={preflightRunning ? preflightTask.action : undefined}
        >
          <p>
            {t("pending.message", { count: phase.modules.length })}{" "}
            <ModuleNames ids={phase.modules} />
          </p>
          <p>
            {remove
              ? t("fsRemove.preflightBody")
              : t("fsUnmount.preflightBody")}
          </p>
        </PreflightNotice>
      );
      break;
    case "confirm": {
      const fs = phase.fs;
      title = remove
        ? t("fsRemove.dialogTitle", { name })
        : t("fsUnmount.dialogTitle", { name });
      description = remove ? t("fsRemove.body") : t("fsUnmount.consequence");
      const usage = fsUsage(fs);
      const size = parseByteCount(fs.size);
      body = (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-0.5">
            <li>
              <FsTypeView type={fs.type} />
              {remove ? null : (
                <>
                  , <Identifier>{fs.canonicaldevicefile}</Identifier>
                </>
              )}
            </li>
            {remove ? (
              <li>
                <Identifier>{fs.devicefile}</Identifier>
              </li>
            ) : (
              <li dir="auto">{disk}</li>
            )}
            {!remove && usage !== "none" && size !== null ? (
              <li className="tabular-nums">
                {t("dashboard.storage.value", {
                  percent: format.percent(fs.percentage),
                  free: formatBytes(parseByteCount(fs.available) ?? 0),
                  size: formatBytes(size),
                })}
              </li>
            ) : null}
            <li>
              {t("filesystem.fact.folder")}:{" "}
              <Identifier>{fs.mountpoint}</Identifier>
            </li>
          </ul>
          {remove ? (
            <p>{t("fsRemove.comesBack")}</p>
          ) : (
            <>
              <section className="flex flex-col gap-1.5">
                <h3 className="text-base font-semibold">
                  {t("fsUnmount.stopsTitle")}
                </h3>
                <ul className="flex list-disc flex-col gap-1 ps-5">
                  <li>{t("fsUnmount.stops.direct")}</li>
                  <li>{t("fsUnmount.stops.settings")}</li>
                  <li>{t("fsUnmount.stops.busy")}</li>
                </ul>
              </section>
              <p>{t("fsUnmount.afterwards")}</p>
            </>
          )}
        </div>
      );
      break;
    }
  }

  return (
    <>
      <Dialog
        open={control.open}
        onOpenChange={(open) => {
          if (!open) {
            dialog.close();
          }
        }}
        disablePointerDismissal
      >
        <DialogContent
          role="alertdialog"
          data-slot="unmount-dialog"
          aria-busy={checking || (isConfirm && phase.rechecking) || undefined}
          initialFocus={cancelRef}
          finalFocus={() =>
            startedRef.current ? panelRef.current : openerRef.current
          }
        >
          <div className="flex items-start gap-3">
            {isConfirm && !remove ? (
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
            <DialogClose ref={cancelRef} render={<Button variant="neutral" />}>
              {isConfirm || checking || phase.kind === "preflight"
                ? t("fsUnmount.cancel")
                : t("fsUnmount.close")}
            </DialogClose>
            {isConfirm ? (
              <Button
                data-slot="unmount-confirm"
                variant={remove ? "primary" : "destructive"}
                loading={phase.rechecking}
                onClick={() => void confirm()}
              >
                {phase.rechecking
                  ? t("fsUnmount.checkingAgain")
                  : remove
                    ? t("fsRemove.confirm")
                    : t("fsUnmount.confirm")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {phase.kind === "preflight" ? (
        <>
          <ApplyChangesDialog
            open={confirming === "apply"}
            onOpenChange={(open) => !open && setConfirming(null)}
            modules={phase.modules}
            onConfirm={() => runPreflight("apply")}
          />
          <UndoChangesDialog
            open={confirming === "undo"}
            onOpenChange={(open) => !open && setConfirming(null)}
            modules={phase.modules}
            onConfirm={() => runPreflight("undo")}
          />
        </>
      ) : null}
    </>
  );
}
