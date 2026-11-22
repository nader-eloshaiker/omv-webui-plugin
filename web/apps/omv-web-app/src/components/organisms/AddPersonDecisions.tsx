// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a person": the decisions in one form and the one summary (phase 5 users design 6.1 to 6.3,
// 6.7, 6.8; Flow B; P6, P7, P8; Q5). The reads the rules need come first; when the people, the groups
// or the shared folders cannot be read nothing is offered (fail closed), and the other reads only take
// away what they feed (the SSH line, the home-folder line, the Sharing column, the two privilege
// checkboxes). The form: the name (0.6), the password typed twice (0.7), the email address, the
// description, the groups (nothing ticked), the shared folders (every row at No access, A5) and the two
// privilege choices (unticked). Continue checks every field in order, moves focus to the first problem
// and announces how many there are. The summary has no typed confirmation: nothing is erased (UI-8).
//
// The password lives only in this form's state, while it is typed and while the summary is open; it
// is handed to the run when the reader confirms, and cleared here at once. Going back from the summary
// ("Change choices") clears it, so the form asks for it again. It is never in the draft, the summary,
// an announcement or storage (0.7, UI-6).
import type {
  HomeFolderSettings,
  SharedFolder,
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import {
  Button,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  JobSummary,
  NewPasswordFields,
  type JobSummaryItem,
} from "@omv-webui/react-ui-components";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { useFsApi } from "../../hooks/useFsApi.ts";
import {
  useSharedFoldersAll,
  useUserAccounts,
  useUserGroups,
} from "../../hooks/useSharesReads.ts";
import { useUsersApi } from "../../hooks/useUsersApi.ts";
import {
  useGroupCheck,
  useHomeSettings,
  useSshSettings,
} from "../../hooks/useUsersReads.ts";
import {
  accessByAccount,
  folderValue,
  personLine,
  type FolderChoices,
} from "../../users/accessByAccount.ts";
import {
  addPersonStore,
  passwordProblem,
  saveAddPersonDraft,
  startAddPerson,
  type AddPersonChoices,
  type AddPersonDraft,
} from "../../users/addPersonFlow.ts";
import { encryptedConnection } from "../../users/connection.ts";
import { descriptionProblem, newNameProblem } from "../../users/nameRules.ts";
import { emailProblem, sshLineOf } from "../../users/personPage.ts";
import { ADMIN_GROUP, SSH_GROUP } from "../../users/systemGroups.ts";
import { byName } from "../../users/usersList.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { PersonNameText } from "../atoms/PersonNameText.tsx";
import { PasswordHttpNotice } from "../molecules/PasswordHttpNotice.tsx";
import { PersonGroupPicker } from "../molecules/PersonGroupPicker.tsx";
import { PersonPowerFields } from "../molecules/PersonPowerFields.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { AccountAccessSection } from "./AccountAccessSection.tsx";

/** The reads of 6.1; the first three are needed, the rest only feed what they show. */
export function AddPersonDecisions() {
  const { t } = useTranslation();
  const users = useUserAccounts();
  const groups = useUserGroups();
  const folders = useSharedFoldersAll();
  const ssh = useSshSettings();
  const home = useHomeSettings();

  const needed = [
    { q: users, words: t("users.loadFailed") },
    { q: groups, words: t("personGroups.loadFailed") },
    { q: folders, words: t("personAccess.loadFailed") },
  ];
  const failed = needed.find((r) => r.q.isError && r.q.data === undefined);
  if (failed !== undefined) {
    return (
      <div className="flex flex-col gap-2">
        <p className="font-medium">{t("addPerson.readsFailed")}</p>
        <ReadFailed
          error={failed.q.error}
          onRetry={() => {
            for (const r of needed) {
              if (r.q.isError) {
                void r.q.refetch();
              }
            }
          }}
          retrying={needed.some((r) => r.q.isFetching)}
        >
          {failed.words}
        </ReadFailed>
      </div>
    );
  }
  if (
    users.data === undefined ||
    groups.data === undefined ||
    folders.data === undefined
  ) {
    return (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("addPerson.loading")}
      </p>
    );
  }
  return (
    <AddPersonForm
      users={users.data.data}
      groups={groups.data.data}
      folders={folders.data.data}
      ssh={{ data: ssh.data, failed: ssh.isError }}
      home={home.data}
    />
  );
}

type Problem = "name" | "password" | "again" | "email" | "comment";

const newDraft = (): AddPersonDraft => ({
  name: "",
  email: "",
  comment: "",
  groups: [],
  admin: false,
  ssh: false,
  access: {},
});

