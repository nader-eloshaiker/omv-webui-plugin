// SPDX-License-Identifier: GPL-3.0-or-later
// "What {{name}} can do" on a person's page (phase 5 users design 3; 0.5, 0.8, 0.11; P3, P4, P5, D6):
// the administrator and SSH choices (PersonPowerFields), the other system groups the person is in,
// kept on every save (3.4), and its own Save, confirmed in words before anything is written (3.5).
// Confirming re-reads the person with getUser (R4), stops when they changed elsewhere, applies the
// self rule once more (0.8, fail closed), then sends setUser with the whole groups list (every system
// group kept, the two privilege groups as chosen, the OMV groups as read) and the shell that follows
// the SSH choice (Q5, D6, D7). It takes effect at once; the note says why the band shows Email and SSH.
// The choices are the page's draft (unsaved changes, 2.7). Nothing retries by itself (UI-14).
import type {
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  buttonRowClass,
  ConfirmDialog,
  ExternalLink,
  InlineAlert,
  PageSection,
  ServerMessage,
  Skeleton,
  useToast,
} from "@omv-webui/react-ui-components";
import { useId, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { isolateName } from "../../format/isolate.ts";
import { useUsersApi } from "../../hooks/useUsersApi.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { useSession } from "../../session/sessionContext.ts";
import {
  leavesNoAdmin,
  powerChanges,
  savePerson,
  type GroupCheck,
  type Powers,
  type SshLine,
} from "../../users/personPage.ts";
import {
  groupsToSend,
  inRootGroup,
  isAdministrator,
  mayRemoveAdmin,
  mayUseSsh,
  omvGroupsOf,
  otherSystemGroups,
  selfReading,
  shellToSend,
  type SelfReading,
} from "../../users/userModel.ts";
import {
  accountId,
  beginAccountAction,
  endAccountAction,
  runningOnAccount,
  type AccountAction,
} from "../../users/usersSession.ts";
import { PersonNameText } from "../atoms/PersonNameText.tsx";
import { PersonPowerFields } from "../molecules/PersonPowerFields.tsx";

type Problem =
  | { kind: "changed" }
  | { kind: "gone" }
  | { kind: "self" }
  | { kind: "running"; action: AccountAction }
  | { kind: "server"; error: unknown };

export function PersonPowersSection({
  person,
  users,
  groups,
  self,
  adminGroup,
  sshGroup,
  sshLine,
  draft,
  onDraftChange,
  onSaved,
  onShowCurrent,
}: {
  /** The person as the page shows them (the list's row). */
  person: UserAccount;
  /** Every listed person, for "only the built-in admin is left" (3.5). */
  users: readonly UserAccount[];
  /** The OMV groups, so system groups can be told from them. */
  groups: readonly UserGroup[] | undefined;
  self: SelfReading;
  adminGroup: GroupCheck;
  sshGroup: GroupCheck;
  sshLine: SshLine;
  draft: Powers | null;
  onDraftChange: (draft: Powers | null) => void;
  onSaved: () => void;
  /** "Show the current details": the page reads the person again; the choices stay. */
  onShowCurrent: () => void;
}) {
  const { t } = useTranslation();
  const api = useUsersApi();
  const toast = useToast();
  const session = useSession();
  const nothingId = useId();
  const saveRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  // Whether the last save changed administrator rights: those apply from the next sign-in (owner).
  const [savedAdmin, setSavedAdmin] = useState(false);
  const name = person.name;
  const slot = { name: <PersonNameText value={name} /> };

  const initial: Powers = {
    admin: isAdministrator(person),
    ssh: mayUseSsh(person),
  };
  const value = draft ?? initial;
  const changes = powerChanges(initial, value);
  const adminChanged = changes.some(
    (c) => c === "makeAdmin" || c === "removeAdmin",
  );
  const sshChanged = changes.some((c) => c === "allowSsh" || c === "removeSsh");
  const others = groups === undefined ? [] : otherSystemGroups(person, groups);
  const warned = others.filter((g) => g.warned).map((g) => g.name);

  const change = (next: Powers) => {
    setProblem(null);
    setSavedNote(false);
    onDraftChange(
      next.admin === initial.admin && next.ssh === initial.ssh ? null : next,
    );
  };

  const save = async () => {
    if (changes.length === 0 || saving || groups === undefined) {
      return;
    }
    setConfirming(false);
    const id = accountId("user", name);
    if (!beginAccountAction(id, "powers")) {
      const action = runningOnAccount(id);
      setProblem(action === null ? null : { kind: "running", action });
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const sessionName =
        session.status === "signedIn" ? session.username : null;
      const outcome = await savePerson(
        api,
        person,
        (now) => ({
          groups: groupsToSend(now, groups, {
            admin: value.admin,
            ssh: value.ssh,
            omvGroups: omvGroupsOf(now, groups),
          }),
          shell: shellToSend(now.shell, mayUseSsh(now), value.ssh),
        }),
        {
          // 0.8 once more: never take away the reader's own rights, nor anyone's when the reader is
          // not known and they are an administrator.
          refuse: (now) =>
            isAdministrator(now) &&
            !value.admin &&
            !mayRemoveAdmin(selfReading(sessionName, now.name)),
        },
      );
      if (outcome.kind !== "saved") {
        setProblem({
          kind: outcome.kind === "refused" ? "self" : outcome.kind,
        });
        return;
      }
      for (const c of changes) {
        toast.show({
          title: t(`personCan.saved.${c}`, { name: isolateName(name) }),
        });
      }
      await api.users().catch(() => undefined);
      onDraftChange(null);
      setSavedAdmin(adminChanged);
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
        title={problem.kind === "running" ? undefined : t("personCan.failed")}
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
        ) : problem.kind === "self" ? (
          self === "self" ? (
            t("personCan.adminSelf")
          ) : (
            t("personCan.adminUnknownSelf")
          )
        ) : isRpcError(problem.error) ? (
          <ServerMessage label={t("app.serverMessage")}>
            {problem.error.message}
          </ServerMessage>
        ) : null}
      </InlineAlert>
    );
  }

  const items: ReactNode[] = changes.flatMap((c) => {
    const words: ReactNode[] = [
      <Trans key={c} i18nKey={`personCan.confirm.${c}`} components={slot} />,
    ];
    if (c === "removeAdmin" && leavesNoAdmin(users, name)) {
      words.push(t("personCan.confirm.lastAdmin"));
    }
    if (c === "allowSsh" && sshLine === "off") {
      words.push(t("personCan.sshOff"));
    }
    return words;
  });

  return (
    <PageSection heading={t("personCan.title", { name: isolateName(name) })}>
      <p className="max-w-prose text-sm">{t("personCan.intro")}</p>
      {groups === undefined ? (
        <div aria-hidden="true" className="flex flex-col gap-3">
          <Skeleton className="w-64" />
          <Skeleton className="w-64" />
        </div>
      ) : (
        <PersonPowerFields
          name={name}
          value={value}
          initial={initial}
          onChange={change}
          adminGroup={adminGroup}
          sshGroup={sshGroup}
          self={self}
          sshLine={sshLine}
          inRoot={inRootGroup(person)}
          saving={saving}
        />
      )}
      {others.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">
            {t("personCan.other.title")}
          </h3>
          <p className="max-w-prose text-sm">
            <Trans i18nKey="personCan.other.intro" components={slot} />
          </p>
          {warned.length > 0 ? (
            <InlineAlert tone="neutral" icon="warning">
              <Trans
                i18nKey="personCan.other.warn"
                values={{ groups: warned.map(isolateName).join(", ") }}
                components={slot}
              />{" "}
              <ExternalLink href={CLASSIC.users} newTabLabel={t("app.newTab")}>
                {t("users.classicLink")}
              </ExternalLink>
            </InlineAlert>
          ) : null}
          <ul className="flex flex-col gap-1 text-sm">
            {others.map((g) => (
              <li key={g.name}>
                <PersonNameText value={g.name} />
                {g.wordsKey === null ? null : (
                  <>: {t(g.wordsKey as "systemGroup.root")}</>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {problemView}
      <div className="flex flex-col gap-1">
        <div className={buttonRowClass}>
          <Button
            ref={saveRef}
            loading={saving}
            disabled={changes.length === 0}
            focusableWhenDisabled
            aria-describedby={
              changes.length === 0 && !saving ? nothingId : undefined
            }
            onClick={() => {
              if (changes.length > 0 && !saving) {
                setConfirming(true);
              }
            }}
          >
            {saving ? t("personCan.saving") : t("personCan.save")}
          </Button>
          <Button
            variant="neutral"
            disabled={changes.length === 0 || saving}
            focusableWhenDisabled
            onClick={() => {
              setProblem(null);
              onDraftChange(null);
            }}
          >
            {t("personCan.discard")}
          </Button>
        </div>
        {changes.length === 0 && !saving ? (
          <p id={nothingId} className="text-sm text-muted-foreground">
            {t("common.noChanges")}
          </p>
        ) : null}
      </div>
      {savedNote ? (
        <p role="status" className="max-w-prose text-sm">
          {t(savedAdmin ? "personCan.savedNoteAdmin" : "users.savedNote")}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("personCan.confirm.title", { name: isolateName(name) })}
        description={
          <>
            {items.map((item, i) => (
              <span key={`c${String(i)}`} className="mb-2 block">
                {item}
              </span>
            ))}
            {adminChanged ? (
              <>
                <span className="mb-2 block">
                  {t("personCan.confirm.nextSignIn")}
                </span>
                {sshChanged ? (
                  <span className="block">{t("personCan.confirm.sshNow")}</span>
                ) : null}
              </>
            ) : (
              <span className="block">{t("personCan.confirm.now")}</span>
            )}
          </>
        }
        cancelLabel={t("personCan.confirm.cancel")}
        confirmLabel={t("personCan.confirm.save")}
        onConfirm={() => void save()}
      />
    </PageSection>
  );
}
