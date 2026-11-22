// SPDX-License-Identifier: GPL-3.0-or-later
// A person's page (phase 5 users design 2 to 5 and 7), for administrators: who is this, what can they
// open, and can they control the NAS? `address` is the account name from the route, already checked
// against OMV's pattern (null when it failed): a null address makes no call at all (UI-4). Otherwise
// the page reads, in parallel, the whole-list reads of 2.1 and finds the row whose `name` matches
// exactly; every later call uses that row's name, never the address. A built-in account is not in the
// list, so it is not found here. A normal user gets the "only administrators" page, and nothing is
// called first.
//
// The reader's unsaved work (the details being edited, what they can do, the groups ticked, the
// access grid's choices) is held here: while it exists the page does not read again on window focus,
// Refresh asks first, and leaving asks through the router's block (2.1, 2.7). A password typed in its
// dialog is never part of that: closing the dialog clears it (0.7). After a deletion its result takes
// the place of the page's content. The name is shown with its bidirectional controls as "�" in the
// breadcrumb, the title and the document title (format/isolate.ts).
import type { UserAccount } from "@omv-webui/react-api-omv/generated";
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
import { homeState } from "../../homeFolders/homeModel.ts";
import {
  useShareFileSystems,
  useSharedFoldersAll,
  useSharesSystem,
  useSmbShares,
  useUserAccounts,
  useUserGroups,
} from "../../hooks/useSharesReads.ts";
import {
  useGroupCheck,
  useHomeSettings,
  useSshSettings,
  useUsersServices,
} from "../../hooks/useUsersReads.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import {
  accessByAccount,
  type FolderChoices,
} from "../../users/accessByAccount.ts";
import {
  personDeleteOf,
  personDeletes,
  type DeleteStep,
} from "../../users/deletePersonFlow.ts";
import { personTodo, sshLineOf, type Powers } from "../../users/personPage.ts";
import { ADMIN_GROUP, SSH_GROUP } from "../../users/systemGroups.ts";
import { selfReading, sshReading } from "../../users/userModel.ts";
import { warnedGroupsOf } from "../../users/usersList.ts";
import {
  accountId,
  accountSectionPending,
  forgetUsersPending,
  usersSession,
} from "../../users/usersSession.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PersonNameText } from "../atoms/PersonNameText.tsx";
import { Slotted } from "../atoms/Slotted.tsx";
import { LeaveGuard } from "../molecules/LeaveGuard.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { AccountAccessSection } from "../organisms/AccountAccessSection.tsx";
import type { PersonDeleteOutcome } from "../organisms/PersonDeleteDialog.tsx";
import { PersonDeleteSection } from "../organisms/PersonDeleteSection.tsx";
import { PersonGroupsSection } from "../organisms/PersonGroupsSection.tsx";
import { PersonPasswordSection } from "../organisms/PersonPasswordSection.tsx";
import { PersonPowersSection } from "../organisms/PersonPowersSection.tsx";
import {
  PersonSummaryCard,
  type DetailsDraft,
  type HomeFact,
} from "../organisms/PersonSummaryCard.tsx";
import { PersonTodoCard } from "../organisms/PersonTodoCard.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function PersonRoutePage() {
  const { name } = useParams({ from: "/_signedIn/usermgmt/users/$name" });
  return <PersonPage address={name} />;
}

export function PersonPage({ address }: { address: string | null }) {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("users.title")} />;
  }
  // A value that failed the name pattern never reaches a call (UI-4).
  return address === null ? (
    <NotFound name={null} />
  ) : (
    <Found address={address} sessionName={session.username} />
  );
}

function Crumbs({ current }: { current?: string }) {
  const { t } = useTranslation();
  return (
    <Breadcrumbs aria-label={t("app.breadcrumb")}>
      <BreadcrumbItem render={<Link to="/usermgmt/users" />}>
        {t("users.title")}
      </BreadcrumbItem>
      {current === undefined ? null : (
        <BreadcrumbItem current>
          <bdi dir="auto">{inertBidi(current)}</bdi>
        </BreadcrumbItem>
      )}
    </Breadcrumbs>
  );
}

