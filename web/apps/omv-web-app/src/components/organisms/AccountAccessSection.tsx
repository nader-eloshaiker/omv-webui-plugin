// SPDX-License-Identifier: GPL-3.0-or-later
// "Shared folders" for one person or one group (phase 5 users design 4.2, 9.5; 0.10, 0.11; P13): the
// shares slice's access grid turned round, one row per shared folder in natural order of name, the
// choice being this account's own entry in that folder's list. The same component on a person's page,
// a group's page, and in the two add flows:
//
// - mode "save" (an existing account): "Save access" writes each changed folder in turn, its row
//   re-read from ShareMgmt.getList just before (R4), with the whole list sent back (every other entry
//   kept, entries for accounts that no longer exist dropped, as the folder's own page does). A folder
//   whose list would leave nobody with access while it is shared over SMB with guest access off is
//   refused in its row and not written (0.10); one whose list changed since the grid was opened stops
//   with "Show the current access"; a failed write says which folders were saved and which were not,
//   with "Try again" for the rest. Nothing retries by itself (UI-14). Saved: a toast, the band, the
//   pending mark beside the heading, and each folder's own page marks its access pending too.
// - mode "choose" (an add flow, the account not yet made): every row starts at No access (A5), the
//   group lines follow the flow's own ticks (`draft`), and nothing is written here: the choices go to
//   the caller, whose run writes them after the account exists.
//
// The choices are the caller's (a page's unsaved-changes guard, a flow's draft). While they hold a
// change the grid is drawn on the lists it was opened on, so a re-read never moves a row under the
// reader. Everything from the server is text (UI-2).
import type {
  SharedFolder,
  SharedFolderPrivileges,
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  AccessGrid,
  Button,
  ExternalLink,
  InlineAlert,
  ServerMessage,
  buttonRowClass,
  useToast,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useId, useState, type ReactNode, type Ref } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolate, isolateName } from "../../format/isolate.ts";
import { useDebounced } from "../../hooks/useDebounced.ts";
import {
  useShareServices,
  useSharedFoldersAll,
  useSharesSystem,
  useSmbSettings,
  useSmbShares,
  useUserAccounts,
  useUserGroups,
} from "../../hooks/useSharesReads.ts";
import { useUsersApi } from "../../hooks/useUsersApi.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import {
  GIVES_ACCESS,
  NORMAL_ACCESS,
  anyoneHasAccess,
  changedElsewhere,
  type Access,
  type AccessKind,
} from "../../sharedFolders/accessModel.ts";
import { isFolderAddress } from "../../sharedFolders/folderAddress.ts";
import {
  beginAction,
  endAction,
  recordSaved,
  runningOn,
  type SharesAction,
} from "../../sharedFolders/sharesSession.ts";
import {
  shareOf,
  sharingCell,
  smbOn,
  smbState,
  type SharingCell,
} from "../../sharedFolders/smbModel.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import {
  accessByAccount,
  changedFolders,
  folderAllowed,
  folderValue,
  guestsToo,
  leavesNobody,
  listToSave,
  membersWithOwnEntry,
  personLine,
  type FolderChoices,
  type FolderRow,
} from "../../users/accessByAccount.ts";
import {
  accountId,
  accountSectionPending,
  beginAccountAction,
  endAccountAction,
  forgetAdded,
  recordAccountSaved,
  runningOnAccount,
  usersSession,
  type AccountAction,
} from "../../users/usersSession.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { FolderStatus } from "../atoms/FolderStatus.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { PersonNameText } from "../atoms/PersonNameText.tsx";

/**
 * The account an add flow has not made yet, so the grid's lines follow the form: for a person, the
 * OMV groups ticked so far; for a group, the people ticked as its members.
 */
export interface NewAccountDraft {
  /** A new person's chosen groups (made in OMV), by name. */
  groups?: readonly string[];
  /** A new group's chosen members, by name. */
  members?: readonly string[];
}

