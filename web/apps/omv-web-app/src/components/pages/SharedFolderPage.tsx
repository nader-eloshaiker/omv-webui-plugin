// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's page (phase 5 shares design 2), for administrators: can this folder be reached,
// where is it, who may use it, and how do computers reach it? `address` is the folder's UUID from the
// route, already checked against the pattern (null when it failed): a null address makes no call
// (UI-4). Otherwise the page reads, in parallel, the whole-list reads of 2.1 and finds the row whose
// `uuid` matches exactly; every later call uses that row's fields, never the address. A normal user
// gets the "only administrators" page, and nothing is called first.
//
// The reader's unsaved work (the access grid's choices, the share form's values) is held here: while
// it exists the page does not read again on window focus, Refresh asks first, and leaving asks through
// the router's block (2.1, 2.8). After a deletion its result takes the place of the page's content.
// The folder's name is shown with its bidirectional controls as "�" in the breadcrumb, the title and
// the document title (format/isolate.ts), so a name cannot pass for another.
import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  ConfirmDialog,
  EmptyState,
  FactListSkeleton,
  JobResult,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useFormat } from "../../format/useFormat.ts";
import {
  useSharedFolderView,
  type SharedFolderView,
} from "../../hooks/useSharedFolderView.ts";
import { useSession } from "../../session/sessionContext.ts";
import {
  shareDeleteOf,
  shareDeletes,
  type DeleteWay,
  type ShareDeleteWords,
} from "../../sharedFolders/deleteRun.ts";
import {
  folderUse,
  holdsUnsaved,
  NO_ACCESS_DRAFT,
  type AccessDraft,
  type ShareDraft,
} from "../../sharedFolders/folderPage.ts";
import {
  forgetPending,
  sectionPending,
  sharesSession,
} from "../../sharedFolders/sharesSession.ts";
import { folderShareState, smbOn } from "../../sharedFolders/smbModel.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { FsNameSlot } from "../atoms/FsNameSlot.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { FolderStateView } from "../molecules/FolderStateView.tsx";
import { LeaveGuard } from "../molecules/LeaveGuard.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { FolderAccessSection } from "../organisms/FolderAccessSection.tsx";
import { FolderSmbSection } from "../organisms/FolderSmbSection.tsx";
import { FolderTodoCard } from "../organisms/FolderTodoCard.tsx";
import { FolderUsedBy } from "../organisms/FolderUsedBy.tsx";
import { RepointDialog } from "../organisms/RepointDialog.tsx";
import { ShareDeleteDialog } from "../organisms/ShareDeleteDialog.tsx";
import { ShareDeleteSection } from "../organisms/ShareDeleteSection.tsx";
import { SharedFolderSummary } from "../organisms/SharedFolderSummary.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function SharedFolderRoutePage() {
  const { folder } = useParams({
    from: "/_signedIn/storage/shared-folders/$folder",
  });
  return <SharedFolderPage address={folder} />;
}

export function SharedFolderPage({ address }: { address: string | null }) {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("sharedFolders.title")} />;
  }
  // A value that failed the address pattern never reaches a call (UI-4).
  return address === null ? <NotFound /> : <Found address={address} />;
}

function Crumbs({ current }: { current?: string }) {
  const { t } = useTranslation();
  return (
    <Breadcrumbs aria-label={t("app.breadcrumb")}>
      <BreadcrumbItem render={<Link to="/storage/shared-folders" />}>
        {t("sharedFolders.title")}
      </BreadcrumbItem>
      {current === undefined ? null : (
        <BreadcrumbItem current>
          <bdi dir="auto">{inertBidi(current)}</bdi>
        </BreadcrumbItem>
      )}
    </Breadcrumbs>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Crumbs />
      <PageTitle>{t("sharedFolders.title")}</PageTitle>
      <EmptyState
        action={
          <Link to="/storage/shared-folders" className={routerLinkClass}>
            {t("sharedFolder.toList")}
          </Link>
        }
      >
        {t("sharedFolder.notFound")}
      </EmptyState>
    </div>
  );
}

function Loading() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <p role="status" className="sr-only">
        {t("sharedFolder.loading")}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="w-24" />
        <Skeleton shape="block" className="h-8 w-56" />
        <Skeleton className="w-40" />
      </div>
      <FactListSkeleton rows={6} />
      {["access", "sharing"].map((part) => (
        <div key={part} aria-hidden="true" className="flex flex-col gap-2">
          <Skeleton shape="block" className="h-6 w-48" />
          <Skeleton className="w-2/3" />
        </div>
      ))}
    </div>
  );
}

interface Deleted {
  way: DeleteWay;
  /** "Stop here": the folder is removed and its change stays pending. */
  pending: boolean;
  words: ShareDeleteWords;
}

