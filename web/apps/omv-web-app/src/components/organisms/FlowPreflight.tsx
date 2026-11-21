// SPDX-License-Identifier: GPL-3.0-or-later
// The pre-flight of a flow that applies its own changes at the end (UX audit R1; journal 2026-11-20,
// Q2): pending changes from elsewhere stop it before its first decision, named in words, with "Apply
// them now" and "Undo them" behind the band's own confirmations. Flow A and the RAID flows use it.
import {
  useConfigApplyChangesBg,
  useConfigRevertChangesBg,
} from "@omv-webui/react-api-omv/generated";
import { taskRegistry, useTasks } from "@omv-webui/react-api-omv/tasks";
import { PreflightNotice } from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { ApplyChangesDialog, UndoChangesDialog } from "./PendingChanges.tsx";

/** R1: pending changes from elsewhere stop the flow before its first decision. */
export function FlowPreflight({
  modules,
  body,
}: {
  modules: readonly string[];
  /** Why they are applied or undone first, for this flow. */
  body: string;
}) {
  const { t } = useTranslation();
  const tasks = useTasks();
  const apply = useConfigApplyChangesBg();
  const undo = useConfigRevertChangesBg();
  const [confirming, setConfirming] = useState<"apply" | "undo" | null>(null);
  const [last, setLast] = useState<{
    id: number;
    action: "apply" | "undo";
  } | null>(null);
  const running =
    last !== null && tasks.find((x) => x.id === last.id)?.state === "running";
  const start = (action: "apply" | "undo") => {
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
  return (
    <>
      <PreflightNotice
        title={t("addStorage.preflightTitle")}
        applyLabel={t("addStorage.applyThem")}
        undoLabel={t("addStorage.undoThem")}
        onApply={() => setConfirming("apply")}
        onUndo={() => setConfirming("undo")}
        busy={running ? last.action : undefined}
      >
        <p>
          {t("pending.message", { count: modules.length })}{" "}
          <ModuleNames ids={modules} />
        </p>
        <p>{body}</p>
      </PreflightNotice>
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
    </>
  );
}