/** 2.6: the address's name, as text, only when it matched the pattern. */
function NotFound({ name }: { name: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Crumbs />
      <PageTitle>{t("users.title")}</PageTitle>
      <EmptyState
        action={
          <Link to="/usermgmt/users" className={routerLinkClass}>
            {t("person.toList")}
          </Link>
        }
      >
        {name === null ? (
          t("person.notFoundPlain")
        ) : (
          <Slotted
            sentence={(tokens) => t("person.notFound", tokens)}
            values={{ name: <PersonNameText value={name} /> }}
          />
        )}
      </EmptyState>
    </div>
  );
}

function Loading() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex min-w-0 flex-col gap-6">
      <p role="status" className="text-muted-foreground">
        {t("person.loading")}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="w-24" />
        <Skeleton shape="block" className="h-8 w-56" />
      </div>
      <FactListSkeleton rows={6} />
      {["can", "groups", "access", "password"].map((part) => (
        <div key={part} aria-hidden="true" className="flex flex-col gap-2">
          <Skeleton shape="block" className="h-6 w-48" />
          <Skeleton className="w-2/3" />
        </div>
      ))}
    </div>
  );
}

interface Deleted {
  name: string;
  stoppedAt: DeleteStep | undefined;
}

/** 7.4's result, in place of the page's content. */
function DeletedResult({ deleted }: { deleted: Deleted }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const slot = { name: <PersonNameText value={deleted.name} /> };
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Crumbs />
      <PageTitle>{t("users.title")}</PageTitle>
      <JobResult
        result={{
          status: "succeeded",
          statusLabel: t("addStorage.state.succeeded"),
          message: (
            <>
              <span className="block">
                <Trans i18nKey="personDelete.done" components={slot} />
              </span>
              {deleted.stoppedAt === "access" ? (
                <span className="block">
                  {t("personDelete.failed.accessStop")}
                </span>
              ) : deleted.stoppedAt === "save" ? (
                <span className="block">
                  <Trans
                    i18nKey="personDelete.failed.saveBody"
                    components={slot}
                  />
                </span>
              ) : null}
            </>
          ),
        }}
        dismissLabel={t("zfsDelete.dismiss")}
        onDismiss={() => void navigate({ to: "/usermgmt/users" })}
      />
      <p>
        <Link to="/usermgmt/users" className={routerLinkClass}>
          {t("personDelete.toList")}
        </Link>
      </p>
    </div>
  );
}

interface Drafts {
  details: DetailsDraft | null;
  powers: Powers | null;
  groups: string[] | null;
  access: FolderChoices;
}

const NO_DRAFTS: Drafts = {
  details: null,
  powers: null,
  groups: null,
  access: {},
};

const holdsUnsaved = (d: Drafts) =>
  d.details !== null ||
  d.powers !== null ||
  d.groups !== null ||
  Object.keys(d.access).length > 0;

function Found({
  address,
  sessionName,
}: {
  address: string;
  sessionName: string | null;
}) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<Drafts>(NO_DRAFTS);
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  const lastRowRef = useRef<UserAccount | undefined>(undefined);
  useMemoryStore(personDeletes);
  const unsaved = holdsUnsaved(drafts);
  // While a section holds changes, nothing reads again on focus (2.1).
  const people = useUserAccounts({ focus: !unsaved });

  if (deleted !== null) {
    return <DeletedResult deleted={deleted} />;
  }
  if (people.data === undefined) {
    if (people.isError) {
      return (
        <div className="flex min-w-0 flex-col gap-4">
          <Crumbs />
          <PageTitle>{t("users.title")}</PageTitle>
          <ReadFailed
            error={people.error}
            retrying={people.isFetching}
            onRetry={() => void people.refetch()}
          >
            {t("person.loadFailed")}
          </ReadFailed>
        </div>
      );
    }
    return <Loading />;
  }
  const listed = people.data.data.find((u) => u.name === address);
  // While this session's deletion of them runs, the page (and its dialog) stays on the row it had.
  const row =
    listed ??
    (personDeleteOf(address) === undefined ? undefined : lastRowRef.current);
  if (row === undefined) {
    return <NotFound name={address} />;
  }
  lastRowRef.current = row;
  return (
    <Sections
      person={row}
      users={people.data.data}
      readAt={people.dataUpdatedAt}
      refreshing={people.isFetching}
      refetchPeople={() => void people.refetch()}
      sessionName={sessionName}
      drafts={drafts}
      onDraftsChange={setDrafts}
      onDeleted={setDeleted}
    />
  );
}