/** 8.5's result, in place of the page's content. */
function DeletedResult({ deleted }: { deleted: Deleted }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { words } = deleted;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Crumbs />
      <PageTitle>{t("sharedFolders.title")}</PageTitle>
      <JobResult
        result={{
          status: "succeeded",
          statusLabel: t("addStorage.state.succeeded"),
          message: (
            <>
              <span className="block">
                <Trans
                  i18nKey={
                    deleted.way === "keep"
                      ? "shareDelete.done.keep"
                      : "shareDelete.done.files"
                  }
                  components={{
                    folder: <FolderNameText value={words.folder} />,
                    fs: <FolderNameText value={words.fs} />,
                    path: <IdentifierText value={inertBidi(words.fullPath)} />,
                  }}
                />
              </span>
              {deleted.pending ? (
                <span className="block">
                  {t("shareDelete.failed.saveBody")}
                </span>
              ) : null}
            </>
          ),
        }}
        dismissLabel={t("zfsDelete.dismiss")}
        onDismiss={() => void navigate({ to: "/storage/shared-folders" })}
      />
      <p>
        <Link to="/storage/shared-folders" className={routerLinkClass}>
          {t("shareDelete.done.toList")}
        </Link>
      </p>
    </div>
  );
}

function Found({ address }: { address: string }) {
  const { t } = useTranslation();
  const [access, setAccess] = useState<AccessDraft>(NO_ACCESS_DRAFT);
  const [share, setShare] = useState<ShareDraft>(null);
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  useMemoryStore(shareDeletes);
  const accessDirty = Object.keys(access.choices).length > 0;
  // While the form is open or the grid holds changes, nothing reads again on focus (2.1).
  const v = useSharedFolderView(address, !accessDirty && share === null);

  if (deleted !== null) {
    return <DeletedResult deleted={deleted} />;
  }
  if (v.folders.data === undefined) {
    if (v.folders.isError) {
      return (
        <div className="flex min-w-0 flex-col gap-4">
          <Crumbs />
          <PageTitle>{t("sharedFolders.title")}</PageTitle>
          <ReadFailed
            error={v.folders.error}
            retrying={v.folders.isFetching}
            onRetry={() => void v.folders.refetch()}
          >
            {t("sharedFolder.loadFailed")}
          </ReadFailed>
        </div>
      );
    }
    return <Loading />;
  }
  const run = shareDeleteOf(address);
  if (v.row === undefined) {
    if (run !== undefined) {
      // The folder is gone from the list while its deletion's run lasts: its dialog stays (8.5).
      return (
        <div className="flex min-w-0 flex-col gap-4">
          <Crumbs />
          <PageTitle>{t("sharedFolders.title")}</PageTitle>
          <ShareDeleteDialog
            open
            onClose={() => undefined}
            uuid={address}
            name={run.words.folder}
            way={run.way}
            onWayChange={() => undefined}
            check={() => Promise.resolve({ kind: "gone" })}
            onDone={(outcome, way, words) => {
              if (outcome === "unknown") {
                void v.refresh();
                return;
              }
              setDeleted({ way, pending: outcome === "pending", words });
            }}
          />
        </div>
      );
    }
    return <NotFound />;
  }
  return (
    <Sections
      v={v}
      access={access}
      onAccessChange={setAccess}
      share={share}
      onShareChange={setShare}
      onDeleted={setDeleted}
    />
  );
}

