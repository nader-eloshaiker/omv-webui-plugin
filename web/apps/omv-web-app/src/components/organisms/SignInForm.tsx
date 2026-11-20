// SPDX-License-Identifier: GPL-3.0-or-later
// User name and password (style guide 4.2: 40px controls on the sign-in form). Paste and password
// managers work (autocomplete, WCAG 3.3.8). The password leaves form state the moment it is sent, and
// the mutation keeps no copy once it settles (UI-6). A failed sign-in is never retried (UI-14).
import {
  useSessionLogin,
  type SessionLoginReply,
} from "@omv-webui/react-api-omv/generated";
import {
  Button,
  Field,
  FieldControl,
  FieldError,
  FieldLabel,
  InlineAlert,
} from "@omv-webui/react-ui-components";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SignInNotice } from "../../session/sessionStore.ts";
import {
  signInProblemOf,
  type SignInProblem,
} from "../../session/signInProblem.ts";
import { SignInProblemAlert } from "../molecules/SignInProblemAlert.tsx";

interface SignInFormProps {
  /** Why the form is showing, if there is something to say. */
  notice: SignInNotice | null;
  /** The server accepted the password: signed in, or a second factor is needed. */
  onReply: (reply: SessionLoginReply) => void;
}

const NOTICE_KEY = {
  ended: "signIn.endedNotice",
  signedOut: "signIn.signedOutNotice",
  challengeExpired: "signIn.challengeExpiredNotice",
} as const;

export function SignInForm({ notice, onReply }: SignInFormProps) {
  const { t } = useTranslation();
  const login = useSessionLogin({ mutation: { gcTime: 0 } });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [missing, setMissing] = useState({ username: false, password: false });
  const [problem, setProblem] = useState<SignInProblem | null>(null);
  const [rejections, setRejections] = useState(0);
  const [showNotice, setShowNotice] = useState(true);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (login.isPending) {
      return;
    }
    const secret = password;
    const nextMissing = {
      username: username.trim() === "",
      password: secret === "",
    };
    setMissing(nextMissing);
    if (nextMissing.username || nextMissing.password) {
      (nextMissing.username ? usernameRef : passwordRef).current?.focus();
      return;
    }
    setPassword("");
    setProblem(null);
    setShowNotice(false);
    try {
      onReply(
        await login.mutateAsync({ data: { username, password: secret } }),
      );
    } catch (error) {
      const next = signInProblemOf(error);
      setProblem(next);
      if (next.kind === "rejected") {
        setRejections((n) => n + 1);
      }
      passwordRef.current?.focus();
    } finally {
      login.reset();
    }
  };

  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-4"
      aria-labelledby="sign-in-title"
    >
      <div className="flex flex-col gap-1">
        <h1 id="sign-in-title" className="text-xl font-semibold">
          {t("signIn.title")}
        </h1>
        <p className="text-muted-foreground">{t("signIn.intro")}</p>
      </div>
      {notice && showNotice ? (
        <InlineAlert tone="neutral">{t(NOTICE_KEY[notice])}</InlineAlert>
      ) : null}
      {problem ? (
        <SignInProblemAlert problem={problem} step="password" />
      ) : null}
      {problem?.kind === "rejected" && rejections >= 2 ? (
        <InlineAlert tone="neutral" title={t("signIn.lockedTitle")}>
          {t("signIn.lockedBody")}
        </InlineAlert>
      ) : null}
      <Field invalid={missing.username || undefined}>
        <FieldLabel>{t("signIn.username")}</FieldLabel>
        <FieldControl
          ref={usernameRef}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-10"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            setMissing((m) => ({ ...m, username: false }));
          }}
        />
        {missing.username ? (
          <FieldError>{t("signIn.missingUsername")}</FieldError>
        ) : null}
      </Field>
      <Field invalid={missing.password || undefined}>
        <FieldLabel>{t("signIn.password")}</FieldLabel>
        <FieldControl
          ref={passwordRef}
          name="password"
          type="password"
          autoComplete="current-password"
          className="h-10"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setMissing((m) => ({ ...m, password: false }));
          }}
        />
        {missing.password ? (
          <FieldError>{t("signIn.missingPassword")}</FieldError>
        ) : null}
      </Field>
      <Button
        type="submit"
        size="lg"
        loading={login.isPending}
        className="w-full"
      >
        {t("signIn.submit")}
      </Button>
    </form>
  );
}
