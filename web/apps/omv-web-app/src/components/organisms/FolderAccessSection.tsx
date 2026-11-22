// SPDX-License-Identifier: GPL-3.0-or-later
// "Who can use it" on a shared folder's page (phase 5 shares design 3; 0.4, 0.9, 0.10; D9, D10): the
// access grid, the entries that will be dropped, the change count (announced 500 ms after the last
// change), and "Save access" / "Discard changes". No confirmation for taking access away (D10).
//
// Saving re-reads the folder's row and its SMB share just before the write (0.10, R4): when the stored
// list changed since the grid was opened, the save stops and offers "Show the current access", which
// carries the reader's changes onto it; when the list would leave nobody with access while the folder
// is shared with guest access off, the save is refused (0.9, P8). Otherwise ShareMgmt.setPrivileges
// with the whole list, stale entries dropped. Every change is kept on a failure.
//
// The draft (choices and the list they were made on) is the page's, so Refresh and leaving can ask
// first (2.8); while it holds changes the grid is drawn on the list it was opened on, so a re-read made
// meanwhile never moves a row under the reader.
import type {
  SharedFolder,
  SharedFolderPrivileges,
  SmbShareRow,
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ExternalLink,
  InlineAlert,
  ServerMessage,
  buttonRowClass,
  useToast,
} from "@omv-webui/react-ui-components";
import { useId, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { isolateName } from "../../format/isolate.ts";
import { useDebounced } from "../../hooks/useDebounced.ts";
import { useSharesApi } from "../../hooks/useSharesApi.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import {
  accessModel,
  changedElsewhere,
  changedRows,
  privilegesToSave,
  rebaseChoices,
  type Access,
} from "../../sharedFolders/accessModel.ts";
import {
  NO_ACCESS_DRAFT,
  type AccessDraft,
} from "../../sharedFolders/folderPage.ts";
import { saveAccessRefusal } from "../../sharedFolders/shareActions.ts";
import {
  beginAction,
  endAction,
  recordSaved,
  runningOn,
  type SharesAction,
} from "../../sharedFolders/sharesSession.ts";
import { guestMode, shareOf } from "../../sharedFolders/smbModel.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { UsersDeletedNote } from "../molecules/UsersDeletedNote.tsx";
import { AccessGridSection } from "./AccessGridSection.tsx";

type Alert =
  | { kind: "lastAccess" }
  | { kind: "changedElsewhere"; now: SharedFolderPrivileges | undefined }
  | { kind: "running"; action: SharesAction }
  | { kind: "gone" }
  | { kind: "failed"; error: unknown };

interface ListRead<T> {
  data: readonly T[] | undefined;
  failed: boolean;
  error: unknown;
  retry: () => void;
}

