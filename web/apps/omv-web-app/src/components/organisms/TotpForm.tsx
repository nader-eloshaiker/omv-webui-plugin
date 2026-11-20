// SPDX-License-Identifier: GPL-3.0-or-later
// The code step of a `totp` challenge (A10). Nothing is sent while it shows except the code itself:
// any other call would make OMV discard the pending login. The code may be pasted, with or without
// spaces, and leaves form state the moment it is sent (UI-6).
import {
  useSessionVerify,
  type SessionAuthenticated,
} from "@omv-webui/react-api-omv/generated";
import {
  Button,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
} from "@omv-webui/react-ui-components";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { codeOf } from "../../session/oneTimeCode.ts";
import {
  signInProblemOf,
  type SignInProblem,
} from "../../session/signInProblem.ts";
import { SignInProblemAlert } from "../molecules/SignInProblemAlert.tsx";

interface TotpFormProps {
  username: string;
  onAuthenticated: (reply: SessionAuthenticated) => void;
  /** The server no longer holds the pending login (401). */
  onExpired: () => void;
  /** Back to the user name and password, with no call. */
  onCancel: () => void;
}

export function TotpForm({
  username,
  onAuthenticated,
  onExpired,
  onCancel,
}: TotpFormProps) {
  const { t } = useTranslation();
  const verify = useSessionVerify({ mutation: { gcTime: 0 } });
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [problem, setProblem] = useState<SignInProblem | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (verify.isPending) {
      return;
    }
    const digits = codeOf(code);
    if (digits === null) {
      setInvalid(true);
      codeRef.current?.focus();
      return;
    }
    setCode("");
    setProblem(null);
    try {
      onAuthenticated(await verify.mutateAsync({ data: { code: digits } }));
    } catch (error) {
      const next = signInProblemOf(error);
      if (next.kind === "expired") {
        onExpired();
        return;
      }
      setProblem(next);
      codeRef.current?.focus();
    } finally {
      verify.reset();
    }
  };

  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-4"
      aria-labelledby="totp-title"
    >
      <div className="flex flex-col gap-1">
        <h1 id="totp-title" className="text-xl font-semibold">
          {t("totp.title")}
        </h1>
        <p className="text-muted-foreground">{t("totp.intro", { username })}</p>
      </div>
      {problem ? <SignInProblemAlert problem={problem} step="code" /> : null}
      <Field invalid={invalid || undefined}>
        <FieldLabel>{t("totp.code")}</FieldLabel>
        <FieldControl
          ref={codeRef}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-10 font-mono tracking-widest"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setInvalid(false);
          }}
        />
        <FieldHint>{t("totp.hint")}</FieldHint>
        {invalid ? <FieldError>{t("totp.invalid")}</FieldError> : null}
      </Field>
      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          size="lg"
          loading={verify.isPending}
          className="w-full"
        >
          {t("totp.submit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full"
          disabled={verify.isPending}
          onClick={onCancel}
        >
          {t("totp.cancel")}
        </Button>
      </div>
    </form>
  );
}
