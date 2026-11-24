// SPDX-License-Identifier: GPL-3.0-or-later
// A group's page (phase 5 users design 9), for administrators: who is in this group, and what can they
// open through it? `address` is the group's name from the route, already checked against OMV's name
// pattern (null when it failed): a null address makes no call (UI-4). Otherwise the page reads the
// whole getGroupList and finds the row whose `name` matches exactly; every later call uses that row's
// name, never the address. A system group is not in that list and is not found here. A normal user
// gets the "only administrators" page, and nothing is called first.
//
// The reader's unsaved work (the description being edited, the member ticks, the access choices) is
// held here: while it exists the page does not read again on window focus, Refresh asks first, and
// leaving asks through the router's block. After a deletion its result takes the place of the page.
// The group's name is shown with its bidirectional controls as "�" (format/isolate.ts).
import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  ConfirmDialog,
  EmptyState,
  FactListSkeleton,
  JobResult,
  Skeleton,
  useToast,
} from "@omv-webui/react-ui-components";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { useFormat } from "../../format/useFormat.ts";
import { groupDeleteOf, groupDeletes } from "../../groups/deleteGroupFlow.ts";
import { mainGroupMembers } from "../../groups/groupWrites.ts";
import {
  useSharedFoldersAll,
  useSharesSystem,
  useUserAccounts,
  useUserGroups,
} from "../../hooks/useSharesReads.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import type { FolderChoices } from "../../users/accessByAccount.ts";
import {
  accountId,
  accountSectionPending,
  usersSession,
} from "../../users/usersSession.ts";
import { GroupNameText } from "../atoms/GroupNameText.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { LeaveGuard } from "../molecules/LeaveGuard.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { AccountAccessSection } from "../organisms/AccountAccessSection.tsx";
import {
  GroupDeleteDialog,
  type GroupDeleteOutcome,
} from "../organisms/GroupDeleteDialog.tsx";
import {
  GroupDeleteSection,
  type GroupDeleteBlocker,
} from "../organisms/GroupDeleteSection.tsx";
import {
  GroupMembersSection,
  type MembersDraft,
} from "../organisms/GroupMembersSection.tsx";
import { GroupSummary } from "../organisms/GroupSummary.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function GroupRoutePage() {
  const { group } = useParams({ from: "/_signedIn/usermgmt/groups/$group" });
  return <GroupPage address={group} />;
}

export function GroupPage({ address }: { address: string | null }) {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("groups.title")} />;
  }
  // A value that failed the name pattern never reaches a call (UI-4).
  return address === null ? (
    <NotFound name={null} />
  ) : (
    <Found address={address} />
  );
}

function Crumbs({ current }: { current?: string }) {
  const { t } = useTranslation();
  return (
    <Breadcrumbs aria-label={t("app.breadcrumb")}>
      <BreadcrumbItem render={<Link to="/usermgmt/groups" />}>
        {t("groups.title")}
      </BreadcrumbItem>
      {current === undefined ? null : (
        <BreadcrumbItem current>
          <bdi dir="auto">{inertBidi(current)}</bdi>
        </BreadcrumbItem>
      )}
    </Breadcrumbs>
  );
}

/** 9.6: the name from the address is shown, as text, only when it matched the pattern. */
function NotFound({ name }: { name: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Crumbs />
      <PageTitle>{t("groups.title")}</PageTitle>
      <EmptyState
        action={
          <Link to="/usermgmt/groups" className={routerLinkClass}>
            {t("group.toList")}
          </Link>
        }
      >
        {name === null
          ? t("group.notFoundPlain")
          : t("group.notFound", { group: isolateName(name) })}
      </EmptyState>
    </div>
  );
}