export function FolderAccessSection({
  folder,
  share,
  users,
  groups,
  draft,
  onDraftChange,
  pending,
}: {
  folder: SharedFolder;
  /** The folder's SMB share as read, undefined when it has none (or the read has not arrived). */
  share: SmbShareRow | undefined;
  users: ListRead<UserAccount>;
  groups: ListRead<UserGroup>;
  draft: AccessDraft;
  onDraftChange: (draft: AccessDraft) => void;
  /** This session saved access and it is not applied yet (0.8). */
  pending: boolean;
}) {
  const { t } = useTranslation();
  const api = useSharesApi();
  const toast = useToast();
  const nothingId = useId();
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<Alert | null>(null);

  const openedOn =
    draft.base === null ? folder.privileges : draft.base.privileges;
  const model =
    users.data === undefined || groups.data === undefined
      ? undefined
      : accessModel(users.data, groups.data, openedOn);
  const count =
    model === undefined ? 0 : changedRows(model, draft.choices).length;
  const announced = useDebounced(count, 500);
  const failedList = users.failed ? users : groups.failed ? groups : null;
  const guests = share !== undefined && guestMode(share.guest) !== "no";

  // A refusal or failure is announced where it appears (InlineAlert), above the buttons; focus stays
  // on "Save access" (3.3).
  const show = (next: Alert) => setAlert(next);

  const change = (choices: Record<string, Access>) => {
    setAlert(null);
    onDraftChange(
      Object.keys(choices).length === 0
        ? NO_ACCESS_DRAFT
        : {
            choices,
            base: draft.base ?? { privileges: folder.privileges },
          },
    );
  };

  const save = async () => {
    if (model === undefined || count === 0 || saving) {
      return;
    }
    setAlert(null);
    if (!beginAction(folder.uuid, "access")) {
      const action = runningOn(folder.uuid);
      if (action !== null) {
        show({ kind: "running", action });
      }
      return;
    }
    setSaving(true);
    try {
      const [folders, shares] = await Promise.all([
        api.folders(),
        api.shares(),
      ]);
      const now = folders.find((f) => f.uuid === folder.uuid);
      if (now === undefined) {
        show({ kind: "gone" });
        return;
      }
      if (changedElsewhere(openedOn, now.privileges)) {
        show({ kind: "changedElsewhere", now: now.privileges });
        return;
      }
      const list = privilegesToSave(model, draft.choices);
      if (
        saveAccessRefusal({ list, share: shareOf(shares, folder.uuid) }) !==
        null
      ) {
        show({ kind: "lastAccess" });
        return;
      }
      await api.setPrivileges(folder.uuid, list);
      recordSaved(folder.uuid, "access");
      // The list as stored now, so the grid shows what was saved once the changes are cleared.
      await api.folders().catch(() => undefined);
      onDraftChange(NO_ACCESS_DRAFT);
      toast.show({
        title: t("access.saved", { folder: isolateName(folder.name) }),
      });
    } catch (error) {
      show({ kind: "failed", error });
      // OMV names the account it refused (one deleted meanwhile, or the administrator): read the
      // lists again, so a deleted account becomes an entry that is dropped on save.
      void api.users().catch(() => undefined);
      void api.groups().catch(() => undefined);
    } finally {
      setSaving(false);
      endAction(folder.uuid);
    }
  };

  const showCurrent = () => {
    if (alert?.kind !== "changedElsewhere" || model === undefined) {
      return;
    }
    const after = accessModel(users.data ?? [], groups.data ?? [], alert.now);
    const choices = rebaseChoices(model, after, draft.choices);
    setAlert(null);
    onDraftChange(
      Object.keys(choices).length === 0
        ? NO_ACCESS_DRAFT
        : { choices, base: { privileges: alert.now } },
    );
  };

  const folderName = <FolderNameText value={folder.name} />;
  let alertView = null;
  if (alert !== null) {
    switch (alert.kind) {
      case "lastAccess":
        alertView = (
          <InlineAlert tone="critical">
            <Trans
              i18nKey="access.lastAccess"
              components={{ folder: folderName }}
            />
          </InlineAlert>
        );
        break;
      case "changedElsewhere":
        alertView = (
          <InlineAlert tone="critical">
            <span className="flex flex-col items-start gap-2">
              <span>
                <Trans
                  i18nKey="access.changedElsewhere"
                  components={{ folder: folderName }}
                />
              </span>
              <Button variant="neutral" size="sm" onClick={showCurrent}>
                {t("access.showCurrent")}
              </Button>
            </span>
          </InlineAlert>
        );
        break;
      case "running":
        alertView = (
          <InlineAlert tone="neutral">
            {t("shareDelete.blocked.running", {
              action: t(`shares.action.${alert.action}`),
            })}
          </InlineAlert>
        );
        break;
      case "gone":
        alertView = (
          <InlineAlert tone="critical">{t("sharedFolder.gone")}</InlineAlert>
        );
        break;
      case "failed":
        alertView = (
          <InlineAlert tone="critical" title={t("access.saveFailed")}>
            {isRpcError(alert.error) ? (
              <ServerMessage label={t("app.serverMessage")}>
                {alert.error.message}
              </ServerMessage>
            ) : null}
          </InlineAlert>
        );
        break;
    }
  }

  const stale = model?.stale ?? [];
  return (
    <section aria-labelledby="folder-access" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="folder-access" className="text-lg font-semibold">
          {t("access.title")}
        </h2>
        {pending ? <PendingMark /> : null}
      </div>
      <p className="max-w-prose text-sm">
        {guests ? t("access.introGuests") : t("access.intro")}
      </p>
      <AccessGridSection
        label={t("access.title")}
        model={failedList === null ? model : undefined}
        choices={draft.choices}
        onChoicesChange={change}
        saving={saving}
        error={
          failedList === null
            ? undefined
            : { error: failedList.error, onRetry: failedList.retry }
        }
      />
      {stale.length > 0 ? (
        <p className="max-w-prose text-sm">
          {t("access.stale", {
            count: stale.length,
            names: stale.map((e) => isolateName(e.name)).join(", "),
          })}
          <UsersDeletedNote entries={stale} />
        </p>
      ) : null}
      {alertView}
      <p role="status" className="text-sm">
        {announced > 0 ? t("access.changes", { count: announced }) : ""}
      </p>
      {failedList === null && model !== undefined ? (
        <div className="flex flex-col gap-1">
          <div className={buttonRowClass}>
            <Button
              loading={saving}
              disabled={count === 0}
              focusableWhenDisabled
              aria-describedby={count === 0 && !saving ? nothingId : undefined}
              onClick={() => void save()}
            >
              {saving ? t("access.saving") : t("access.save")}
            </Button>
            <Button
              variant="neutral"
              disabled={count === 0 || saving}
              focusableWhenDisabled
              onClick={() => {
                setAlert(null);
                onDraftChange(NO_ACCESS_DRAFT);
              }}
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
    </section>
  );
}
