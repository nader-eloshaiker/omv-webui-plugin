// SPDX-License-Identifier: GPL-3.0-or-later
// "Members" on a group's page (phase 5 users design 9.4; 0.5, 0.11): the library's MemberPicker with
// one checkbox per person from getUserList, in natural order, each with their description; a person
// whose main group it is (an account made outside OMV) is ticked and unavailable with the reason. The
// change count is announced 500 ms after the last change; "Save members" / "Discard changes". No
// confirmation for taking someone out (D10): nothing on the disk changes and it can be put back here.
//
// Saving re-reads the group with getGroup; when its members changed since the page read them, the save
// stops ("Show the current members", the reader's ticks kept). Otherwise setGroup with the whole list.
// Saved: a toast, the note that it is in effect and Windows and Mac sharing is listed as not applied,
// the pending mark, and the page reads again so the Shared folders section's lines follow. Failed: the
// server's words (OMV names a member it could not find); the ticks stay. Never retried (UI-14).
import type {
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  InlineAlert,
  MemberPicker,
  ServerMessage,
  buttonRowClass,
  useToast,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { isolateName } from "../../format/isolate.ts";
import {
  groupSetRequest,
  memberChanges,
  membersToSave,
  sameMembers,
} from "../../groups/groupWrites.ts";
import { memberRows } from "../../groups/memberRows.ts";
import { readName } from "../../groups/nameFree.ts";
import { useDebounced } from "../../hooks/useDebounced.ts";
import { useGroupsApi } from "../../hooks/useGroupsApi.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import {
  accountId,
  beginAccountAction,
  endAccountAction,
  recordAccountSaved,
  runningOnAccount,
  type AccountAction,
} from "../../users/usersSession.ts";
import { GroupNameText } from "../atoms/GroupNameText.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";

type Alert =
  | { kind: "changedElsewhere" }
  | { kind: "running"; action: AccountAction }
  | { kind: "gone" }
  | { kind: "failed"; error: unknown };

/**
 * The reader's unsaved ticks, and the member list they were made on (null: the list as read now, after
 * "Show the current members"); the draft itself is null while nothing is changed.
 */
export interface MembersDraft {
  ticked: readonly string[];
  base: readonly string[] | null;
}

interface ListRead<T> {
  data: readonly T[] | undefined;
  failed: boolean;
  error: unknown;
  retry: () => void;
}

