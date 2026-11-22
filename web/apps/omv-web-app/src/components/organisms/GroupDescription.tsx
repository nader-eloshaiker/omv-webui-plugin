// SPDX-License-Identifier: GPL-3.0-or-later
// A group's description, edited in place (phase 5 users design 9.3; 0.11; D13): "Edit" turns the value
// into a field with Save and Cancel; Enter saves, Escape cancels, and focus goes back to "Edit" either
// way. At most 65 characters, no colon or line break (nameRules.descriptionProblem). Saving re-reads
// the group with getGroup and stops when its members or description changed since the page read them;
// then setGroup with the members as re-read and the new description. Saved: a toast, the note that it
// is already in effect and Windows and Mac sharing is listed as not applied, and the pending mark.
// Failed: the field stays with the server's words.
import type { UserGroup } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  InlineAlert,
  ServerMessage,
  buttonRowClass,
  useToast,
} from "@omv-webui/react-ui-components";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { groupChanged, groupSetRequest } from "../../groups/groupWrites.ts";
import { readName } from "../../groups/nameFree.ts";
import { useGroupsApi } from "../../hooks/useGroupsApi.ts";
import { descriptionProblem } from "../../users/nameRules.ts";
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

type Problem =
  | { kind: "tooLong" }
  | { kind: "chars" }
  | { kind: "running"; action: AccountAction }
  | { kind: "changed" }
  | { kind: "gone" }
  | { kind: "server"; error: unknown };

export function GroupDescription({
  group,
  pending,
  editing,
  onEditingChange,
  onSaved,
  onShowCurrent,
}: {
  group: UserGroup;
  /** This session saved it and Windows and Mac sharing is not applied yet (0.4). */
  pending: boolean;
  /** The page holds the field's state, so Refresh and leaving can ask first. */
  editing: string | null;
  onEditingChange: (draft: string | null) => void;
  onSaved: () => void;
  /** "Show the current details": the page reads the lists again, the field kept. */
  onShowCurrent: () => void;
}) {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const toast = useToast();
  const editRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const focusToRef = useRef<"edit" | "field" | null>(null);
  useEffect(() => {
    const target = focusToRef.current;
    if (target === null) {
      return;
    }
    focusToRef.current = null;
    (target === "edit" ? editRef : inputRef).current?.focus();
  });

  const comment = group.comment ?? "";
  const open = () => {
    setProblem(null);
    onEditingChange(comment);
    focusToRef.current = "field";
  };
  const close = () => {
    setProblem(null);
    onEditingChange(null);
    focusToRef.current = "edit";
  };

  const save = async (draft: string) => {
    if (saving) {
      return;
    }
    const wrong = descriptionProblem(draft);
    if (wrong !== null) {
      setProblem({ kind: wrong.key });
      inputRef.current?.focus();
      return;
    }
    const id = accountId("group", group.name);
    if (!beginAccountAction(id, "description")) {
      const action = runningOnAccount(id);
      setProblem(action === null ? null : { kind: "running", action });
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const read = await readName("group", group.name, api.group);
      if (read.kind === "free") {
        setProblem({ kind: "gone" });
        return;
      }
      if (read.kind === "unknown") {
        setProblem({ kind: "server", error: read.error });
        return;
      }
      if (groupChanged(group, read.value)) {
        setProblem({ kind: "changed" });
        return;
      }
      await api.setGroup(groupSetRequest(read.value, { comment: draft }));
      recordAccountSaved(id, "description");
      await api.groups().catch(() => undefined);
      toast.show({
        title: t("group.description.saved", { group: isolateName(group.name) }),
      });
      onSaved();
      close();
    } catch (error) {
      setProblem({ kind: "server", error });
    } finally {
      setSaving(false);
      endAccountAction(id);
    }
  };

  if (editing === null) {
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {comment === "" ? (
          <span className="text-muted-foreground">
            {t("group.fact.descriptionNone")}
          </span>
        ) : (
          <span dir="auto" className="[overflow-wrap:anywhere]">
            {inertBidi(comment)}
          </span>
        )}
        {pending ? <PendingMark /> : null}
        <Button ref={editRef} variant="neutral" size="sm" onClick={open}>
          {t("group.description.edit")}
        </Button>
      </span>
    );
  }

  const fieldProblem =
    problem?.kind === "tooLong" || problem?.kind === "chars" ? problem : null;
  return (
    <form
      noValidate
      className="flex max-w-[40rem] flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save(editing);
      }}
    >
      <Field invalid={fieldProblem === null ? undefined : true}>
        <FieldLabel>{t("group.description.label")}</FieldLabel>
        <FieldControl
          ref={inputRef}
          autoComplete="off"
          dir="auto"
          readOnly={saving}
          value={editing}
          onChange={(event) => onEditingChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        />
        <FieldHint>{t("group.description.hint")}</FieldHint>
        {fieldProblem === null ? null : (
          <FieldError match>
            {fieldProblem.kind === "tooLong"
              ? t("person.details.descriptionTooLong")
              : t("person.details.descriptionChars")}
          </FieldError>
        )}
      </Field>
      {problem !== null && fieldProblem === null ? (
        <InlineAlert
          tone="critical"
          title={
            problem.kind === "running"
              ? undefined
              : t("group.description.failed")
          }
        >
          {problem.kind === "running" ? (
            t("group.running", { action: t(`users.action.${problem.action}`) })
          ) : problem.kind === "gone" ? (
            t("group.gone")
          ) : problem.kind === "changed" ? (
            <span className="flex flex-col items-start gap-2">
              <span>
                <Trans
                  i18nKey="group.changedElsewhere"
                  components={{
                    group: <GroupNameText value={group.name} />,
                  }}
                />
              </span>
              <Button
                variant="neutral"
                size="sm"
                onClick={() => {
                  setProblem(null);
                  onShowCurrent();
                }}
              >
                {t("group.showCurrent")}
              </Button>
            </span>
          ) : problem.kind === "server" && isRpcError(problem.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {problem.error.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}
      <div className={buttonRowClass}>
        <Button type="submit" loading={saving}>
          {saving ? t("common.saving") : t("group.description.save")}
        </Button>
        <Button
          type="button"
          variant="neutral"
          disabled={saving}
          focusableWhenDisabled
          onClick={close}
        >
          {t("group.description.cancel")}
        </Button>
      </div>
    </form>
  );
}