function Sections({
  person,
  users,
  readAt,
  refreshing,
  refetchPeople,
  sessionName,
  drafts,
  onDraftsChange,
  onDeleted,
}: {
  person: UserAccount;
  users: readonly UserAccount[];
  readAt: number;
  refreshing: boolean;
  refetchPeople: () => void;
  sessionName: string | null;
  drafts: Drafts;
  onDraftsChange: (next: Drafts) => void;
  onDeleted: (deleted: Deleted) => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const memory = useMemoryStore(usersSession);
  const accessRef = useRef<HTMLHeadingElement>(null);
  const [askRefresh, setAskRefresh] = useState(false);
  const unsaved = holdsUnsaved(drafts);
  const focus = { focus: !unsaved };
  const groups = useUserGroups(focus);
  const folders = useSharedFoldersAll(focus);
  const shares = useSmbShares(focus);
  const fileSystems = useShareFileSystems(focus);
  const ssh = useSshSettings(focus);
  const services = useUsersServices(focus);
  const home = useHomeSettings(focus);
  const system = useSharesSystem();
  const adminGroup = useGroupCheck(ADMIN_GROUP);
  const sshGroup = useGroupCheck(SSH_GROUP);
  const pendingRead = system.pending;

  // Once none of the slice's modules is pending any more, this session's marks are forgotten (0.4).
  useEffect(() => {
    if (pendingRead !== undefined) {
      forgetUsersPending(pendingRead);
    }
  }, [pendingRead]);

  const name = person.name;
  const pending = pendingRead ?? [];
  const self = selfReading(sessionName, name);
  const id = accountId("user", name);
  const edit = (change: Partial<Drafts>) =>
    onDraftsChange({ ...drafts, ...change });

  const refreshAll = () => {
    refetchPeople();
    void groups.refetch();
    void folders.refetch();
    void shares.refetch();
    void fileSystems.refetch();
    void ssh.refetch();
    void services.refetch();
    void home.refetch();
  };
  const refresh = () => {
    if (unsaved) {
      setAskRefresh(true);
      return;
    }
    refreshAll();
  };
  // "Show the current details": read again; every section keeps the reader's changes.
  const showCurrent = () => refreshAll();

  const sshService = services.data?.data.find((s) => s.name === "ssh");
  const reading = sshReading(person, {
    settings: ssh.isError ? null : (ssh.data ?? null),
    running: sshService?.running,
    pending: pending.includes("ssh"),
  });
  const omvGroups = groups.data?.data;
  const rows =
    folders.data === undefined || omvGroups === undefined
      ? undefined
      : accessByAccount(
          "user",
          name,
          folders.data.data,
          users,
          omvGroups,
          shares.data?.data ?? [],
        );
  const homeRead =
    home.data === undefined || folders.data === undefined
      ? undefined
      : homeState(
          home.data,
          folders.data.data,
          fileSystems.data?.data ?? [],
          pending,
        );
  const homeFact: HomeFact =
    homeRead === undefined
      ? { kind: "unknown" }
      : homeRead.kind === "on"
        ? { kind: "on", folder: homeRead.folder }
        : homeRead.kind === "off"
          ? { kind: "off" }
          : { kind: "gone" };
  const todo = personTodo({
    warnedGroups:
      omvGroups === undefined ? [] : warnedGroupsOf(person, omvGroups),
    ssh: reading,
    rows,
    home: homeRead,
  });
  const unreadForDelete = folders.isError
    ? { error: folders.error }
    : shares.isError
      ? { error: shares.error }
      : home.isError
        ? { error: home.error }
        : null;

  return (
    <div
      aria-busy={refreshing || undefined}
      className="flex min-w-0 flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <Crumbs current={name} />
        <PageTitle
          documentTitle={t("person.docTitle", { name: inertBidi(name) })}
        >
          <bdi dir="auto" className="[overflow-wrap:anywhere]">
            {inertBidi(name)}
          </bdi>
        </PageTitle>
        <p className="text-sm text-muted-foreground">
          {(person.comment ?? "") === "" ? (
            t("person.subtitleNone")
          ) : (
            <bdi dir="auto" className="[overflow-wrap:anywhere]">
              {inertBidi(person.comment ?? "")}
            </bdi>
          )}
        </p>
        {self === "self" ? (
          <p className="text-sm">
            {t("person.isYou")}{" "}
            <Link to="/account/settings" className={routerLinkClass}>
              {t("person.yourAccount")}
            </Link>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p
            role="status"
            className="text-xs text-muted-foreground tabular-nums"
          >
            {readAt === 0 || refreshing
              ? ""
              : t("sharedFolder.readAt", { time: format.clock(readAt) })}
          </p>
          <Button
            variant="neutral"
            size="sm"
            loading={refreshing}
            onClick={refresh}
          >
            {t("sharedFolders.refresh")}
          </Button>
        </div>
      </div>

      {todo === null ? null : (
        <PersonTodoCard
          todo={todo}
          name={name}
          onChooseFolders={() => accessRef.current?.focus()}
        />
      )}

      <PersonSummaryCard
        person={person}
        home={homeFact}
        emailPending={accountSectionPending(memory, id, "email", pending)}
        draft={drafts.details}
        onDraftChange={(details) => edit({ details })}
        onShowCurrent={showCurrent}
      />

      <PersonPowersSection
        person={person}
        users={users}
        groups={omvGroups}
        self={self}
        adminGroup={adminGroup}
        sshGroup={sshGroup}
        sshLine={sshLineOf(
          ssh.data,
          ssh.isError,
          (person.sshpubkeys ?? []).length,
        )}
        draft={drafts.powers}
        onDraftChange={(powers) => edit({ powers })}
        onSaved={() => undefined}
        onShowCurrent={showCurrent}
      />

      <PersonGroupsSection
        person={person}
        groups={{
          data: omvGroups,
          failed: groups.isError && groups.data === undefined,
          error: groups.error,
          retry: () => void groups.refetch(),
        }}
        draft={drafts.groups}
        onDraftChange={(next) => edit({ groups: next })}
        onSaved={() => void folders.refetch()}
        onShowCurrent={showCurrent}
      />

      <AccountAccessSection
        kind="user"
        name={name}
        mode="save"
        sectionId="person-access"
        headingRef={accessRef}
        choices={drafts.access}
        onChoicesChange={(access) => edit({ access })}
      />

      <PersonPasswordSection
        person={person}
        self={self}
        onShowCurrent={showCurrent}
      />

      <PersonDeleteSection
        person={person}
        self={self}
        unread={unreadForDelete}
        onRetry={refreshAll}
        onShowCurrent={showCurrent}
        onDone={(outcome: PersonDeleteOutcome, at?: DeleteStep) => {
          if (outcome === "unknown") {
            refreshAll();
            return;
          }
          onDraftsChange(NO_DRAFTS);
          onDeleted({ name, stoppedAt: at });
        }}
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
          onDraftsChange(NO_DRAFTS);
          refreshAll();
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