function Loading() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <p role="status" className="sr-only">
        {t("group.loading")}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="w-24" />
        <Skeleton shape="block" className="h-8 w-56" />
        <Skeleton className="w-40" />
      </div>
      <FactListSkeleton rows={3} />
      {["members", "access"].map((part) => (
        <div key={part} aria-hidden="true" className="flex flex-col gap-2">
          <Skeleton shape="block" className="h-6 w-48" />
          <Skeleton className="w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** 11.3's result, in place of the page's content. */
function DeletedResult({ name, pending }: { name: string; pending: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const slot = <GroupNameText value={name} />;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Crumbs />
      <PageTitle>{t("groups.title")}</PageTitle>
      <JobResult
        result={{
          status: "succeeded",
          statusLabel: t("addStorage.state.succeeded"),
          message: (
            <>
              <span className="block">
                <Trans
                  i18nKey="groupDelete.done"
                  components={{ group: slot }}
                />
              </span>
              {pending ? (
                <span className="block">
                  <Trans
                    i18nKey="groupDelete.stoppedBody"
                    components={{ group: slot }}
                  />
                </span>
              ) : null}
            </>
          ),
        }}
        dismissLabel={t("zfsDelete.dismiss")}
        onDismiss={() => void navigate({ to: "/usermgmt/groups" })}
      />
      <p>
        <Link to="/usermgmt/groups" className={routerLinkClass}>
          {t("groupDelete.toList")}
        </Link>
      </p>
    </div>
  );
}

function Found({ address }: { address: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [description, setDescription] = useState<string | null>(null);
  const [members, setMembers] = useState<MembersDraft | null>(null);
  const [access, setAccess] = useState<FolderChoices>({});
  const [deleted, setDeleted] = useState<{ pending: boolean } | null>(null);
  useMemoryStore(groupDeletes);

  // While the description is open or a section holds changes, nothing reads again on focus (2.1's
  // rule), so a re-read never moves a row under the reader.
  const holding =
    description !== null || members !== null || Object.keys(access).length > 0;
  const focus = !holding;
  const groups = useUserGroups({ focus });
  const users = useUserAccounts({ focus });
  const folders = useSharedFoldersAll({ focus });
  const row = groups.data?.data.find((g) => g.name === address);
  const unsaved =
    (description !== null && description !== (row?.comment ?? "")) ||
    members !== null ||
    Object.keys(access).length > 0;

  const onDone = (outcome: GroupDeleteOutcome) => {
    if (outcome === "unknown") {
      void groups.refetch();
      return;
    }
    if (outcome === "putBack") {
      toast.show({
        title: t("groupDelete.putBackDone", { group: isolateName(address) }),
      });
      void groups.refetch();
      return;
    }
    setDeleted({ pending: outcome === "pending" });
  };

  if (deleted !== null) {
    return <DeletedResult name={address} pending={deleted.pending} />;
  }
  if (groups.data === undefined) {
    if (groups.isError) {
      return (
        <div className="flex min-w-0 flex-col gap-4">
          <Crumbs />
          <PageTitle>{t("groups.title")}</PageTitle>
          <ReadFailed
            error={groups.error}
            retrying={groups.isFetching}
            onRetry={() => void groups.refetch()}
          >
            {t("group.loadFailed")}
          </ReadFailed>
        </div>
      );
    }
    return <Loading />;
  }
  if (row === undefined) {
    if (groupDeleteOf(address) !== undefined) {
      // The group is gone from the list while its deletion's run lasts: its dialog stays (11.3).
      return (
        <div className="flex min-w-0 flex-col gap-4">
          <Crumbs />
          <PageTitle>{t("groups.title")}</PageTitle>
          <GroupDeleteDialog
            open
            onClose={() => undefined}
            name={address}
            check={() => Promise.resolve({ kind: "gone" })}
            onDone={onDone}
          />
        </div>
      );
    }
    return <NotFound name={address} />;
  }
  return (
    <Sections
      groupName={row.name}
      description={description}
      onDescriptionChange={setDescription}
      members={members}
      onMembersChange={setMembers}
      access={access}
      onAccessChange={setAccess}
      unsaved={unsaved}
      reads={{ groups, users, folders }}
      onDone={onDone}
    />
  );
}

interface Reads {
  groups: ReturnType<typeof useUserGroups>;
  users: ReturnType<typeof useUserAccounts>;
  folders: ReturnType<typeof useSharedFoldersAll>;
}

function Sections({
  groupName,
  description,
  onDescriptionChange,
  members,
  onMembersChange,
  access,
  onAccessChange,
  unsaved,
  reads,
  onDone,
}: {
  groupName: string;
  description: string | null;
  onDescriptionChange: (draft: string | null) => void;
  members: MembersDraft | null;
  onMembersChange: (draft: MembersDraft | null) => void;
  access: FolderChoices;
  onAccessChange: (next: FolderChoices) => void;
  unsaved: boolean;
  reads: Reads;
  onDone: (outcome: GroupDeleteOutcome) => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const memory = useMemoryStore(usersSession);
  const system = useSharesSystem();
  const [askRefresh, setAskRefresh] = useState(false);
  const pending = system.pending;
  const { groups, users, folders } = reads;

  const row = groups.data?.data.find((g) => g.name === groupName);
  if (row === undefined) {
    return null;
  }
  const id = accountId("group", row.name);
  const mark = (section: "members" | "description") =>
    accountSectionPending(memory, id, section, pending ?? []);
  const mainGroup =
    users.data === undefined ? [] : mainGroupMembers(row, users.data.data);
  const usersFailed = users.isError && users.data === undefined;
  const foldersFailed = folders.isError && folders.data === undefined;

  const reread = () => {
    void groups.refetch();
    void users.refetch();
    void folders.refetch();
  };
  const refresh = () => {
    if (unsaved) {
      setAskRefresh(true);
      return;
    }
    reread();
  };
  const blockers: GroupDeleteBlocker[] = [
    ...(usersFailed
      ? [{ kind: "unread" as const, error: users.error }]
      : foldersFailed
        ? [{ kind: "unread" as const, error: folders.error }]
        : []),
    ...(mainGroup.length > 0
      ? [{ kind: "mainGroup" as const, names: mainGroup }]
      : []),
  ];
  const refreshing = groups.isFetching || users.isFetching;
  const readAt = groups.dataUpdatedAt;
  const comment = row.comment ?? "";

  return (
    <div
      aria-busy={refreshing || undefined}
      className="flex min-w-0 flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <Crumbs current={row.name} />
        <PageTitle
          documentTitle={t("group.docTitle", { group: inertBidi(row.name) })}
        >
          <bdi dir="auto" className="[overflow-wrap:anywhere]">
            {inertBidi(row.name)}
          </bdi>
        </PageTitle>
        <p
          dir="auto"
          className="text-sm text-muted-foreground [overflow-wrap:anywhere]"
        >
          {comment === "" ? t("group.subtitleNone") : inertBidi(comment)}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p
            role="status"
            className="text-xs text-muted-foreground tabular-nums"
          >
            {readAt === 0 || refreshing
              ? ""
              : t("group.readAt", { time: format.clock(readAt) })}
          </p>
          <Button
            variant="neutral"
            size="sm"
            loading={refreshing}
            onClick={refresh}
          >
            {t("group.refresh")}
          </Button>
        </div>
      </div>

      <GroupSummary
        group={row}
        memberCount={(row.members?.length ?? 0) + mainGroup.length}
        descriptionPending={mark("description")}
        editing={description}
        onEditingChange={onDescriptionChange}
        onSaved={reread}
        onShowCurrent={reread}
      />

      <GroupMembersSection
        key={row.name}
        group={row}
        users={{
          data: users.data?.data,
          failed: usersFailed,
          error: users.error,
          retry: () => void users.refetch(),
        }}
        mainGroup={mainGroup}
        draft={members}
        onDraftChange={onMembersChange}
        pending={mark("members")}
        onSaved={reread}
        onShowCurrent={reread}
      />

      <AccountAccessSection
        kind="group"
        name={row.name}
        mode="save"
        choices={access}
        onChoicesChange={onAccessChange}
        sectionId="group-access"
        onSaved={reread}
      />

      <GroupDeleteSection
        name={row.name}
        blockers={blockers}
        onRetry={reread}
        onDone={onDone}
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
          onDescriptionChange(null);
          onMembersChange(null);
          onAccessChange({});
          reread();
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
