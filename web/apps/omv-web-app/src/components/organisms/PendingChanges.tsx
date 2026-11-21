// SPDX-License-Identifier: GPL-3.0-or-later
// The pending-changes band (style guide 5.8), for administrators. It reads what is pending from
// System.getInformation, polled in the background (UI-14) and refetched after every x-omv-dirty
// mutation and every finished task (react-api-omv's query.ts). Apply and Undo run as tasks through
// the one task registry, so they keep running while the user moves between pages. Both ask first:
// Apply lists what is applied and warns when the connection may drop; Undo names what is lost.
import {
  useConfigApplyChangesBg,
  useConfigRevertChangesBg,
} from "@omv-webui/react-api-omv/generated";
import { taskRegistry, useTasks } from "@omv-webui/react-api-omv/tasks";
import {
  ConfirmDialog,
  InlineAlert,
  PendingBanner,
} from "@omv-webui/react-ui-components";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { mayCutConnection, pendingModules } from "../../pending/modules.ts";
import { MAIN_ID, PENDING_BAND_ID } from "../../shell/ids.ts";
import { useShowTask } from "../../shell/taskDialog.ts";
import { ModuleName, ModuleNames } from "../molecules/ModuleNames.tsx";

type Action = "apply" | "undo";

export function PendingChanges() {
  const { t } = useTranslation();
  const info = useSystemInformation("admin");
  const tasks = useTasks();
  const showTask = useShowTask();
  const apply = useConfigApplyChangesBg();
  const undo = useConfigRevertChangesBg();
  const [last, setLast] = useState<{ id: number; action: Action } | null>(null);
  const [confirming, setConfirming] = useState<Action | null>(null);

  const modules = pendingModules(info.data?.dirtyModules);
  const count = modules.length;
  const dirty = info.data?.configDirty === true || count > 0;
  const task = last ? tasks.find((t) => t.id === last.id) : undefined;
  const running = task?.state === "running";
  const failed = task?.state === "failed";

  const visible = dirty || running;

  // When an apply or undo finishes, the band goes, and with it the control that had focus. Focus then
  // moves to the page title, so a keyboard user is not left on the page itself.
  const wasVisibleRef = useRef(visible);
  useEffect(() => {
    if (wasVisibleRef.current && !visible) {
      const active = document.activeElement;
      if (active === null || active === document.body) {
        document.querySelector<HTMLElement>(`#${MAIN_ID} h1`)?.focus();
      }
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  if (!visible) {
    return null;
  }

  const start = (action: Action) => {
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

  const some = count > 0;
  const applyLabel = some
    ? t("pending.apply", { count })
    : t("pending.applyAll");
  const undoLabel = some ? t("pending.undo", { count }) : t("pending.undoAll");

  const message =
    count > 0 ? (
      <>
        {t("pending.message", { count })} <ModuleNames ids={modules} />
      </>
    ) : (
      t("pending.messageUnknown")
    );

  return (
    <div id={PENDING_BAND_ID} tabIndex={-1} className="outline-hidden">
      <PendingBanner
        label={t("pending.label")}
        message={message}
        applyLabel={applyLabel}
        undoLabel={undoLabel}
        onApply={() => setConfirming("apply")}
        onUndo={() => setConfirming("undo")}
        state={running ? "applying" : failed ? "failed" : "idle"}
        applyingMessage={t(
          last?.action === "undo" ? "pending.undoing" : "pending.applying",
        )}
        failedMessage={t(
          last?.action === "undo"
            ? "pending.undoFailed"
            : "pending.applyFailed",
        )}
        retryLabel={last?.action === "apply" ? t("pending.retry") : undefined}
        showProgress={
          task
            ? {
                label: t(
                  running ? "pending.showProgress" : "pending.showDetails",
                ),
                onShow: () => showTask(task.id),
              }
            : undefined
        }
      />
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
    </div>
  );
}

interface ChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pending module ids, from System.getInformation's dirtyModules. */
  modules: readonly string[];
  onConfirm: () => void;
}

/**
 * The band's confirmation before applying: what is applied, and a warning when the connection may
 * drop. Also used by flows whose pre-flight offers "Apply them now" (UX audit R1).
 */
export function ApplyChangesDialog({
  open,
  onOpenChange,
  modules,
  onConfirm,
}: ChangesDialogProps) {
  const { t } = useTranslation();
  const count = modules.length;
  const some = count > 0;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        some ? t("pending.applyTitle", { count }) : t("pending.applyTitleAll")
      }
      description={t("pending.applyBody")}
      confirmLabel={
        some ? t("pending.apply", { count }) : t("pending.applyAll")
      }
      cancelLabel={t("pending.cancel")}
      onConfirm={onConfirm}
    >
      {some ? (
        <div className="flex flex-col gap-1">
          <p className="font-medium">{t("pending.applyAffects")}</p>
          <ul className="list-disc ps-5">
            {modules.map((id) => (
              <li key={id}>
                <ModuleName id={id} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {mayCutConnection(modules) ? (
        <InlineAlert tone="neutral">
          {t("pending.connectionWarning")}
        </InlineAlert>
      ) : null}
    </ConfirmDialog>
  );
}

/** The band's confirmation before undoing: it names what is lost (UI-8). */
export function UndoChangesDialog({
  open,
  onOpenChange,
  modules,
  onConfirm,
}: ChangesDialogProps) {
  const { t } = useTranslation();
  const count = modules.length;
  const some = count > 0;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        some ? t("pending.undoTitle", { count }) : t("pending.undoTitleAll")
      }
      description={
        some ? (
          <Trans
            i18nKey="pending.undoBody"
            components={{ list: <ModuleNames ids={modules} /> }}
          />
        ) : (
          t("pending.undoBodyAll")
        )
      }
      confirmLabel={some ? t("pending.undo", { count }) : t("pending.undoAll")}
      cancelLabel={t("pending.cancel")}
      onConfirm={onConfirm}
    />
  );
}
