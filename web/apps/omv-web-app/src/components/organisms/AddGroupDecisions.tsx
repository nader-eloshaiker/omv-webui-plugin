// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a group": the decisions in one form and the one summary (phase 5 users design 10; 0.6, 9.3,
// 9.4, 9.5, 6.3). The reads the rules need come first: the people, the groups and the shared folders;
// when any of them fails nothing is offered (fail closed, 6.1). The form: the name (0.6's group rules,
// on blur its length and characters, on Continue also the reserved names and the names already used
// by a group or a person), the description (9.3: at most 65 characters, no colon or line break),
// the members (the library's MemberPicker, nobody ticked) and the shared folders (P's
// AccountAccessSection in its reporting mode, every folder at No access). Continue checks every field,
// moves focus to the first problem and announces how many there are. The summary has no typed
// confirmation: nothing is erased (UI-8). Nothing here is chosen from the address.
import type {
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
  MemberPicker,
  type JobSummaryItem,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import {
  addGroupStore,
  saveAddGroupDraft,
  startAddGroup,
  type AddGroupChoices,
  type AddGroupDraft,
} from "../../groups/addGroupFlow.ts";
import { naturalCompare } from "../../groups/groupsTable.ts";
import { useGroupsApi } from "../../hooks/useGroupsApi.ts";
import { useNamesText } from "../../hooks/useNamesText.ts";
import { useSharesApi } from "../../hooks/useSharesApi.ts";
import {
  useSharedFoldersAll,
  useUserAccounts,
  useUserGroups,
} from "../../hooks/useSharesReads.ts";
import type { Access } from "../../sharedFolders/accessModel.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { descriptionProblem, newNameProblem } from "../../users/nameRules.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { AccountAccessSection } from "./AccountAccessSection.tsx";

/** The reads of 10 (6.1's rule: the people, the groups and the folders, or nothing is offered). */
export function AddGroupDecisions() {
  const { t } = useTranslation();
  const users = useUserAccounts();
  const groups = useUserGroups();
  const folders = useSharedFoldersAll();
  const reads = [users, groups, folders];
  const failed = reads.find((q) => q.isError);
  if (failed !== undefined) {
    return (
      <ReadFailed
        error={failed.error}
        onRetry={() => {
          for (const q of reads) {
            if (q.isError) {
              void q.refetch();
            }
          }
        }}
        retrying={reads.some((q) => q.isFetching)}
      >
        {t("addGroup.readsFailed")}
      </ReadFailed>
    );
  }
  if (
    users.data === undefined ||
    groups.data === undefined ||
    folders.data === undefined
  ) {
    return (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("addGroup.loading")}
      </p>
    );
  }
  return (
    <AddGroupForm
      users={users.data.data}
      groups={groups.data.data}
      folders={folders.data.data}
    />
  );
}

type Problem = "name" | "comment";

const NEW_DRAFT: AddGroupDraft = {
  name: "",
  comment: "",
  members: [],
  access: {},
};

type NameKey =
  | "addPerson.name.length"
  | "addPerson.name.chars"
  | "addGroup.name.reserved"
  | "addGroup.name.reservedHere"
  | "addGroup.name.taken"
  | "addGroup.name.takenPerson";

/** The name's problem as a message key and its values, or null (0.6, in the design's order). */
function nameMessage(
  name: string,
  users: readonly UserAccount[],
  groups: readonly UserGroup[],
  full: boolean,
): { key: NameKey; values?: Record<string, string> } | null {
  const problem = newNameProblem(name, "group", full);
  if (problem !== null) {
    switch (problem.key) {
      case "length":
        return { key: "addPerson.name.length" };
      case "chars":
        return { key: "addPerson.name.chars" };
      case "reserved":
      case "reservedHere":
        return {
          key: `addGroup.name.${problem.key}`,
          values: { group: isolateName(name) },
        };
    }
  }
  if (!full) {
    return null;
  }
  if (groups.some((g) => g.name === name)) {
    return {
      key: "addGroup.name.taken",
      values: { group: isolateName(name) },
    };
  }
  if (users.some((u) => u.name === name)) {
    return {
      key: "addGroup.name.takenPerson",
      values: { group: isolateName(name) },
    };
  }
  return null;
}

