// SPDX-License-Identifier: GPL-3.0-or-later
// Changing one's own password (phase 3 design 5.4), typed twice, with UserMgmt.setPasswordByContext.
// The password lives only in the two inputs: it is never held in React state, both inputs are emptied
// the moment it is sent, and the mutation keeps no copy once it settles (UI-6). It never appears in a
// toast, the status line, an error or the URL. No current-password field, strength meter or length
// rule: OMV's method has none, and a rule here would be ours alone.
//
// OMV leaves `postfix` (and `ssh` for an account with keys) pending after a password change of an
// account it keeps in its database (journal, 2026-11-20). An administrator is then told that changes
// wait to be applied; the band itself is unchanged.
import type { Role } from "@omv-webui/react-api-omv/generated";
import { useUserMgmtSetPasswordByContext } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  InlineAlert,
  SecretField,
  ServerMessage,
  useToast,
} from "@omv-webui/react-ui-components";
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { pendingModules } from "../../pending/modules.ts";

interface Props {
  /** The account's name, for password managers to file the new password under. */
  username: string;
  role: Role;
  /** Something is typed and not sent: the page's leave prompt covers it. */
  onTypedChange: (typed: boolean) => void;
  labelledBy: string;
}

type FieldProblem = "required" | "mismatch" | null;

const NEW = "new-password";
const REPEAT = "repeat-password";

export function PasswordForm({
  username,
  role,
  onTypedChange,
  labelledBy,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const change = useUserMgmtSetPasswordByContext({ mutation: { gcTime: 0 } });
  // SecretField takes no ref and no value: its inputs are reached through the form, by name.
  const formRef = useRef<HTMLFormElement>(null);
  const input = (name: typeof NEW | typeof REPEAT) => {
    const element = formRef.current?.elements.namedItem(name);
    return element instanceof HTMLInputElement ? element : null;
  };
  const [problems, setProblems] = useState<{
    password: FieldProblem;
    repeat: FieldProblem;
  }>({
    password: null,
    repeat: null,
  });
  const [failure, setFailure] = useState<{ message: string | null } | null>(
    null,
  );
  const [changed, setChanged] = useState(false);
  const admin = role === "admin";
  const info = useSystemInformation(role);
  const pendingNow =
    admin && pendingModules(info.data?.dirtyModules).length > 0;

  const typed = () => {
    onTypedChange(true);
    setChanged(false);
  };

  const empty = () => {
    for (const name of [NEW, REPEAT] as const) {
      const element = input(name);
      if (element) {
        element.value = "";
      }
    }
    onTypedChange(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (change.isPending) {
      return;
    }
    const password = input(NEW)?.value ?? "";
    const repeat = input(REPEAT)?.value ?? "";
    const next = {
      password: password === "" ? ("required" as const) : null,
      repeat: repeat === "" ? ("required" as const) : null,
    };
    if (next.password || next.repeat) {
      setProblems(next);
      input(next.password ? NEW : REPEAT)?.focus();
      return;
    }
    if (password !== repeat) {
      setProblems({ password: null, repeat: "mismatch" });
      empty();
      input(NEW)?.focus();
      return;
    }
    setProblems({ password: null, repeat: null });
    setFailure(null);
    empty();
    try {
      await change.mutateAsync({ data: { password } });
      setChanged(true);
      toast.show({ title: t("account.passwordChanged") });
    } catch (error) {
      setFailure({ message: isRpcError(error) ? error.message : null });
      input(NEW)?.focus();
    } finally {
      change.reset();
    }
  };

  const repeatMessage =
    problems.repeat === "required"
      ? t("account.repeatRequired")
      : problems.repeat === "mismatch"
        ? t("account.passwordMismatch")
        : undefined;

  return (
    <form
      ref={formRef}
      method="post"
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-labelledby={labelledBy}
      className="flex max-w-[40rem] flex-col gap-4"
    >
      <p className="max-w-prose">{t("account.passwordIntro")}</p>
      {failure ? (
        <InlineAlert tone="critical" title={t("account.passwordFailed")}>
          {failure.message === null ? null : (
            <ServerMessage label={t("app.serverMessage")}>
              {failure.message}
            </ServerMessage>
          )}
        </InlineAlert>
      ) : null}
      {/* For password managers: the account the new password belongs to. Not a field to fill. */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={username}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />
      <SecretField
        name={NEW}
        label={t("account.newPassword")}
        hint={t("account.newPasswordHint")}
        revealLabel={t("account.showPassword")}
        autoComplete="new-password"
        readOnly={change.isPending}
        error={
          problems.password === "required"
            ? t("account.passwordRequired")
            : undefined
        }
        onChange={() => {
          typed();
          setProblems((p) => ({ ...p, password: null }));
        }}
      />
      <SecretField
        name={REPEAT}
        label={t("account.repeatPassword")}
        revealLabel={t("account.showPassword")}
        autoComplete="new-password"
        readOnly={change.isPending}
        error={repeatMessage}
        onChange={() => {
          typed();
          setProblems((p) => ({ ...p, repeat: null }));
        }}
      />
      <div className="flex flex-col gap-2">
        <div>
          <Button type="submit" loading={change.isPending}>
            {change.isPending
              ? t("account.changingPassword")
              : t("account.changePassword")}
          </Button>
        </div>
        <div role="status" className="flex flex-col gap-1 text-sm empty:hidden">
          {changed ? <p>{t("account.passwordChangedLine")}</p> : null}
          {changed && pendingNow ? <p>{t("account.pendingNote")}</p> : null}
        </div>
      </div>
    </form>
  );
}