function AddPersonForm({
  users,
  groups,
  folders,
  ssh,
  home,
}: {
  users: readonly UserAccount[];
  groups: readonly UserGroup[];
  folders: readonly SharedFolder[];
  ssh: {
    data:
      | {
          enable: boolean;
          passwordauthentication: boolean;
          pubkeyauthentication: boolean;
        }
      | undefined;
    failed: boolean;
  };
  home: HomeFolderSettings | undefined;
}) {
  const { t } = useTranslation();
  const usersApi = useUsersApi();
  const fsApi = useFsApi();
  const adminGroup = useGroupCheck(ADMIN_GROUP);
  const sshGroup = useGroupCheck(SSH_GROUP);
  const notice = encryptedConnection() ? undefined : <PasswordHttpNotice />;
  const summaryOf = useAddPersonSummary();
  const [draft, setDraft] = useState<AddPersonDraft>(
    () => addPersonStore.getState().draft ?? newDraft(),
  );
  // The password, only here, only while typed and while the summary is open (0.7).
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [stage, setStage] = useState<"form" | "summary">("form");
  const [fixed, setFixed] = useState<AddPersonChoices | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [againTouched, setAgainTouched] = useState(false);
  const [count, setCount] = useState("");
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const againRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLInputElement>(null);
  const groupsId = useId();

  useEffect(() => {
    if (stage === "summary") {
      summaryRef.current?.focus();
    }
  }, [stage]);

  const edit = (change: Partial<AddPersonDraft>) =>
    setDraft((d) => ({ ...d, ...change }));
  const name = draft.name;
  const homeFolder =
    home?.enable === true
      ? (folders.find((f) => f.uuid === home.sharedfolderref) ?? null)
      : null;

  // The name (0.6): on blur the length and characters, on Continue the reserved names and the lists.
  const nameIssue = (withAll: boolean): string | null => {
    const problem = newNameProblem(name, "person", withAll);
    if (problem !== null) {
      return problem.key === "reserved" || problem.key === "reservedHere"
        ? t(`addPerson.name.${problem.key}`, { name: isolateName(name) })
        : t(`addPerson.name.${problem.key}`);
    }
    if (withAll && users.some((u) => u.name === name)) {
      return t("addPerson.name.takenPerson", { name: isolateName(name) });
    }
    if (withAll && groups.some((g) => g.name === name)) {
      return t("addPerson.name.takenGroup", { name: isolateName(name) });
    }
    return null;
  };
  const nameError = submitted
    ? nameIssue(true)
    : nameTouched
      ? nameIssue(false)
      : null;
  const passwordIssue = passwordProblem(password, again);
  const commentIssue = descriptionProblem(draft.comment);
  const emailIssue = emailProblem(draft.email.trim());
  const problems: Problem[] = [
    ...(nameIssue(true) !== null ? (["name"] as const) : []),
    ...(passwordIssue === "empty" || passwordIssue === "lineBreak"
      ? (["password"] as const)
      : []),
    ...(passwordIssue === "mismatch" ? (["again"] as const) : []),
    ...(emailIssue ? (["email"] as const) : []),
    ...(commentIssue !== null ? (["comment"] as const) : []),
  ];
  const shows = (p: Problem) => submitted && problems.includes(p);

  const focusProblem = (p: Problem) => {
    const ref = {
      name: nameRef,
      password: passwordRef,
      again: againRef,
      email: emailRef,
      comment: commentRef,
    }[p];
    ref.current?.focus();
  };

  const onContinue = () => {
    setSubmitted(true);
    const first = problems[0];
    if (first !== undefined) {
      setCount(t("addPerson.check.count", { count: problems.length }));
      focusProblem(first);
      return;
    }
    setCount("");
    const clean: AddPersonDraft = { ...draft, email: draft.email.trim() };
    saveAddPersonDraft(clean);
    setFixed({
      ...clean,
      folderNames: Object.fromEntries(folders.map((f) => [f.uuid, f.name])),
      homeFolder: homeFolder?.name ?? null,
    });
    setStage("summary");
  };

  const back = () => {
    // Going back clears the passwords: the form asks for them again (6.3).
    setPassword("");
    setAgain("");
    setAgainTouched(false);
    setSubmitted(false);
    setStage("form");
  };

  if (stage === "summary" && fixed !== null) {
    return (
      <JobSummary
        title={t("addPerson.sum.title", { name: isolateName(fixed.name) })}
        titleLevel={3}
        titleRef={summaryRef}
        items={summaryOf(fixed, folders, users, groups, ssh)}
        confirmLabel={t("addPerson.confirm")}
        backLabel={t("addPerson.changeChoices")}
        onBack={back}
        onConfirm={() => {
          const typed = password;
          setPassword("");
          setAgain("");
          startAddPerson(
            {
              users: usersApi,
              apply: fsApi.apply,
            },
            { apply: t("addPerson.task.apply", { name: fixed.name }) },
            fixed,
            typed,
          );
        }}
      />
    );
  }

  const shownName = name === "" ? t("addPerson.thisPerson") : name;
  return (
    <div className="flex flex-col gap-5">
      <Field
        invalid={nameError === null ? undefined : true}
        className="max-w-[40rem]"
      >
        <FieldLabel>{t("addPerson.name.label")}</FieldLabel>
        <FieldControl
          ref={nameRef}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          required
          placeholder={t("addPerson.name.placeholder")}
          value={name}
          onChange={(event) => edit({ name: event.target.value })}
          onBlur={() => setNameTouched(name !== "")}
        />
        <FieldHint>
          {name === "" ? (
            t("addPerson.name.hintEmpty")
          ) : (
            <span>{t("addPerson.name.hint", { name: isolateName(name) })}</span>
          )}
        </FieldHint>
        {nameError === null ? null : <FieldError match>{nameError}</FieldError>}
      </Field>

      <NewPasswordFields
        className="max-w-[40rem]"
        password={{
          label: t("addPerson.password.label"),
          hint: t("addPerson.password.hint"),
          error: shows("password")
            ? passwordIssue === "lineBreak"
              ? t("password.lineBreak")
              : t("addPerson.password.empty")
            : undefined,
          value: password,
          onValueChange: setPassword,
          inputRef: passwordRef,
        }}
        confirmation={{
          label: t("addPerson.password.again"),
          error:
            (shows("again") || againTouched) && passwordIssue === "mismatch"
              ? t("password.mismatch")
              : undefined,
          value: again,
          onValueChange: setAgain,
          onBlur: () => setAgainTouched(again !== ""),
          inputRef: againRef,
        }}
        revealLabels={{ show: t("password.show"), hide: t("password.hide") }}
        notice={notice}
      />

      <Field
        invalid={shows("email") ? true : undefined}
        className="max-w-[40rem]"
      >
        <FieldLabel>{t("person.details.email")}</FieldLabel>
        <FieldControl
          ref={emailRef}
          type="email"
          autoComplete="off"
          spellCheck={false}
          value={draft.email}
          onChange={(event) => edit({ email: event.target.value })}
        />
        <FieldHint>{t("users.term.email")}</FieldHint>
        {shows("email") ? (
          <FieldError match>{t("person.details.emailInvalid")}</FieldError>
        ) : null}
      </Field>

      <Field
        invalid={shows("comment") ? true : undefined}
        className="max-w-[40rem]"
      >
        <FieldLabel>{t("person.details.description")}</FieldLabel>
        <FieldControl
          ref={commentRef}
          autoComplete="off"
          dir="auto"
          value={draft.comment}
          onChange={(event) => edit({ comment: event.target.value })}
        />
        <FieldHint>{t("person.details.descriptionHint")}</FieldHint>
        {shows("comment") && commentIssue !== null ? (
          <FieldError match>
            {commentIssue.key === "tooLong"
              ? t("person.details.descriptionTooLong")
              : t("person.details.descriptionChars")}
          </FieldError>
        ) : null}
      </Field>

      <section aria-labelledby={groupsId} className="flex flex-col gap-2">
        <h3 id={groupsId} className="text-base font-semibold">
          {t("personGroups.title")}
        </h3>
        {groups.length === 0 ? (
          <p className="max-w-prose text-sm">
            {t("addPerson.groups.none", { name: isolateName(shownName) })}
          </p>
        ) : (
          <>
            <p className="max-w-prose text-sm">
              {t("shares.term.group")} {t("personGroups.noPowers")}
            </p>
            <PersonGroupPicker
              aria-labelledby={groupsId}
              name={shownName}
              groups={groups}
              value={draft.groups}
              initialValue={[]}
              onChange={(next) => edit({ groups: next })}
            />
          </>
        )}
      </section>

      <AccountAccessSection
        kind="user"
        name={name}
        mode="choose"
        headingLevel={3}
        draft={{ groups: draft.groups }}
        choices={draft.access}
        onChoicesChange={(access: FolderChoices) => edit({ access })}
      />

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">
          {t("personCan.title", { name: isolateName(shownName) })}
        </h3>
        <p className="max-w-prose text-sm">{t("personCan.intro")}</p>
        <PersonPowerFields
          name={shownName}
          value={{ admin: draft.admin, ssh: draft.ssh }}
          initial={{ admin: false, ssh: false }}
          onChange={(next) => edit(next)}
          adminGroup={adminGroup}
          sshGroup={sshGroup}
          self="other"
          sshLine={sshLineOf(ssh.data, ssh.failed, 0)}
          inRoot={false}
        />
      </section>

      <div className="flex max-w-prose flex-col gap-1 text-sm">
        <p>{t("addPerson.accountNote")}</p>
        {homeFolder === null ? null : (
          <p>
            <Trans
              i18nKey="addPerson.homeNote"
              components={{
                folder: <FolderNameText value={homeFolder.name} />,
              }}
            />
          </p>
        )}
      </div>

      <p role="status" aria-live="polite" className="text-sm font-medium">
        {count}
      </p>
      <div>
        <Button onClick={onContinue}>{t("addPerson.continue")}</Button>
      </div>
    </div>
  );
}