/** Only the folders given access, Read and write or Read only (a new group stores nothing else). */
function givenAccess(
  access: Readonly<Record<string, Access>>,
): AddGroupChoices["access"] {
  const given: Record<string, "rw" | "ro"> = {};
  for (const [uuid, value] of Object.entries(access)) {
    if (value === "rw" || value === "ro") {
      given[uuid] = value;
    }
  }
  return given;
}

function AddGroupForm({
  users,
  groups,
  folders,
}: {
  users: readonly UserAccount[];
  groups: readonly UserGroup[];
  folders: readonly SharedFolder[];
}) {
  const { t } = useTranslation();
  const groupsApi = useGroupsApi();
  const sharesApi = useSharesApi();
  const namesText = useNamesText();
  const [draft, setDraft] = useState<AddGroupDraft>(
    () => addGroupStore.getState().draft ?? NEW_DRAFT,
  );
  const [stage, setStage] = useState<"form" | "summary">("form");
  const [fixed, setFixed] = useState<AddGroupChoices | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [count, setCount] = useState("");
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLInputElement>(null);
  const membersId = useId();

  useEffect(() => {
    if (stage === "summary") {
      summaryRef.current?.focus();
    }
  }, [stage]);

  const people = useMemo(
    () => [...users].sort((a, b) => naturalCompare(a.name, b.name)),
    [users],
  );
  const edit = (change: Partial<AddGroupDraft>) =>
    setDraft((d) => ({ ...d, ...change }));

  const nameFull = nameMessage(draft.name, users, groups, true);
  const nameBlur = nameMessage(draft.name, users, groups, false);
  const commentIssue = descriptionProblem(draft.comment);
  const problems: Problem[] = [
    ...(nameFull !== null ? (["name"] as const) : []),
    ...(commentIssue !== null ? (["comment"] as const) : []),
  ];
  const nameShown = submitted ? nameFull : nameTouched ? nameBlur : null;
  const commentError =
    commentIssue === null
      ? null
      : commentIssue.key === "tooLong"
        ? t("person.details.descriptionTooLong")
        : t("person.details.descriptionChars");

  const onContinue = () => {
    setSubmitted(true);
    const first = problems[0];
    if (first !== undefined) {
      setCount(t("addPerson.check.count", { count: problems.length }));
      (first === "name" ? nameRef : commentRef).current?.focus();
      return;
    }
    setCount("");
    saveAddGroupDraft(draft);
    const listed = new Set(people.map((p) => p.name));
    setFixed({
      name: draft.name,
      comment: draft.comment,
      members: people
        .map((p) => p.name)
        .filter((n) => listed.has(n) && draft.members.includes(n)),
      access: givenAccess(draft.access),
    });
    setStage("summary");
  };

  if (stage === "summary" && fixed !== null) {
    const group = <IdentifierText value={inertBidi(fixed.name)} />;
    const shown = (uuids: string[]) =>
      folders
        .filter((f) => uuids.includes(f.uuid))
        .sort((a, b) => naturalCompare(a.name, b.name))
        .map((f) => isolateName(f.name))
        .join(", ");
    const rw = Object.keys(fixed.access).filter(
      (u) => fixed.access[u] === "rw",
    );
    const ro = Object.keys(fixed.access).filter(
      (u) => fixed.access[u] === "ro",
    );
    const items: JobSummaryItem[] = [
      <Trans key="add" i18nKey="addGroup.sum.add" components={{ group }} />,
    ];
    if (fixed.comment !== "") {
      items.push(
        <Trans
          key="description"
          i18nKey="addPerson.sum.description"
          components={{
            description: <IdentifierText value={inertBidi(fixed.comment)} />,
          }}
        />,
      );
    }
    items.push(
      fixed.members.length > 0
        ? t("addGroup.sum.members", {
            list: namesText(fixed.members, 5),
          })
        : t("addGroup.sum.nobody"),
    );
    if (rw.length > 0) {
      items.push(t("addPerson.sum.rw", { list: shown(rw) }));
    }
    if (ro.length > 0) {
      items.push(t("addPerson.sum.ro", { list: shown(ro) }));
    }
    if (rw.length === 0 && ro.length === 0) {
      items.push(t("addPerson.sum.noAccess"));
    }
    items.push(t("addGroup.sum.order"));
    return (
      <JobSummary
        title={t("addGroup.sum.title", { group: isolateName(fixed.name) })}
        titleLevel={3}
        titleRef={summaryRef}
        items={items}
        confirmLabel={t("addGroup.confirm")}
        backLabel={t("addPerson.changeChoices")}
        onBack={() => setStage("form")}
        onConfirm={() => {
          startAddGroup(
            {
              group: groupsApi.group,
              user: groupsApi.user,
              users: groupsApi.users,
              groups: groupsApi.groups,
              folders: groupsApi.folders,
              shares: groupsApi.shares,
              pending: groupsApi.pending,
              setGroup: groupsApi.setGroup,
              deleteGroup: groupsApi.deleteGroup,
              setPrivileges: sharesApi.setPrivileges,
              apply: groupsApi.apply,
            },
            { apply: t("addGroup.task.apply", { group: fixed.name }) },
            fixed,
          );
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Field
        invalid={nameShown === null ? undefined : true}
        className="max-w-[40rem]"
      >
        <FieldLabel>{t("addPerson.name.label")}</FieldLabel>
        <FieldControl
          ref={nameRef}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          dir="auto"
          required
          placeholder={t("addGroup.name.placeholder")}
          value={draft.name}
          onChange={(event) => edit({ name: event.target.value })}
          onBlur={() => setNameTouched(draft.name !== "")}
        />
        <FieldHint>{t("addGroup.name.hint")}</FieldHint>
        {nameShown === null ? null : (
          <FieldError match>{t(nameShown.key, nameShown.values)}</FieldError>
        )}
      </Field>

      <Field
        invalid={submitted && commentError !== null ? true : undefined}
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
        <FieldHint>{t("group.description.hint")}</FieldHint>
        {submitted && commentError !== null ? (
          <FieldError match>{commentError}</FieldError>
        ) : null}
      </Field>

      <section aria-labelledby={membersId} className="flex flex-col gap-2">
        <h3 id={membersId} className="text-base font-semibold">
          {t("group.members.title")}
        </h3>
        <p className="max-w-prose text-sm">{t("addGroup.members.intro")}</p>
        <MemberPicker
          aria-labelledby={membersId}
          rows={people.map((p) => ({
            id: p.name,
            name: inertBidi(p.name),
            description:
              p.comment === undefined || p.comment === ""
                ? undefined
                : inertBidi(p.comment),
          }))}
          value={draft.members}
          onChange={(members) => edit({ members })}
          changedLabel={t("access.changed")}
          search={{
            label: t("group.members.search"),
            clearLabel: t("users.clearSearch"),
          }}
          show={{
            label: t("users.show.label"),
            all: t("group.members.show.all"),
            ticked: t("group.members.show.members"),
          }}
          countText={(ticked, total) =>
            t("group.members.count", { count: ticked, total })
          }
          filteredEmpty={{
            message: (search) => t("users.filtered", { search }),
            clearLabel: t("users.clearSearch"),
          }}
          pagination={{
            "aria-label": t("group.members.title"),
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
          empty={{
            message: t("group.members.empty"),
            action: (
              <Link to="/usermgmt/users/add" className={routerLinkClass}>
                {t("group.members.emptyLink")}
              </Link>
            ),
          }}
        />
      </section>

      <AccountAccessSection
        kind="group"
        name={draft.name}
        mode="choose"
        draft={{ members: draft.members }}
        headingLevel={3}
        intro={t("addGroup.access.intro")}
        choices={draft.access}
        onChoicesChange={(access) => edit({ access })}
      />

      <p role="status" aria-live="polite" className="text-sm font-medium">
        {count}
      </p>
      <div>
        <Button onClick={onContinue}>{t("addPerson.continue")}</Button>
      </div>
    </div>
  );
}
