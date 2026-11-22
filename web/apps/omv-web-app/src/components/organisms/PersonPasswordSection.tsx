// SPDX-License-Identifier: GPL-3.0-or-later
// "Password" on a person's page (phase 5 users design 5; 0.7; UI-6, P7): the password is never read,
// shown or claimed to be set. "Set a new password…" opens a dialog with the two masked fields
// (NewPasswordFields: autocomplete="new-password", each with its own reveal toggle, kept exactly as
// typed). Checked on "Set password": not empty, no line break, the two the same. Then getUser re-read
// (R4) and setUser with the row as read and the password set. Both fields are cleared as soon as the
// request returns, whatever it returned, and when the dialog closes: the password lives only in this
// component's state while typed, and in the one request (the transport takes it out of the reply). It
// is never in a toast, a dialog's text, the address, storage or a log. For the signed-in person the
// section points to Your account instead (0.8). Nothing retries by itself (UI-14).
import type { UserAccount } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  InlineAlert,
  NewPasswordFields,
  ServerMessage,
  useToast,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { isCut } from "../../filesystems/fsTasks.ts";
import { isolateName } from "../../format/isolate.ts";
import { useUsersApi } from "../../hooks/useUsersApi.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { passwordProblem } from "../../users/addPersonFlow.ts";
import { encryptedConnection } from "../../users/connection.ts";
import { savePerson } from "../../users/personPage.ts";
import type { SelfReading } from "../../users/userModel.ts";
import {
  accountId,
  beginAccountAction,
  endAccountAction,
  runningOnAccount,
  type AccountAction,
} from "../../users/usersSession.ts";
import { PersonNameText } from "../atoms/PersonNameText.tsx";
import { PasswordHttpNotice } from "../molecules/PasswordHttpNotice.tsx";

type Failure =
  | { kind: "server"; error: unknown }
  | { kind: "unknown" }
  | { kind: "changed" }
  | { kind: "gone" }
  | { kind: "running"; action: AccountAction };