export interface AccountAccessSectionProps {
  /** Whose access: a person ("user") or a group. */
  kind: AccessKind;
  /**
   * The account's name: the listed row's `name` for an existing account (never the address), or
   * what the reader typed in an add flow.
   */
  name: string;
  /** The reader's choices, by folder UUID; a folder without one shows what it stores. */
  choices: FolderChoices;
  /** The choices after a change in the grid (a row, or "Set all shown to"). Not a save. */
  onChoicesChange: (next: FolderChoices) => void;
  /**
   * "save": an existing account; the section saves each changed folder itself. "choose": an add
   * flow; nothing is written here and every folder starts at No access.
   */
  mode: "save" | "choose";
  /** In "choose" mode: the not-yet-made account's groups or members, for the group lines. */
  draft?: NewAccountDraft;
  /** The heading's level: 2 on a page (the default), 3 inside a flow's form. */
  headingLevel?: 2 | 3;
  /** The heading, so a caller can move focus to it ("Choose shared folders", a flow's problem). */
  headingRef?: Ref<HTMLHeadingElement>;
  /** The sentence under the heading; by default the design's for this kind and mode. */
  intro?: ReactNode;
  /** A problem the caller found (an add flow's check), shown under the intro. */
  error?: ReactNode;
  /** In "save" mode: a save wrote at least one folder (the page re-reads what depends on it). */
  onSaved?: () => void;
  /** The section element's id, for a link to it ("#person-access"). */
  sectionId?: string;
}

type Refusal =
  { kind: "lastAccess" } | { kind: "running"; action: SharesAction };

type Alert =
  | { kind: "running"; action: AccountAction }
  | {
      kind: "partial";
      saved: string[];
      failed: string[];
      error: unknown;
    }
  | { kind: "changedElsewhere"; folders: SharedFolder[] }
  | { kind: "gone"; folders: string[] };

const isEmpty = (choices: FolderChoices) => Object.keys(choices).length === 0;

/** The Sharing column (4.2): the shares list's words, or the folder's pill when it is not OK. */
function SharingWords({
  folder,
  cell,
}: {
  folder: SharedFolder;
  cell: SharingCell;
}) {
  const { t } = useTranslation();
  if (folder.status !== "OK") {
    return <FolderStatus status={folder.status} />;
  }
  switch (cell.kind) {
    case "none":
      return <span>{t("personAccess.notShared")}</span>;
    case "unknown":
      return (
        <span className="text-muted-foreground">
          {t("sharedFolders.sharing.unknown")}
        </span>
      );
    default:
      return (
        <span className="flex flex-col">
          <span>
            {t(
              cell.kind === "smb"
                ? "sharedFolders.sharing.smb"
                : "sharedFolders.sharing.smbOff",
            )}
          </span>
          {cell.guests ? (
            <span className="text-sm">{t("sharedFolders.sharing.guests")}</span>
          ) : null}
        </span>
      );
  }
}

/** The lists with the account an add flow has not made yet (choose mode). */
function withDraft(
  kind: AccessKind,
  name: string,
  users: readonly UserAccount[],
  groups: readonly UserGroup[],
  draft: NewAccountDraft | undefined,
): { users: UserAccount[]; groups: UserGroup[] } {
  if (kind === "user") {
    return {
      users: [
        ...users.filter((u) => u.name !== name),
        { name, groups: ["users", ...(draft?.groups ?? [])] },
      ],
      groups: [...groups],
    };
  }
  return {
    users: [...users],
    groups: [
      ...groups.filter((g) => g.name !== name),
      { name, members: [...(draft?.members ?? [])] },
    ],
  };
}

