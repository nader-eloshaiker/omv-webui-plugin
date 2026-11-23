// SPDX-License-Identifier: GPL-3.0-or-later
// The pre-flight of a flow that applies its own changes at the end (UX audit R1; journal 2026-11-20,
// Q2): pending changes from elsewhere stop it before its first decision, named in words, with "Apply
// them now" and "Undo them" behind the band's own confirmations. Flow A, the RAID flows and the
// network change flow use it. Its apply is the band's (useBandActions): with a network module pending
// it runs the network check and waits for the NAS as the band does (phase 5 network design 1.4, 1.8).
import { useTasks } from "@omv-webui/react-api-omv/tasks";
import { PreflightNotice } from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useBandActions } from "../../hooks/useBandActions.ts";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { BandWatch } from "./BandWatch.tsx";
import { ApplyChangesDialog, UndoChangesDialog } from "./PendingChanges.tsx";

/** R1: pending changes from elsewhere stop the flow before its first decision. */
export function FlowPreflight({
  modules,
  body,
  title,
  applyLabel,
  undoLabel,
  children,
}: {
  modules: readonly string[];
  /** Why they are applied or undone first, for this flow. */
  body?: string;
  title?: ReactNode;
  applyLabel?: ReactNode;
  undoLabel?: ReactNode;
  /** The notice's words, in place of the module list and `body`. */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const tasks = useTasks();
  const actions = useBandActions(modules);
  const { last } = actions;
  const running =
    last !== null && tasks.find((x) => x.id === last.id)?.state === "running";
  const busy =
    running && last.action !== "queued"
      ? last.action === "undo"
        ? "undo"
        : "apply"
      : undefined;
  return (
    <>
      <PreflightNotice
        title={title ?? t("addStorage.preflightTitle")}
        applyLabel={applyLabel ?? t("addStorage.applyThem")}
        undoLabel={undoLabel ?? t("addStorage.undoThem")}
        onApply={() => actions.setConfirming("apply")}
        onUndo={() => actions.setConfirming("undo")}
        busy={busy}
      >
        {children ?? (
          <>
            <p>
              {t("pending.message", { count: modules.length })}{" "}
              <ModuleNames ids={modules} />
            </p>
            <p>{body}</p>
          </>
        )}
      </PreflightNotice>
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
    </>
  );
}
