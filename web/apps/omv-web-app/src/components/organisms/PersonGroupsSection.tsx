// SPDX-License-Identifier: GPL-3.0-or-later
// "Groups" on a person's page (phase 5 users design 4.1; 0.5, 0.11): the group picker and "Save
// groups". Saving re-reads the person with getUser (R4), stops when they changed elsewhere, then sends
// setUser with the whole list OMV replaces: `users`, every system group as read, the two privilege
// groups as read, and the OMV groups as ticked (never empty, so unticking every group does take them
// out). No confirmation: it changes only what the person may open, and can be changed back here (D8).
// The ticks are the page's draft (unsaved changes, 2.7). Nothing retries by itself (UI-14).
import type {
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  buttonRowClass,
  InlineAlert,
  PageSection,
  ServerMessage,
  useToast,
} from "@omv-webui/react-ui-components";
import { useId, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { isolateName } from "../../format/isolate.ts";
import { useUsersApi } from "../../hooks/useUsersApi.ts";
import { savePerson } from "../../users/personPage.ts";
import {
  groupsToSend,
  isAdministrator,
  mayUseSsh,
  omvGroupsOf,
} from "../../users/userModel.ts";
import {
  accountId,
  beginAccountAction,
  endAccountAction,
  runningOnAccount,
  type AccountAction,
} from "../../users/usersSession.ts";
import { PersonNameText } from "../atoms/PersonNameText.tsx";
import { PersonGroupPicker } from "../molecules/PersonGroupPicker.tsx";

type Problem =
  | { kind: "changed" }
  | { kind: "gone" }
  | { kind: "running"; action: AccountAction }
  | { kind: "server"; error: unknown };

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

export function PersonGroupsSection({
  person,
  groups,
  draft,
  onDraftChange,
  onSaved,
  onShowCurrent,
}: {
  person: UserAccount;
  groups: {
    data: readonly UserGroup[] | undefined;
    failed: boolean;
    error: unknown;
    retry: () => void;
  };
  draft: string[] | null;
  onDraftChange: (draft: string[] | null) => void;
  /** Saved: the page reads again what depends on the groups (the access grid's group lines). */
  onSaved: () => void;
  onShowCurrent: () => void;
}) {
  const { t } = useTranslation();
  const api = useUsersApi();
  const toast = useToast();
  const headingId = useId();
  const hintId = useId();
  const nothingId = useId();
  const saveRef = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const name = person.name;
  const slot = { name: <PersonNameText value={name} /> };
  const list = groups.data;
  const initial = list === undefined ? [] : omvGroupsOf(person, list);
  const value = draft ?? initial;
  const changed = !sameSet(value, initial);

  const save = async () => {
    if (!changed || saving || list === undefined) {
      return;
    }
    const id = accountId("user", name);
    if (!beginAccountAction(id, "groups")) {
      const action = runningOnAccount(id);
      setProblem(action === null ? null : { kind: "running", action });
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const outcome = await savePerson(api, person, (now) => ({
        groups: groupsToSend(now, list, {
          admin: isAdministrator(now),
          ssh: mayUseSsh(now),
          omvGroups: value,
        }),
      }));
      if (outcome.kind !== "saved") {
        setProblem({ kind: outcome.kind === "gone" ? "gone" : "changed" });
        return;
      }
      toast.show({
        title: t("personGroups.saved", { name: isolateName(name) }),
      });
      await Promise.all([
        api.users().catch(() => undefined),
        api.groups().catch(() => undefined),
      ]);
      onDraftChange(null);
      setSavedNote(true);
      onSaved();
      saveRef.current?.focus();
    } catch (error) {
      setProblem({ kind: "server", error });
    } finally {
      setSaving(false);
      endAccountAction(id);
    }
  };

  let problemView: ReactNode = null;
  if (problem !== null) {
    problemView = (
      <InlineAlert
        tone="critical"
        title={
          problem.kind === "running" ? undefined : t("personGroups.failed")
        }
      >
        {problem.kind === "running" ? (
          t("personDelete.blocked.running", {
            action: t(`users.action.${problem.action}`),
          })
        ) : problem.kind === "changed" ? (
          <span className="flex flex-col items-start gap-2">
            <span>
              <Trans i18nKey="person.changedElsewhere" components={slot} />
            </span>
            <Button
              variant="neutral"
              size="sm"
              onClick={() => {
                setProblem(null);
                onShowCurrent();
              }}
            >
              {t("person.showCurrent")}
            </Button>
          </span>
        ) : problem.kind === "gone" ? (
          <Trans i18nKey="person.gone" components={slot} />
        ) : isRpcError(problem.error) ? (
          <ServerMessage label={t("app.serverMessage")}>
            {problem.error.message}
          </ServerMessage>
        ) : null}
      </InlineAlert>
    );
  }

  return (
    <PageSection heading={t("personGroups.title")}>
      <p id={hintId} className="max-w-prose text-sm">
        {t("shares.term.group")} {t("personGroups.noPowers")}
      </p>
      <PersonGroupPicker
        aria-labelledby={headingId}
        aria-describedby={hintId}
        name={name}
        groups={groups.failed ? undefined : list}
        value={value}
        initialValue={initial}
        onChange={(next) => {
          setProblem(null);
          setSavedNote(false);
          onDraftChange(sameSet(next, initial) ? null : next);
        }}
        error={
          groups.failed
            ? { error: groups.error, onRetry: groups.retry }
            : undefined
        }
        saving={saving}
      />
      {problemView}
      {list !== undefined && list.length > 0 ? (
        <div className="flex flex-col gap-1">
          <div className={buttonRowClass}>
            <Button
              ref={saveRef}
              loading={saving}
              disabled={!changed}
              focusableWhenDisabled
              aria-describedby={!changed && !saving ? nothingId : undefined}
              onClick={() => void save()}
            >
              {saving ? t("personGroups.saving") : t("personGroups.save")}
            </Button>
            <Button
              variant="neutral"
              disabled={!changed || saving}
              focusableWhenDisabled
              onClick={() => {
                setProblem(null);
                onDraftChange(null);
              }}
            >
              {t("personGroups.discard")}
            </Button>
          </div>
          {!changed && !saving ? (
            <p id={nothingId} className="text-sm text-muted-foreground">
              {t("common.noChanges")}
            </p>
          ) : null}
        </div>
      ) : null}
      {savedNote ? (
        <div role="status" className="flex max-w-prose flex-col gap-1 text-sm">
          <p>{t("users.savedNote")}</p>
          <p>{t("personGroups.reconnect")}</p>
        </div>
      ) : null}
    </PageSection>
  );
}
