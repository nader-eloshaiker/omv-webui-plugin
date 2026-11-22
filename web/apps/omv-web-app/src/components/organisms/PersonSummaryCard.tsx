// SPDX-License-Identifier: GPL-3.0-or-later
// A person's summary card (phase 5 users design 2.3, 2.5; 0.2, 0.6, 0.11; P14, P15): who they are, as
// a fact list, with "Edit details" at its top right turning the description and the email address
// into fields in place. "Save details" re-reads the person with getUser (R4), stops when they changed
// elsewhere in a field this save does not write, then sends setUser with every field as read and the
// two changed. Saved: the values return to text, a toast, the note that it is already in effect, the
// pending mark beside the email address when it changed (Email waits for Apply, 0.4), and focus back
// on "Edit details". Enter in a field saves; Escape cancels. Failed: the fields stay with the server's
// words. The email address is never a link (UI-3); everything from the server is text (UI-2).
import type {
  SharedFolder,
  UserAccount,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Card,
  CardContent,
  CopyButton,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  Identifier,
  InlineAlert,
  ServerMessage,
  buttonRowClass,
  useToast,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { useUsersApi } from "../../hooks/useUsersApi.ts";
import { isFolderAddress } from "../../sharedFolders/folderAddress.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { descriptionProblem } from "../../users/nameRules.ts";
import { emailProblem, savePerson } from "../../users/personPage.ts";
import { DEFAULT_GROUP } from "../../users/systemGroups.ts";
import {
  accountId,
  beginAccountAction,
  endAccountAction,
  recordAccountSaved,
  runningOnAccount,
  type AccountAction,
} from "../../users/usersSession.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { PersonNameText } from "../atoms/PersonNameText.tsx";

/** The details being edited (the page holds them, for its unsaved-changes guard). */
export interface DetailsDraft {
  comment: string;
  email: string;
}

type Problem =
  | { kind: "changed" }
  | { kind: "gone" }
  | { kind: "running"; action: AccountAction }
  | { kind: "server"; error: unknown };

/** Where the person's home folder is (2.3), as the page read it. */
export type HomeFact =
  | { kind: "on"; folder: SharedFolder }
  | { kind: "off" }
  /** On, but the shared folder that holds them no longer exists (12.7). */
  | { kind: "gone" }
  | { kind: "unknown" };

const NO_HOME = "/nonexistent";

function None() {
  const { t } = useTranslation();
  return <span className="text-muted-foreground">{t("common.none")}</span>;
}

export function PersonSummaryCard({
  person,
  home,
  emailPending,
  draft,
  onDraftChange,
  onShowCurrent,
}: {
  person: UserAccount;
  home: HomeFact;
  /** This session changed the email address and Email is still pending (0.4). */
  emailPending: boolean;
  draft: DetailsDraft | null;
  onDraftChange: (draft: DetailsDraft | null) => void;
  onShowCurrent: () => void;
}) {
  const { t } = useTranslation();
  const api = useUsersApi();
  const toast = useToast();
  const editRef = useRef<HTMLButtonElement>(null);
  const commentRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  // Focus moves after the render that swapped the fields for the values, or the values for the fields.
  const focusToRef = useRef<"edit" | "field" | null>(null);
  useEffect(() => {
    const target = focusToRef.current;
    if (target === null) {
      return;
    }
    focusToRef.current = null;
    (target === "edit" ? editRef : commentRef).current?.focus();
  });

  const name = person.name;
  const slot = { name: <PersonNameText value={name} /> };
  const comment = person.comment ?? "";
  const email = person.email ?? "";
  const keys = (person.sshpubkeys ?? []).length;
  const dir = person.dir ?? "";

  const open = () => {
    setProblem(null);
    setChecked(false);
    setSavedNote(false);
    onDraftChange({ comment, email });
    focusToRef.current = "field";
  };
  const close = () => {
    setProblem(null);
    setChecked(false);
    onDraftChange(null);
    focusToRef.current = "edit";
  };

  const commentIssue =
    draft === null ? null : descriptionProblem(draft.comment);
  const emailIssue = draft === null ? false : emailProblem(draft.email.trim());

  const save = async () => {
    if (draft === null || saving) {
      return;
    }
    setChecked(true);
    if (commentIssue !== null) {
      commentRef.current?.focus();
      return;
    }
    if (emailIssue) {
      emailRef.current?.focus();
      return;
    }
    const id = accountId("user", name);
    if (!beginAccountAction(id, "details")) {
      const action = runningOnAccount(id);
      setProblem(action === null ? null : { kind: "running", action });
      return;
    }
    setSaving(true);
    setProblem(null);
    const next = { comment: draft.comment, email: draft.email.trim() };
    try {
      const outcome = await savePerson(api, person, () => next, {
        saving: ["email", "comment"],
      });
      if (outcome.kind !== "saved") {
        setProblem({ kind: outcome.kind === "gone" ? "gone" : "changed" });
        return;
      }
      if (next.email !== email) {
        recordAccountSaved(id, "email");
      }
      await api.users().catch(() => undefined);
      toast.show({
        title: t("person.details.saved", { name: isolateName(name) }),
      });
      setSavedNote(true);
      close();
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
          problem.kind === "running" ? undefined : t("person.details.failed")
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

  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  let homeValue: ReactNode;
  if (home.kind === "on") {
    const value = (
      <Trans
        i18nKey="person.fact.homeValue"
        components={{
          folder: <FolderNameText value={home.folder.name} />,
          ...slot,
        }}
      />
    );
    homeValue = isFolderAddress(home.folder.uuid) ? (
      <Link
        to="/storage/shared-folders/$folder"
        params={{ folder: home.folder.uuid }}
        className={routerLinkClass}
      >
        {value}
      </Link>
    ) : (
      value
    );
  } else if (home.kind === "off") {
    homeValue = (
      <>
        {t("person.fact.homeOff")}{" "}
        <Link to="/usermgmt/settings" className={routerLinkClass}>
          {t("person.fact.homeLink")}
        </Link>
      </>
    );
  } else if (home.kind === "gone") {
    homeValue = (
      <>
        {t("homeFolders.state.gone")}{" "}
        <Link to="/usermgmt/settings" className={routerLinkClass}>
          {t("person.fact.homeLink")}
        </Link>
      </>
    );
  } else {
    homeValue = (
      <span className="text-muted-foreground">{t("users.notKnown")}</span>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {draft === null ? (
            <Button
              ref={editRef}
              variant="neutral"
              size="sm"
              className="ms-auto"
              onClick={open}
            >
              {t("person.editDetails")}
            </Button>
          ) : null}
        </div>
        {draft === null ? null : (
          <form
            noValidate
            className="flex max-w-[40rem] flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Field
              invalid={checked && commentIssue !== null ? true : undefined}
            >
              <FieldLabel>{t("person.details.description")}</FieldLabel>
              <FieldControl
                ref={commentRef}
                autoComplete="off"
                dir="auto"
                readOnly={saving}
                value={draft.comment}
                onChange={(event) =>
                  onDraftChange({ ...draft, comment: event.target.value })
                }
                onKeyDown={escape}
              />
              <FieldHint>{t("person.details.descriptionHint")}</FieldHint>
              {checked && commentIssue !== null ? (
                <FieldError match>
                  {commentIssue.key === "tooLong"
                    ? t("person.details.descriptionTooLong")
                    : t("person.details.descriptionChars")}
                </FieldError>
              ) : null}
            </Field>
            <Field invalid={checked && emailIssue ? true : undefined}>
              <FieldLabel>{t("person.details.email")}</FieldLabel>
              <FieldControl
                ref={emailRef}
                type="email"
                autoComplete="off"
                spellCheck={false}
                readOnly={saving}
                value={draft.email}
                onChange={(event) =>
                  onDraftChange({ ...draft, email: event.target.value })
                }
                onKeyDown={escape}
              />
              <FieldHint>{t("users.term.email")}</FieldHint>
              {checked && emailIssue ? (
                <FieldError match>
                  {t("person.details.emailInvalid")}
                </FieldError>
              ) : null}
            </Field>
            {problemView}
            <div className={buttonRowClass}>
              <Button type="submit" loading={saving}>
                {saving ? t("common.saving") : t("person.details.save")}
              </Button>
              <Button
                type="button"
                variant="neutral"
                disabled={saving}
                focusableWhenDisabled
                onClick={close}
              >
                {t("person.details.cancel")}
              </Button>
            </div>
          </form>
        )}
        <FactList>
          <FactListItem>
            <FactListLabel>{t("person.fact.name")}</FactListLabel>
            <FactListValue>
              <span className="flex flex-col items-start gap-1">
                <PersonNameText value={name} />
                <Disclosure>
                  <DisclosureTrigger>
                    {t("person.rename.why", { name: isolateName(name) })}
                  </DisclosureTrigger>
                  <DisclosurePanel>
                    <p className="max-w-prose text-sm text-muted-foreground">
                      <Trans i18nKey="person.rename.body" components={slot} />
                    </p>
                  </DisclosurePanel>
                </Disclosure>
              </span>
            </FactListValue>
          </FactListItem>
          {draft === null ? (
            <>
              <FactListItem>
                <FactListLabel>{t("person.fact.description")}</FactListLabel>
                <FactListValue>
                  {comment === "" ? (
                    <None />
                  ) : (
                    <span dir="auto" className="[overflow-wrap:anywhere]">
                      {inertBidi(comment)}
                    </span>
                  )}
                </FactListValue>
              </FactListItem>
              <FactListItem>
                <FactListLabel>{t("person.fact.email")}</FactListLabel>
                <FactListValue>
                  <span className="flex flex-wrap items-center gap-2">
                    {email === "" ? (
                      <None />
                    ) : (
                      <>
                        <Identifier className="[overflow-wrap:anywhere]">
                          {inertBidi(email)}
                        </Identifier>
                        <CopyButton
                          text={email}
                          label={t("person.copyEmail", {
                            name: isolateName(name),
                          })}
                          copiedLabel={t("common.copied")}
                          selectedLabel={t("common.copySelected")}
                          size="icon-sm"
                        />
                      </>
                    )}
                    {emailPending ? <PendingMark /> : null}
                  </span>
                </FactListValue>
              </FactListItem>
            </>
          ) : null}
          <FactListItem>
            <FactListLabel>{t("person.fact.home")}</FactListLabel>
            <FactListValue>{homeValue}</FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("person.fact.keys")}</FactListLabel>
            <FactListValue>
              {keys === 0 ? (
                <None />
              ) : (
                t("person.fact.keysCount", { count: keys })
              )}
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("person.fact.ownDetails")}</FactListLabel>
            <FactListValue>
              <span className="flex flex-col">
                <span>
                  {person.disallowusermod === true
                    ? t("users.no")
                    : t("users.yes")}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t("person.fact.ownDetailsClassic")}
                </span>
              </span>
            </FactListValue>
          </FactListItem>
        </FactList>
        {savedNote ? (
          <p role="status" className="max-w-prose text-sm">
            {t("users.savedNote")}
          </p>
        ) : null}
        <Disclosure>
          <DisclosureTrigger>{t("person.fact.technical")}</DisclosureTrigger>
          <DisclosurePanel>
            <FactList>
              <FactListItem>
                <FactListLabel>{t("person.fact.uid")}</FactListLabel>
                <FactListValue>
                  <span className="tabular-nums">
                    {person.uid === undefined ? "" : String(person.uid)}
                  </span>
                </FactListValue>
              </FactListItem>
              <FactListItem>
                <FactListLabel>{t("person.fact.gid")}</FactListLabel>
                <FactListValue>
                  <Identifier>
                    {person.gid === 100 || person.gid === undefined
                      ? DEFAULT_GROUP
                      : String(person.gid)}
                  </Identifier>
                </FactListValue>
              </FactListItem>
              <FactListItem>
                <FactListLabel>{t("person.fact.shell")}</FactListLabel>
                <FactListValue>
                  <Identifier>{inertBidi(person.shell ?? "")}</Identifier>
                </FactListValue>
              </FactListItem>
              <FactListItem>
                <FactListLabel>{t("person.fact.dir")}</FactListLabel>
                <FactListValue>
                  {dir === "" || dir === NO_HOME ? (
                    <None />
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      <Identifier className="[overflow-wrap:anywhere]">
                        {inertBidi(dir)}
                      </Identifier>
                      <CopyButton
                        text={dir}
                        label={t("person.fact.dir")}
                        copiedLabel={t("common.copied")}
                        selectedLabel={t("common.copySelected")}
                        size="icon-sm"
                      />
                    </span>
                  )}
                </FactListValue>
              </FactListItem>
            </FactList>
          </DisclosurePanel>
        </Disclosure>
      </CardContent>
    </Card>
  );
}