export function GroupMembersSection({
  group,
  users,
  mainGroup,
  draft,
  onDraftChange,
  pending,
  onSaved,
  onShowCurrent,
}: {
  group: UserGroup;
  users: ListRead<UserAccount>;
  /** The people whose main group it is: ticked, unavailable, never sent. */
  mainGroup: readonly string[];
  draft: MembersDraft | null;
  onDraftChange: (draft: MembersDraft | null) => void;
  /** This session saved the members and Windows and Mac sharing is not applied yet (0.4). */
  pending: boolean;
  /** After a save: the page reads the lists again (the access lines follow). */
  onSaved: () => void;
  /** "Show the current members": the page reads the lists again; the ticks are kept. */
  onShowCurrent: () => void;
}) {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const toast = useToast();
  const headingId = useId();
  const nothingId = useId();
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  const saved = [...(group.members ?? []), ...mainGroup];
  const ticked = draft?.ticked ?? saved;
  const count = memberChanges(saved, ticked);
  const announced = useDebounced(count, 500);
  const groupSlot = <GroupNameText value={group.name} />;

  const change = (next: readonly string[]) => {
    setAlert(null);
    setSavedNote(false);
    onDraftChange(
      memberChanges(saved, next) === 0
        ? null
        : { ticked: next, base: draft?.base ?? group.members ?? [] },
    );
  };

  const save = async () => {
    if (count === 0 || saving) {
      return;
    }
    setAlert(null);
    setSavedNote(false);
    const id = accountId("group", group.name);
    if (!beginAccountAction(id, "members")) {
      const action = runningOnAccount(id);
      if (action !== null) {
        setAlert({ kind: "running", action });
      }
      return;
    }
    setSaving(true);
    try {
      const read = await readName("group", group.name, api.group);
      if (read.kind === "free") {
        setAlert({ kind: "gone" });
        return;
      }
      if (read.kind === "unknown") {
        setAlert({ kind: "failed", error: read.error });
        return;
      }
      if (!sameMembers(draft?.base ?? group.members, read.value.members)) {
        setAlert({ kind: "changedElsewhere" });
        return;
      }
      await api.setGroup(
        groupSetRequest(read.value, {
          members: membersToSave(ticked, mainGroup),
        }),
      );
      recordAccountSaved(id, "members");
      await api.groups().catch(() => undefined);
      onDraftChange(null);
      setSavedNote(true);
      toast.show({
        title: t("group.members.saved", { group: isolateName(group.name) }),
      });
      onSaved();
    } catch (error) {
      setAlert({ kind: "failed", error });
    } finally {
      setSaving(false);
      endAccountAction(id);
    }
  };

  let alertView = null;
  if (alert !== null) {
    switch (alert.kind) {
      case "changedElsewhere":
        alertView = (
          <InlineAlert tone="critical">
            <span className="flex flex-col items-start gap-2">
              <span>
                <Trans
                  i18nKey="group.members.changedElsewhere"
                  components={{ group: groupSlot }}
                />
              </span>
              <Button
                variant="neutral"
                size="sm"
                onClick={() => {
                  setAlert(null);
                  if (draft !== null) {
                    // The ticks stay; the changed marks follow the list read now.
                    onDraftChange({ ticked: draft.ticked, base: null });
                  }
                  onShowCurrent();
                }}
              >
                {t("group.members.showCurrent")}
              </Button>
            </span>
          </InlineAlert>
        );
        break;
      case "running":
        alertView = (
          <InlineAlert tone="neutral">
            {t("group.running", { action: t(`users.action.${alert.action}`) })}
          </InlineAlert>
        );
        break;
      case "gone":
        alertView = (
          <InlineAlert tone="critical">{t("group.gone")}</InlineAlert>
        );
        break;
      case "failed":
        alertView = (
          <InlineAlert tone="critical" title={t("group.members.failed")}>
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

  const rows =
    users.data === undefined
      ? []
      : memberRows(users.data, mainGroup, (name) => (
          <Trans
            i18nKey="group.members.mainGroup"
            components={{ name: <GroupNameText value={name} /> }}
          />
        ));
  const ready = users.data !== undefined;

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-group"
    >
      <div className="flex min-w-0 flex-col gap-pair">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={headingId} className="text-section text-foreground">
            {t("group.members.title")}
          </h2>
          {pending ? <PendingMark /> : null}
        </div>
        <p className="max-w-prose text-sm">
          <Trans
            i18nKey="group.members.intro"
            components={{ group: groupSlot }}
          />
        </p>
      </div>
      <MemberPicker
        aria-labelledby={headingId}
        rows={rows}
        value={ticked}
        initialValue={saved}
        onChange={(value) => change(value)}
        changedLabel={t("group.members.changed")}
        search={{
          label: t("group.members.search"),
          clearLabel: t("group.members.clearSearch"),
        }}
        show={{
          label: t("group.members.showLabel"),
          all: t("group.members.show.all"),
          ticked: t("group.members.show.members"),
        }}
        countText={(c, total) => t("group.members.count", { count: c, total })}
        filteredEmpty={{
          message: (search) =>
            search === ""
              ? t("group.members.noneYet", { group: isolateName(group.name) })
              : t("group.members.filtered", { search }),
          clearLabel: t("group.members.clearSearch"),
        }}
        pagination={{
          "aria-label": t("group.members.pages"),
          pageSizeLabel: t("table.pageSize"),
          previous: {
            label: t("table.previous"),
            unavailableReason: t("table.firstPageReason"),
          },
          next: {
            label: t("table.next"),
            unavailableReason: t("table.lastPageReason"),
          },
          range: (first, last, shown) =>
            t("table.range", { from: first, to: last, total: shown }),
        }}
        loading={
          !ready && !users.failed
            ? { label: t("group.members.loading") }
            : undefined
        }
        error={
          users.failed
            ? {
                message: t("group.members.loadFailed"),
                serverMessage: isRpcError(users.error)
                  ? { label: t("app.serverMessage"), text: users.error.message }
                  : undefined,
                retryLabel: t("common.tryAgain"),
                onRetry: users.retry,
              }
            : undefined
        }
        empty={{
          message: t("group.members.empty"),
          action: (
            <Link to="/usermgmt/users/add" className={routerLinkClass}>
              {t("group.members.emptyLink")}
            </Link>
          ),
        }}
        saving={saving ? { label: t("group.members.saving") } : undefined}
      />
      {alertView}
      <p role="status" className="text-sm">
        {announced > 0 ? t("group.members.changes", { count: announced }) : ""}
      </p>
      {savedNote ? (
        <p className="max-w-prose text-sm">{t("groups.savedNote")}</p>
      ) : null}
      {ready && rows.length > 0 ? (
        <div className="flex flex-col gap-1">
          <div className={buttonRowClass}>
            <Button
              loading={saving}
              disabled={count === 0}
              focusableWhenDisabled
              aria-describedby={count === 0 && !saving ? nothingId : undefined}
              onClick={() => void save()}
            >
              {saving ? t("group.members.saving") : t("group.members.save")}
            </Button>
            <Button
              variant="neutral"
              disabled={count === 0 || saving}
              focusableWhenDisabled
              onClick={() => {
                setAlert(null);
                onDraftChange(null);
              }}
            >
              {t("group.members.discard")}
            </Button>
          </div>
          {count === 0 && !saving ? (
            <p id={nothingId} className="text-sm text-muted-foreground">
              {t("group.members.nothing")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