export function PersonPasswordSection({
  person,
  self,
  onShowCurrent,
}: {
  person: UserAccount;
  self: SelfReading;
  onShowCurrent: () => void;
}) {
  const { t } = useTranslation();
  const api = useUsersApi();
  const toast = useToast();
  const headingId = useId();
  const openRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [checked, setChecked] = useState(false);
  const [mismatchShown, setMismatchShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [refocus, setRefocus] = useState(0);
  useEffect(() => {
    if (refocus > 0) {
      firstRef.current?.focus();
    }
  }, [refocus]);
  const notice = encryptedConnection() ? undefined : <PasswordHttpNotice />;
  const name = person.name;
  const slot = { name: <PersonNameText value={name} /> };

  const clear = () => {
    setPassword("");
    setAgain("");
  };
  const close = () => {
    clear();
    setChecked(false);
    setMismatchShown(false);
    setFailure(null);
    setOpen(false);
  };

  const problem = passwordProblem(password, again);
  const firstError =
    checked && problem === "empty"
      ? t("password.empty")
      : checked && problem === "lineBreak"
        ? t("password.lineBreak")
        : undefined;
  const secondError =
    (checked || mismatchShown) && problem === "mismatch"
      ? t("password.mismatch")
      : undefined;

  const submit = async () => {
    setChecked(true);
    if (problem !== null || busy) {
      if (problem !== "mismatch") {
        firstRef.current?.focus();
      }
      return;
    }
    const id = accountId("user", name);
    if (!beginAccountAction(id, "password")) {
      const action = runningOnAccount(id);
      setFailure(action === null ? null : { kind: "running", action });
      return;
    }
    setBusy(true);
    setFailure(null);
    // Taken once, and the fields are cleared whatever the request returns (0.7, UI-6).
    const typed = password;
    let done = false;
    try {
      const outcome = await savePerson(api, person, () => ({
        password: typed,
      }));
      if (outcome.kind === "saved") {
        done = true;
        clear();
        setChecked(false);
        setOpen(false);
        setSavedNote(true);
        toast.show({ title: t("password.done", { name: isolateName(name) }) });
        return;
      }
      setFailure({ kind: outcome.kind === "gone" ? "gone" : "changed" });
    } catch (error) {
      setFailure(
        isCut(error) ? { kind: "unknown" } : { kind: "server", error },
      );
    } finally {
      clear();
      setChecked(false);
      setMismatchShown(false);
      setBusy(false);
      endAccountAction(id);
      if (!done) {
        // After the render that makes the fields available again.
        setRefocus((n) => n + 1);
      }
    }
  };

  let failureView: ReactNode = null;
  if (failure !== null) {
    failureView =
      failure.kind === "unknown" ? (
        <InlineAlert tone="critical">{t("password.unknown")}</InlineAlert>
      ) : failure.kind === "running" ? (
        <InlineAlert tone="neutral">
          {t("personDelete.blocked.running", {
            action: t(`users.action.${failure.action}`),
          })}
        </InlineAlert>
      ) : (
        <InlineAlert tone="critical" title={t("password.failed")}>
          {failure.kind === "server" ? (
            isRpcError(failure.error) ? (
              <ServerMessage label={t("app.serverMessage")}>
                {failure.error.message}
              </ServerMessage>
            ) : null
          ) : failure.kind === "gone" ? (
            <Trans i18nKey="person.gone" components={slot} />
          ) : (
            <span className="flex flex-col items-start gap-2">
              <span>
                <Trans i18nKey="person.changedElsewhere" components={slot} />
              </span>
              <Button
                variant="neutral"
                size="sm"
                onClick={() => {
                  close();
                  onShowCurrent();
                }}
              >
                {t("person.showCurrent")}
              </Button>
            </span>
          )}
        </InlineAlert>
      );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        {t("password.title")}
      </h2>
      <p className="max-w-prose text-sm">{t("password.intro")}</p>
      {self === "self" ? (
        <p className="text-sm">
          {t("password.self")}{" "}
          <Link to="/account/password" className={routerLinkClass}>
            {t("password.selfLink")}
          </Link>
        </p>
      ) : (
        <div>
          <Button
            ref={openRef}
            variant="neutral"
            onClick={() => {
              setSavedNote(false);
              setOpen(true);
            }}
          >
            {t("password.open")}
          </Button>
        </div>
      )}
      {savedNote ? (
        <p role="status" className="max-w-prose text-sm">
          {t("users.savedNote")}
        </p>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !busy) {
            close();
          }
        }}
        disablePointerDismissal
      >
        <DialogContent initialFocus={firstRef} finalFocus={openRef}>
          <DialogTitle className="[overflow-wrap:anywhere]">
            {t("password.dialog.title", { name: isolateName(name) })}
          </DialogTitle>
          <DialogDescription>
            <Trans i18nKey="password.dialog.body" components={slot} />
          </DialogDescription>
          {failureView}
          <form
            noValidate
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <NewPasswordFields
              password={{
                label: t("password.new"),
                hint: <Trans i18nKey="password.newHint" components={slot} />,
                error: firstError,
                value: password,
                onValueChange: (v) => {
                  setPassword(v);
                  setFailure(null);
                },
                inputRef: firstRef,
              }}
              confirmation={{
                label: t("password.again"),
                error: secondError,
                value: again,
                onValueChange: setAgain,
                onBlur: () => setMismatchShown(again !== ""),
              }}
              revealLabels={{
                show: t("password.show"),
                hide: t("password.hide"),
              }}
              notice={notice}
              disabled={busy}
            />
            <DialogFooter>
              <DialogClose
                disabled={busy}
                render={<Button variant="neutral" focusableWhenDisabled />}
              >
                {t("password.cancel")}
              </DialogClose>
              <Button type="submit" loading={busy}>
                {busy ? t("password.setting") : t("password.set")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
