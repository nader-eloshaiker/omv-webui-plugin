// SPDX-License-Identifier: GPL-3.0-or-later
// Flow A, "Add storage", and its multi-disk variant "Combine disks (BTRFS)" (phase 5 file-systems
// design 6, 7; UX audit R1 to R10), for administrators. Opening it only reads (R9). While anything is
// pending the flow does not start (R1, Q2): the reader applies or undoes it first, with the band's own
// confirmations. A run of this session, under way or ended and not dismissed, is shown instead of the
// form, whichever of the two addresses is opened: one run at a time (7.3). A normal user gets the "only
// administrators" page, and nothing is called first (UI-4).
import {
  useConfigApplyChangesBg,
  useConfigRevertChangesBg,
} from "@omv-webui/react-api-omv/generated";
import { taskRegistry, useTasks } from "@omv-webui/react-api-omv/tasks";
import {
  BreadcrumbItem,
  Breadcrumbs,
  JobRunner,
  PreflightNotice,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { flowStore, type FlowKind } from "../../filesystems/flowRun.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { AddStorageDecisions } from "../organisms/AddStorageDecisions.tsx";
import { AddStorageRun } from "../organisms/AddStorageRun.tsx";
import {
  ApplyChangesDialog,
  UndoChangesDialog,
} from "../organisms/PendingChanges.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

/** The route /storage/filesystems/add. */
export function AddStorageRoutePage() {
  return <AddStoragePage kind="single" />;
}

/** The route /storage/filesystems/add-multi. */
export function CombineDisksRoutePage() {
  return <AddStoragePage kind="multi" />;
}

export function AddStoragePage({ kind }: { kind: FlowKind }) {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("filesystems.title")} />;
  }
  return <AddStorage kind={kind} />;
}

/** R1: pending changes from elsewhere stop the flow before its first decision. */
function Preflight({ modules }: { modules: readonly string[] }) {
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
        <p>{t("addStorage.preflightBody")}</p>
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

function AddStorage({ kind: requested }: { kind: FlowKind }) {
  const { t } = useTranslation();
  const info = useSystemInformation("admin");
  const { run } = useMemoryStore(flowStore);
  const kind = run?.choices.kind ?? requested;
  const multi = kind === "multi";
  const pending = pendingModules(info.data?.dirtyModules);

  let content;
  if (run !== null) {
    content = <AddStorageRun run={run} />;
  } else if (info.data === undefined) {
    content = (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("addStorage.loading")}
      </p>
    );
  } else if (pending.length > 0 || info.data.configDirty === true) {
    content = <Preflight modules={pending} />;
  } else {
    content = <AddStorageDecisions key={kind} kind={kind} />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Breadcrumbs aria-label={t("app.breadcrumb")}>
        <BreadcrumbItem render={<Link to="/storage/filesystems" />}>
          {t("filesystem.breadcrumb")}
        </BreadcrumbItem>
        <BreadcrumbItem current>
          {multi
            ? t("addStorage.multi.breadcrumb")
            : t("addStorage.breadcrumb")}
        </BreadcrumbItem>
      </Breadcrumbs>
      <PageTitle
        documentTitle={
          multi
            ? t("addStorage.multi.documentTitle")
            : t("addStorage.documentTitle")
        }
      >
        {t("filesystems.title")}
      </PageTitle>
      <JobRunner
        title={multi ? t("addStorage.multi.title") : t("addStorage.title")}
      >
        {content}
      </JobRunner>
    </div>
  );
}