export function AccountAccessSection({
  kind,
  name,
  choices,
  onChoicesChange,
  mode,
  draft,
  headingLevel = 2,
  headingRef,
  intro,
  error,
  onSaved,
  sectionId,
}: AccountAccessSectionProps) {
  const { t } = useTranslation();
  const api = useUsersApi();
  const toast = useToast();
  const headingId = useId();
  const nothingId = useId();
  const folders = useSharedFoldersAll();
  const users = useUserAccounts();
  const groups = useUserGroups();
  const shares = useSmbShares();
  const settings = useSmbSettings();
  const services = useShareServices();
  const system = useSharesSystem();
  const memory = useMemoryStore(usersSession);
  const id = accountId(kind, name);
  const saveMode = mode === "save";

  // The lists the grid was opened on, by folder, while it holds a change (save mode only).
  const [base, setBase] = useState<Record<
    string,
    SharedFolderPrivileges | undefined
  > | null>(null);
  const [refusals, setRefusals] = useState<Record<string, Refusal>>({});
  const [alert, setAlert] = useState<Alert | null>(null);
  const [progress, setProgress] = useState<{
    done: number;
    count: number;
  } | null>(null);
  const saving = progress !== null;

  const failedRead = folders.isError
    ? { q: folders, words: t("personAccess.loadFailed") }
    : users.isError
      ? { q: users, words: t("users.loadFailed") }
      : groups.isError
        ? { q: groups, words: t("personGroups.loadFailed") }
        : null;

  const pending = system.pending ?? [];
  const on = smbOn(
    smbState(
      { data: settings.data, failed: settings.isError, error: settings.error },
      {
        data: services.data?.data,
        failed: services.isError,
        error: services.error,
      },
      pending,
    ),
  );
  const sharesRead = {
    data: shares.data?.data,
    failed: shares.isError,
    error: shares.error,
  };

  let rows: FolderRow[] | undefined;
  if (
    failedRead === null &&
    folders.data !== undefined &&
    users.data !== undefined &&
    groups.data !== undefined
  ) {
    const lists = saveMode
      ? { users: users.data.data, groups: groups.data.data }
      : withDraft(kind, name, users.data.data, groups.data.data, draft);
    const shown =
      saveMode && base !== null && !isEmpty(choices)
        ? folders.data.data.map((f) =>
            Object.hasOwn(base, f.uuid)
              ? { ...f, privileges: base[f.uuid] }
              : f,
          )
        : folders.data.data;
    // In an add flow a folder has no entry for the new name, so its row starts at No access (A5),
    // unless an entry left by an account of that name deleted earlier is still there: the new account
    // would get that access, so the row says so.
    rows = accessByAccount(
      kind,
      name,
      shown,
      lists.users,
      lists.groups,
      shares.data?.data ?? [],
    );
  }

  const count = rows === undefined ? 0 : changedFolders(rows, choices).length;
  const announced = useDebounced(count, 500);

  const accessWord = (access: Access) => t(`access.${access}`);
  const notes = (r: FolderRow): ReactNode[] => {
    const out: ReactNode[] = [];
    if (r.row.kind === "user") {
      const line = personLine(r, choices);
      if (line !== null) {
        switch (line.kind) {
          case "viaGroup":
            out.push(
              t("access.viaGroup", {
                access: accessWord(line.access),
                group: isolateName(line.group),
              }),
            );
            break;
          case "blockedVia":
            out.push(
              t("access.blockedVia", { group: isolateName(line.group) }),
            );
            break;
          case "groupBlocks":
            out.push(
              t("access.blockedByGroup", { group: isolateName(line.group) }),
            );
            break;
        }
      } else if (folderValue(r, choices) === "blocked") {
        out.push(t("access.blockedHint"));
      }
    } else {
      const own = membersWithOwnEntry(r);
      if (own > 0) {
        out.push(t("group.access.ownEntries", { count: own }));
      }
    }
    if (guestsToo(r)) {
      out.push(t("personAccess.guests"));
    }
    return out;
  };

  const refusalWords = (r: FolderRow): ReactNode => {
    const refusal = refusals[r.id];
    if (refusal === undefined) {
      return undefined;
    }
    return refusal.kind === "lastAccess" ? (
      <Trans
        i18nKey="personAccess.lastAccess"
        components={{
          name: <PersonNameText value={name} />,
          folder: <FolderNameText value={r.folder.name} />,
        }}
      />
    ) : (
      t("shareDelete.blocked.running", {
        action: t(`shares.action.${refusal.action}`),
      })
    );
  };

  const gridRows =
    rows?.map((r) => {
      const lines = notes(r);
      const uuid = r.folder.uuid;
      return {
        id: r.id,
        name: inertBidi(r.folder.name),
        description:
          r.folder.comment === "" ? undefined : inertBidi(r.folder.comment),
        notes: lines.length === 0 ? undefined : lines,
        nameLink: isFolderAddress(uuid)
          ? {
              "aria-label": t("personAccess.open", {
                folder: inertBidi(r.folder.name),
              }),
              render: (props: {
                "aria-label": string;
                className: string;
                children: ReactNode;
              }) => (
                <Link
                  to="/storage/shared-folders/$folder"
                  params={{ folder: uuid }}
                  hash="folder-access"
                  {...props}
                />
              ),
            }
          : undefined,
        kind: (
          <SharingWords
            folder={r.folder}
            cell={sharingCell(uuid, sharesRead, on)}
          />
        ),
        value: folderValue(r, choices),
        initialValue: r.row.stored,
        allowedValues: folderAllowed(r),
        refusal: refusalWords(r),
      };
    }) ?? [];

  /** The reader changed rows in the grid: keep only real changes; the base is taken on the first. */
  const change = (ids: readonly string[], value: Access) => {
    if (rows === undefined) {
      return;
    }
    const stored = new Map(rows.map((r) => [r.id, r.row.stored]));
    const touched = ids.filter((folderId) => stored.has(folderId));
    // A row set back to what it stores is no longer a change.
    const next: Record<string, Access> = Object.fromEntries([
      ...Object.entries(choices).filter(([k]) => !touched.includes(k)),
      ...touched
        .filter((folderId) => stored.get(folderId) !== value)
        .map((folderId) => [folderId, value] as const),
    ]);
    if (saveMode && isEmpty(choices) && !isEmpty(next)) {
      setBase(
        Object.fromEntries(
          (folders.data?.data ?? []).map((f) => [f.uuid, f.privileges]),
        ),
      );
    }
    if (Object.keys(refusals).some((k) => ids.includes(k))) {
      setRefusals((now) =>
        Object.fromEntries(
          Object.entries(now).filter(([k]) => !ids.includes(k)),
        ),
      );
    }
    setAlert(null);
    onChoicesChange(next);
  };

  const save = async () => {
    if (rows === undefined || saving) {
      return;
    }
    const changed = changedFolders(rows, choices);
    if (changed.length === 0) {
      return;
    }
    setAlert(null);
    setRefusals({});
    if (!beginAccountAction(id, "access")) {
      const action = runningOnAccount(id);
      if (action !== null) {
        setAlert({ kind: "running", action });
      }
      return;
    }
    setProgress({ done: 0, count: changed.length });
    const saved: FolderRow[] = [];
    const failed: FolderRow[] = [];
    const elsewhere: SharedFolder[] = [];
    const gone: string[] = [];
    const refused: Record<string, Refusal> = {};
    let firstError: unknown = undefined;
    try {
      let sharesNow;
      try {
        sharesNow = await api.shares();
      } catch (e) {
        sharesNow = null;
        firstError = e;
      }
      for (const [index, r] of changed.entries()) {
        setProgress({ done: index, count: changed.length });
        const uuid = r.folder.uuid;
        if (!beginAction(uuid, "access")) {
          const action = runningOn(uuid);
          refused[uuid] = { kind: "running", action: action ?? "access" };
          continue;
        }
        try {
          const now = (await api.folders()).find((f) => f.uuid === uuid);
          if (now === undefined) {
            gone.push(r.folder.name);
            continue;
          }
          if (changedElsewhere(r.folder.privileges, now.privileges)) {
            elsewhere.push(now);
            continue;
          }
          const value = folderValue(r, choices);
          const list = listToSave(r, value);
          if (sharesNow === null) {
            // Without the SMB list the last-access rule cannot be checked: a list that would leave
            // nobody is not written (fail closed); any other is.
            if (!anyoneHasAccess(list)) {
              failed.push(r);
              continue;
            }
          } else if (leavesNobody(shareOf(sharesNow, uuid), list)) {
            refused[uuid] = { kind: "lastAccess" };
            continue;
          }
          await api.setPrivileges(uuid, list);
          recordSaved(uuid, "access");
          saved.push(r);
        } catch (e) {
          failed.push(r);
          firstError ??= e;
        } finally {
          endAction(uuid);
        }
      }
    } finally {
      setProgress(null);
      endAccountAction(id);
    }

    if (saved.length > 0) {
      recordAccountSaved(id, "access");
      if (kind === "user") {
        // The access an add flow chose no longer stands as the unfinished line's yardstick (1.5).
        forgetAdded(name);
      }
      // The lists as stored now, so the saved rows show what was saved once their choice is cleared.
      const fresh = await api.folders().catch(() => undefined);
      const savedIds = new Set(saved.map((r) => r.id));
      const next = Object.fromEntries(
        Object.entries(choices).filter(([k]) => !savedIds.has(k)),
      );
      setBase((now) => {
        if (isEmpty(next) || now === null) {
          return null;
        }
        const updated = { ...now };
        for (const f of fresh ?? []) {
          if (savedIds.has(f.uuid)) {
            updated[f.uuid] = f.privileges;
          }
        }
        return updated;
      });
      onChoicesChange(next);
      onSaved?.();
    }
    setRefusals(refused);
    if (failed.length > 0) {
      setAlert({
        kind: "partial",
        saved: saved.map((r) => r.folder.name),
        failed: failed.map((r) => r.folder.name),
        error: firstError,
      });
    } else if (elsewhere.length > 0) {
      setAlert({ kind: "changedElsewhere", folders: elsewhere });
    } else if (gone.length > 0) {
      setAlert({ kind: "gone", folders: gone });
    }
    if (
      saved.length > 0 &&
      failed.length === 0 &&
      elsewhere.length === 0 &&
      gone.length === 0 &&
      Object.keys(refused).length === 0
    ) {
      toast.show({
        title: t("personAccess.saved", { name: isolateName(name) }),
      });
    }
  };

  /** "Show the current access": those folders are drawn on their lists as read now; the choices stay. */
  const showCurrent = () => {
    if (alert?.kind !== "changedElsewhere") {
      return;
    }
    const now = alert.folders;
    setBase((b) =>
      b === null
        ? b
        : {
            ...b,
            ...Object.fromEntries(now.map((f) => [f.uuid, f.privileges])),
          },
    );
    setAlert(null);
  };

  const discard = () => {
    setAlert(null);
    setRefusals({});
    setBase(null);
    onChoicesChange({});
  };

  const listNames = (names: readonly string[]) =>
    new Intl.ListFormat(undefined, { type: "conjunction" }).format(
      names.map(isolateName),
    );

  let alertView: ReactNode = null;
  if (alert !== null) {
    switch (alert.kind) {
      case "running":
        alertView = (
          <InlineAlert tone="neutral">
            {t("personDelete.blocked.running", {
              action: t(`users.action.${alert.action}`),
            })}
          </InlineAlert>
        );
        break;
      case "partial":
        alertView = (
          <InlineAlert tone="critical">
            <span className="flex flex-col items-start gap-2">
              <span>
                {alert.saved.length > 0
                  ? t("personAccess.partial", {
                      saved: listNames(alert.saved),
                      failed: listNames(alert.failed),
                      message: isRpcError(alert.error)
                        ? alert.error.message
                        : "",
                    })
                  : t("personAccess.failed", {
                      failed: listNames(alert.failed),
                    })}
              </span>
              {alert.saved.length === 0 && isRpcError(alert.error) ? (
                <ServerMessage label={t("app.serverMessage")}>
                  {alert.error.message}
                </ServerMessage>
              ) : null}
              <Button variant="neutral" size="sm" onClick={() => void save()}>
                {t("common.tryAgain")}
              </Button>
            </span>
          </InlineAlert>
        );
        break;
      case "changedElsewhere":
        alertView = (
          <InlineAlert tone="critical">
            <span className="flex flex-col items-start gap-2">
              {alert.folders.map((f) => (
                <span key={f.uuid}>
                  <Trans
                    i18nKey="access.changedElsewhere"
                    components={{ folder: <FolderNameText value={f.name} /> }}
                  />
                </span>
              ))}
              <Button variant="neutral" size="sm" onClick={showCurrent}>
                {t("access.showCurrent")}
              </Button>
            </span>
          </InlineAlert>
        );
        break;
      case "gone":
        alertView = (
          <InlineAlert tone="critical">
            {t("personAccess.gone", { folders: listNames(alert.folders) })}
          </InlineAlert>
        );
        break;
    }
  }

  const Heading = headingLevel === 2 ? "h2" : "h3";
  const introText =
    intro ??
    (kind === "user" ? (
      saveMode ? (
        <Trans
          i18nKey="personAccess.intro"
          components={{ name: <PersonNameText value={name} /> }}
        />
      ) : (
        t("addPerson.access.intro")
      )
    ) : (
      <Trans
        i18nKey="group.access.intro"
        components={{ group: <PersonNameText value={name} /> }}
      />
    ));
  const marked =
    saveMode && accountSectionPending(memory, id, "access", pending);

  return (
    <section
      id={sectionId}
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-group"
    >
      <div className="flex min-w-0 flex-col gap-pair">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Heading
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className={
              headingLevel === 2
                ? "text-section text-foreground outline-hidden"
                : "text-base font-semibold outline-hidden"
            }
          >
            {t("personAccess.title")}
          </Heading>
          {marked ? <PendingMark /> : null}
        </div>
        <p className="max-w-prose text-sm">{introText}</p>
      </div>
      {error === undefined || error === null ? null : (
        <p className="text-sm text-critical-label" data-slot="field-error">
          {error}
        </p>
      )}
      <AccessGrid<Access>
        aria-label={t("personAccess.title")}
        columns={{
          name: t("personAccess.col.folder"),
          kind: t("personAccess.col.sharing"),
          access: t("access.col.access"),
        }}
        options={[
          { value: "rw", label: t("access.rw") },
          { value: "ro", label: t("access.ro") },
          { value: "none", label: t("access.none") },
          { value: "blocked", label: t("access.blocked") },
        ]}
        normalValues={NORMAL_ACCESS}
        accessValues={GIVES_ACCESS}
        rows={gridRows}
        onChange={(rowId, value) => change([rowId], value)}
        onSetAll={(ids, value) => change(ids, value)}
        rowLabel={(folder) => t("access.rowLabel", { name: isolate(folder) })}
        changedLabel={t("access.changed")}
        search={{
          label: t("personAccess.search"),
          clearLabel: t("access.clearSearch"),
        }}
        show={{
          label: t("access.show.label"),
          all: t("personAccess.show.all"),
          withAccess: t("access.show.withAccess"),
          changed: t("access.show.changed"),
        }}
        setAll={{
          label: t("access.setAll"),
          applyLabel: (n) => t("access.setAllApply", { count: n }),
        }}
        countText={(shownCount, total) =>
          t("personAccess.count", { shown: shownCount, total })
        }
        filteredEmpty={{
          message: (search) => t("personAccess.filtered", { search }),
          clearLabel: t("access.clearSearch"),
        }}
        pagination={{
          "aria-label": t("personAccess.search"),
          pageSizeLabel: t("table.pageSize"),
          previous: {
            label: t("table.previous"),
            unavailableReason: t("table.firstPageReason"),
          },
          next: {
            label: t("table.next"),
            unavailableReason: t("table.lastPageReason"),
          },
          range: (first, last, shownCount) =>
            t("table.range", { from: first, to: last, total: shownCount }),
        }}
        loading={
          rows === undefined && failedRead === null
            ? { label: t("personAccess.loading") }
            : undefined
        }
        error={
          failedRead === null
            ? undefined
            : {
                message: failedRead.words,
                serverMessage: isRpcError(failedRead.q.error)
                  ? {
                      label: t("app.serverMessage"),
                      text: failedRead.q.error.message,
                    }
                  : undefined,
                retryLabel: t("common.tryAgain"),
                onRetry: () => void failedRead.q.refetch(),
              }
        }
        empty={{
          message: t("personAccess.empty"),
          action: (
            <Link to="/storage/shared-folders/add" className={routerLinkClass}>
              {t("personAccess.emptyLink")}
            </Link>
          ),
        }}
        saving={saving ? { label: t("access.saving") } : undefined}
      />
      {saveMode ? (
        <>
          {alertView}
          <p role="status" className="text-sm">
            {progress !== null
              ? t("personAccess.progress", {
                  done: progress.done,
                  count: progress.count,
                })
              : announced > 0
                ? t("access.changes", { count: announced })
                : ""}
          </p>
          {rows !== undefined && rows.length > 0 ? (
            <div className="flex flex-col gap-1">
              <div className={buttonRowClass}>
                <Button
                  loading={saving}
                  disabled={count === 0}
                  focusableWhenDisabled
                  aria-describedby={
                    count === 0 && !saving ? nothingId : undefined
                  }
                  onClick={() => void save()}
                >
                  {saving ? t("access.saving") : t("access.save")}
                </Button>
                <Button
                  variant="neutral"
                  disabled={count === 0 || saving}
                  focusableWhenDisabled
                  onClick={discard}
                >
                  {t("access.discard")}
                </Button>
              </div>
              {count === 0 && !saving ? (
                <p id={nothingId} className="text-sm text-muted-foreground">
                  {t("access.nothing")}
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("access.network")}{" "}
            <ExternalLink
              href={CLASSIC.sharedFolders}
              newTabLabel={t("app.newTab")}
            >
              {t("access.networkLink")}
            </ExternalLink>
          </p>
        </>
      ) : null}
    </section>
  );
}
