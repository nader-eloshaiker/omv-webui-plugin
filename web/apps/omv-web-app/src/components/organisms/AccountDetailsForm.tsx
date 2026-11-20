// SPDX-License-Identifier: GPL-3.0-or-later
// A normal user's own description and email address (phase 3 design 5.3), saved with
// UserMgmt.setUserByContext. The change takes effect at once for the reader; there is no band for a
// normal user. Values are checked with the contract's request schema on blur and on submit. The draft
// is held by the page, so one leave prompt covers both of its forms.
import {
  getUserMgmtGetUserByContextQueryKey,
  useUserMgmtSetUserByContext,
} from "@omv-webui/react-api-omv/generated";
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
  useToast,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { detailsProblems, type DetailsValues } from "../../account/account.ts";

interface Props {
  saved: DetailsValues;
  draft: DetailsValues | null;
  onDraftChange: (draft: DetailsValues | null) => void;
  /** The form's accessible name: the section's heading. */
  labelledBy: string;
}

export function AccountDetailsForm({
  saved,
  draft,
  onDraftChange,
  labelledBy,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const save = useUserMgmtSetUserByContext();
  const [shown, setShown] = useState({ email: false, comment: false });
  const alertRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLInputElement>(null);
  const noChangesId = useId();

  const values = draft ?? saved;
  const dirty =
    draft !== null &&
    (draft.email !== saved.email || draft.comment !== saved.comment);
  const saving = save.isPending;
  const failure = save.error;

  useEffect(() => {
    if (failure) {
      alertRef.current?.focus();
    }
  }, [failure]);

  const edit = (change: Partial<DetailsValues>) =>
    onDraftChange({ ...values, ...change });

  const check = (field: keyof DetailsValues) =>
    setShown((s) => ({ ...s, [field]: detailsProblems(values)[field] }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || saving || draft === null) {
      return;
    }
    const problems = detailsProblems(draft);
    setShown(problems);
    if (problems.comment || problems.email) {
      (problems.comment ? commentRef : emailRef).current?.focus();
      return;
    }
    save.reset();
    save.mutate(
      { data: { email: draft.email, comment: draft.comment } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getUserMgmtGetUserByContextQueryKey(),
          });
          onDraftChange(null);
          toast.show({ title: t("account.detailsSaved") });
        },
      },
    );
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-labelledby={labelledBy}
      className="flex max-w-[40rem] flex-col gap-4"
    >
      {failure ? (
        <InlineAlert
          ref={alertRef}
          tabIndex={-1}
          tone="critical"
          title={t("account.detailsFailed")}
          className="outline-hidden"
        >
          {isRpcError(failure) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {failure.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}
      <Field invalid={shown.comment || undefined}>
        <FieldLabel>{t("account.comment")}</FieldLabel>
        <FieldControl
          ref={commentRef}
          name="comment"
          dir="auto"
          autoComplete="off"
          readOnly={saving}
          value={values.comment}
          onChange={(event) => {
            edit({ comment: event.target.value });
            setShown((s) => ({ ...s, comment: false }));
          }}
          onBlur={() => check("comment")}
        />
        <FieldHint>{t("account.commentHint")}</FieldHint>
        {shown.comment ? (
          <FieldError>{t("account.commentInvalid")}</FieldError>
        ) : null}
      </Field>
      <Field invalid={shown.email || undefined}>
        <FieldLabel>{t("account.email")}</FieldLabel>
        <FieldControl
          ref={emailRef}
          name="email"
          type="email"
          dir="auto"
          autoComplete="email"
          readOnly={saving}
          value={values.email}
          onChange={(event) => {
            edit({ email: event.target.value });
            setShown((s) => ({ ...s, email: false }));
          }}
          onBlur={() => check("email")}
        />
        <FieldHint>{t("account.emailHint")}</FieldHint>
        {shown.email ? (
          <FieldError>{t("account.emailInvalid")}</FieldError>
        ) : null}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="neutral"
          loading={saving}
          disabled={!dirty}
          focusableWhenDisabled
          aria-describedby={dirty ? undefined : noChangesId}
        >
          {saving ? t("common.saving") : t("account.saveDetails")}
        </Button>
        <Button
          type="button"
          variant="neutral"
          disabled={!dirty || saving}
          focusableWhenDisabled
          aria-describedby={dirty ? undefined : noChangesId}
          onClick={() => {
            onDraftChange(null);
            setShown({ email: false, comment: false });
            save.reset();
          }}
        >
          {t("common.discard")}
        </Button>
        {dirty ? null : (
          <span id={noChangesId} className="text-sm text-muted-foreground">
            {t("common.noChanges")}
          </span>
        )}
      </div>
    </form>
  );
}