function Sections({
  v,
  access,
  onAccessChange,
  share,
  onShareChange,
  onDeleted,
}: {
  v: SharedFolderView;
  access: AccessDraft;
  onAccessChange: (draft: AccessDraft) => void;
  share: ShareDraft;
  onShareChange: (draft: ShareDraft) => void;
  onDeleted: (deleted: Deleted) => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const memory = useMemoryStore(sharesSession);
  const stateRef = useRef<HTMLDivElement>(null);
  const repointRef = useRef<HTMLButtonElement>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const [repointOpen, setRepointOpen] = useState(false);
  const [askRefresh, setAskRefresh] = useState(false);
  const pendingRead = v.system.pending;

  // Once none of the shares modules is pending any more, this session's marks are forgotten (0.8).
  useEffect(() => {
    if (pendingRead !== undefined) {
      forgetPending(pendingRead);
    }
  }, [pendingRead]);

  const row = v.row;
  if (row === undefined || v.state === undefined) {
    return null;
  }
  const unsaved = holdsUnsaved(access, share, v.share);
  const refresh = () => {
    if (unsaved) {
      setAskRefresh(true);
      return;
    }
    void v.refresh();
  };
  const pending = v.pending;
  const mark = (section: "access" | "sharing" | "description") =>
    sectionPending(memory, row.uuid, section, pending);
  const shareView = folderShareState(v.share, smbOn(v.smb));
  const read = <T,>(q: {
    data: T | undefined;
    isError: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
  }) => ({
    data: q.data,
    failed: q.isError && q.data === undefined,
    error: q.error,
    retry: () => void q.refetch(),
  });
  const list = <T,>(q: {
    data: { data: T[] } | undefined;
    isError: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
  }) => ({
    data: q.data?.data,
    failed: q.isError && q.data === undefined,
    error: q.error,
    retry: () => void q.refetch(),
  });
  const shares = list(v.shares);
  const use = folderUse({
    used: row._used,
    hasShare: v.share !== undefined,
    shares: {
      ready: shares.data !== undefined,
      failed: shares.failed,
      error: shares.error,
    },
  });
  const readAt = v.folders.dataUpdatedAt;

  return (
    <div
      aria-busy={v.refreshing || undefined}
      className="flex min-w-0 flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <Crumbs current={row.name} />
        <PageTitle
          documentTitle={t("sharedFolder.docTitle", {
            folder: inertBidi(row.name),
          })}
        >
          <bdi dir="auto" className="[overflow-wrap:anywhere]">
            {inertBidi(row.name)}
          </bdi>
        </PageTitle>
        {v.fs !== undefined || row.device !== "" ? (
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="sharedFolder.subtitle"
              components={{
                fs: <FsNameSlot fs={v.fs} fallback={row.device} />,
              }}
            />
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div
          ref={stateRef}
          tabIndex={-1}
          role="status"
          className="outline-hidden"
        >
          <FolderStateView state={v.state} fs={v.fs} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p
            role="status"
            className="text-xs text-muted-foreground tabular-nums"
          >
            {readAt === 0 || v.refreshing
              ? ""
              : t("sharedFolder.readAt", { time: format.clock(readAt) })}
          </p>
          <Button
            variant="neutral"
            size="sm"
            loading={v.refreshing}
            onClick={refresh}
          >
            {t("sharedFolders.refresh")}
          </Button>
        </div>
      </div>

      {v.todo === null ? null : (
        <FolderTodoCard
          todo={v.todo}
          folder={row}
          fs={v.fs}
          repointRef={repointRef}
          onRepoint={() => setRepointOpen(true)}
        />
      )}

      <SharedFolderSummary
        folder={row}
        fs={v.fs}
        state={v.state}
        hostname={v.system.hostname}
        shared={shareView.kind === "shared" && v.settings.data?.enable === true}
        descriptionPending={mark("description")}
      />

      <FolderAccessSection
        key={row.uuid}
        folder={row}
        share={v.share}
        users={list(v.users)}
        groups={list(v.groups)}
        draft={access}
        onDraftChange={onAccessChange}
        pending={mark("access")}
      />

      <FolderSmbSection
        folder={row}
        shares={shares}
        settings={read(v.settings)}
        hostname={v.system.hostname}
        draft={share}
        onDraftChange={onShareChange}
        pending={mark("sharing")}
        stopOpen={stopOpen}
        onStopOpenChange={setStopOpen}
      />

      {use === null ? null : (
        <FolderUsedBy use={use} onRetry={() => void v.shares.refetch()} />
      )}

      <ShareDeleteSection
        folder={row}
        folders={list(v.folders)}
        shares={shares}
        fileSystems={list(v.fileSystems)}
        pending={pending}
        onRetry={() => void v.refresh()}
        onStopSharing={() => setStopOpen(true)}
        onDone={(outcome, way, words) => {
          if (outcome === "unknown") {
            void v.refresh();
            return;
          }
          onDeleted({ way, pending: outcome === "pending", words });
        }}
      />

      <RepointDialog
        open={repointOpen}
        onOpenChange={setRepointOpen}
        folder={row}
        folders={v.folders.data?.data ?? []}
        fileSystems={v.fileSystems.data?.data}
        share={v.share}
        pending={pending}
        finalFocus={stateRef}
        onSaved={() => void v.refresh()}
      />

      <ConfirmDialog
        open={askRefresh}
        onOpenChange={setAskRefresh}
        title={t("sharedFolder.unsaved.title")}
        description={t("sharedFolder.unsaved.body")}
        cancelLabel={t("sharedFolder.unsaved.keep")}
        confirmLabel={t("sharedFolder.unsaved.refresh")}
        onConfirm={() => {
          setAskRefresh(false);
          onAccessChange(NO_ACCESS_DRAFT);
          onShareChange(null);
          void v.refresh();
        }}
      />

      <LeaveGuard
        when={unsaved}
        words={{
          title: t("sharedFolder.unsaved.title"),
          body: t("sharedFolder.unsaved.leaveBody"),
          confirm: t("sharedFolder.unsaved.leave"),
          cancel: t("sharedFolder.unsaved.keep"),
        }}
      />
    </div>
  );
}
