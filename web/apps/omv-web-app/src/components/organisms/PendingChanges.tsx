// SPDX-License-Identifier: GPL-3.0-or-later
// The pending-changes band (style guide 5.8), for administrators. It reads what is pending from
// System.getInformation, polled in the background (UI-14) and refetched after every x-omv-dirty
// mutation and every finished task (react-api-omv's query.ts). Apply and Undo run as tasks through
// the one task registry, so they keep running while the user moves between pages. Both ask first:
// Apply lists what is applied and, when a network module is pending, what applying does to this page,
// escalating to a typed confirmation or refusing (phase 5 network design 1.8); Undo names what is
// lost. With a network module pending, the apply waits for the NAS to answer again (1.5, 13.1).
import { useTasks } from "@omv-webui/react-api-omv/tasks";
import {
  ConfirmDialog,
  InlineAlert,
  IsolatedIdentifier,
  PendingBanner,
} from "@omv-webui/react-ui-components";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useBandActions } from "../../hooks/useBandActions.ts";
import {
  useNetworkApplyCheck,
  type ApplyCheck,
} from "../../hooks/useNetworkApplyCheck.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import {
  bandConfirmation,
  bandConfirmationMatches,
} from "../../network/bandApply.ts";
import { networkSession } from "../../network/networkSession.ts";
import { mayCutConnection, pendingModules } from "../../pending/modules.ts";
import { MAIN_ID, PENDING_BAND_ID } from "../../shell/ids.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { useShowTask } from "../../shell/taskDialog.ts";
import { ModuleName, ModuleNames } from "../molecules/ModuleNames.tsx";
import { BandWatch } from "./BandWatch.tsx";
import { NetworkApplyFindings } from "./NetworkApplyFindings.tsx";

export function PendingChanges() {
  const { t } = useTranslation();
  const info = useSystemInformation("admin");
  const tasks = useTasks();
  const showTask = useShowTask();
  const modules = pendingModules(info.data?.dirtyModules);
  const actions = useBandActions(modules);
  const { last, watch } = actions;

  const count = modules.length;
  const dirty = info.data?.configDirty === true || count > 0;
  const task = last ? tasks.find((t) => t.id === last.id) : undefined;
  const watching = watch.state !== null && actions.applied !== null;
  const waiting = watching && watch.state?.phase !== "done";
  const watchFailed =
    watch.state?.phase === "done" && watch.state.outcome.kind === "applyFailed";
  const running = task?.state === "running" || waiting;
  // A network apply the watch is following is not failed for a failed read (1.5): only by its outcome.
  const failed = watching ? watchFailed : task?.state === "failed";

  const visible = dirty || running || watching || actions.cameBack.length > 0;

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
      {dirty || running || failed ? (
        <PendingBanner
          label={t("pending.label")}
          message={message}
          applyLabel={applyLabel}
          undoLabel={undoLabel}
          onApply={() => actions.setConfirming("apply")}
          onUndo={() => actions.setConfirming("undo")}
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
                    task.state === "running"
                      ? "pending.showProgress"
                      : "pending.showDetails",
                  ),
                  onShow: () => showTask(task.id),
                }
              : undefined
          }
        />
      ) : null}
      <BandWatch actions={actions} />
      <ApplyChangesDialog
        open={actions.confirming === "apply"}
        onOpenChange={(open) => !open && actions.setConfirming(null)}
        modules={modules}
        onConfirm={actions.apply}
        onUndo={() => actions.setConfirming("undo")}
      />
      <UndoChangesDialog
        open={actions.confirming === "undo"}
        onOpenChange={(open) => !open && actions.setConfirming(null)}
        modules={modules}
        onConfirm={actions.undo}
      />
    </div>
  );
}

interface ChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pending module ids, from System.getInformation's dirtyModules. */
  modules: readonly string[];
}

/**
 * The band's confirmation before applying: what is applied, and what applying does to this page.
 * Whenever systemd-networkd, hosts, hostname or iptables is pending it runs the network check (1.8)
 * when it opens and escalates: the ordinary confirmation with its lines; the typed one with the
 * summary's "Before you apply" items and the destructive "Apply {{count}} changes"; or Apply
 * unavailable with the reason, a link to where it can be changed and Undo. The web server's modules
 * keep the general warning. Also used by flows whose pre-flight offers "Apply them now" (UX audit R1).
 * `onConfirm` gets the check the reader confirmed (null when none ran), for the watch afterwards.
 */
export function ApplyChangesDialog({
  open,
  onOpenChange,
  modules,
  onConfirm,
  onUndo,
}: ChangesDialogProps & {
  onConfirm: (check: ApplyCheck | null) => void;
  /** Offered when the apply is refused (1.8). */
  onUndo?: () => void;
}) {
  const { t } = useTranslation();
  const network = useNetworkApplyCheck(open, modules);
  const [typed, setTyped] = useState("");
  // Open empty every time (reset on the opening edge, during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTyped("");
    }
  }
  const count = modules.length;
  const some = count > 0;
  const result = network?.state === "done" ? network.result : null;
  const escalation = result?.check.confirmation ?? "ordinary";
  const confirmation =
    result !== null && escalation === "typed"
      ? bandConfirmation(result.check)
      : null;
  const matches =
    confirmation === null || bandConfirmationMatches(confirmation, typed);
  const blocked =
    network?.state === "checking" || escalation === "unavailable" || !matches;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        some ? t("pending.applyTitle", { count }) : t("pending.applyTitleAll")
      }
      description={t("pending.applyBody")}
      variant={confirmation === null ? "default" : "destructive"}
      confirmLabel={
        confirmation !== null
          ? t("netApply.confirm", { count })
          : some
            ? t("pending.apply", { count })
            : t("pending.applyAll")
      }
      confirmDisabled={blocked}
      cancelLabel={t("pending.cancel")}
      onConfirm={() => {
        if (!blocked) {
          onConfirm(result);
        }
      }}
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
      {network === undefined ? null : (
        <NetworkApplyFindings
          state={network}
          pending={modules}
          count={count}
          confirmation={confirmation}
          typed={typed}
          onTypedChange={setTyped}
          onUndo={onUndo}
        />
      )}
      {mayCutConnection(modules) ? (
        <InlineAlert tone="neutral">
          {t("pending.connectionWarning")}
        </InlineAlert>
      ) : null}
    </ConfirmDialog>
  );
}

/**
 * The band's confirmation before undoing: it names what is lost (UI-8). When the pending changes
 * include an interface whose settings this session removed, it says that the NAS queued a job to
 * switch it off, which Undo cannot remove, and that the page applies the queued jobs and the network
 * at once after undoing (10.4; useBandActions does).
 */
export function UndoChangesDialog({
  open,
  onOpenChange,
  modules,
  onConfirm,
}: ChangesDialogProps & { onConfirm: () => void }) {
  const { t } = useTranslation();
  const session = useMemoryStore(networkSession);
  const count = modules.length;
  const some = count > 0;
  const removed = modules.includes("task") ? session.ifacesRemoved : [];
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
    >
      {removed.map((iface) => (
        <p key={iface}>
          <Trans
            i18nKey="ifaceDelete.undoNote"
            components={{
              iface: <IsolatedIdentifier value={inertBidi(iface)} />,
            }}
          />
        </p>
      ))}
    </ConfirmDialog>
  );
}