/** A description in a `<Trans>` slot: as text, in its own direction, controls shown as "�". */
function DescriptionText({ value }: { value: string }) {
  return (
    <bdi dir="auto" className="[overflow-wrap:anywhere]">
      {inertBidi(value)}
    </bdi>
  );
}

/** 6.3: one item per thing that happens, in the order it happens. */
function useAddPersonSummary() {
  const { t } = useTranslation();
  return (
    fixed: AddPersonChoices,
    folders: readonly SharedFolder[],
    users: readonly UserAccount[],
    groups: readonly UserGroup[],
    ssh: { data: { enable: boolean } | undefined; failed: boolean },
  ): JobSummaryItem[] => {
    const name = <PersonNameText value={fixed.name} />;
    const listOf = (names: readonly string[]) =>
      new Intl.ListFormat(undefined, { type: "conjunction" }).format(
        [...names].sort(byName).map(isolateName),
      );
    const items: JobSummaryItem[] = [
      <Trans key="add" i18nKey="addPerson.sum.add" components={{ name }} />,
    ];
    if (fixed.email !== "") {
      items.push(
        <Trans
          key="email"
          i18nKey="addPerson.sum.email"
          components={{ name, email: <IdentifierText value={fixed.email} /> }}
        />,
      );
    }
    if (fixed.comment !== "") {
      items.push(
        <Trans
          key="description"
          i18nKey="addPerson.sum.description"
          components={{
            description: <DescriptionText value={fixed.comment} />,
          }}
        />,
      );
    }
    items.push(
      <>
        {fixed.groups.length === 0
          ? t("addPerson.sum.noGroups")
          : t("addPerson.sum.groups", { list: listOf(fixed.groups) })}
      </>,
    );

    // Access, grouped: their own choices, then what the chosen groups give.
    const rows = accessByAccount(
      "user",
      fixed.name,
      folders,
      [
        ...users.filter((u) => u.name !== fixed.name),
        { name: fixed.name, groups: ["users", ...fixed.groups] },
      ],
      groups,
    );
    const rw: string[] = [];
    const ro: string[] = [];
    const via = new Map<string, string[]>();
    for (const r of rows) {
      const value = folderValue(r, fixed.access);
      if (value === "rw") {
        rw.push(r.folder.name);
      } else if (value === "ro") {
        ro.push(r.folder.name);
      } else if (value === "none") {
        const line = personLine(r, fixed.access);
        if (line?.kind === "viaGroup") {
          via.set(line.group, [...(via.get(line.group) ?? []), r.folder.name]);
        }
      }
    }
    if (rw.length > 0) {
      items.push(<>{t("addPerson.sum.rw", { list: listOf(rw) })}</>);
    }
    if (ro.length > 0) {
      items.push(<>{t("addPerson.sum.ro", { list: listOf(ro) })}</>);
    }
    for (const [group, list] of [...via.entries()].sort((a, b) =>
      byName(a[0], b[0]),
    )) {
      items.push(
        <Trans
          key={`via:${group}`}
          i18nKey="addPerson.sum.viaGroup"
          values={{ list: listOf(list) }}
          components={{ group: <PersonNameText value={group} /> }}
        />,
      );
    }
    if (rw.length === 0 && ro.length === 0 && via.size === 0) {
      items.push(<>{t("addPerson.sum.noAccess")}</>);
    }
    if (fixed.admin) {
      items.push({
        tone: "warning",
        content: <Trans i18nKey="addPerson.sum.admin" components={{ name }} />,
      });
    }
    if (fixed.ssh) {
      const off: ReactNode =
        ssh.data !== undefined && !ssh.data.enable ? (
          <span className="block">{t("personCan.sshOff")}</span>
        ) : null;
      items.push({
        tone: "warning",
        content: (
          <>
            <span className="block">
              <Trans i18nKey="addPerson.sum.ssh" components={{ name }} />
            </span>
            {off}
          </>
        ),
      });
    }
    if (fixed.homeFolder !== null) {
      items.push(
        <Trans
          key="home"
          i18nKey="addPerson.sum.home"
          components={{
            name,
            folder: <FolderNameText value={fixed.homeFolder} />,
          }}
        />,
      );
    }
    items.push(<>{t("addPerson.sum.order")}</>);
    return items;
  };
}
