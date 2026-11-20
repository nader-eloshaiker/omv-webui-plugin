// SPDX-License-Identifier: GPL-3.0-or-later
// Why a sign-in step failed: the page's own plain words for what to do first, then the backend's
// message as text in the library's ServerMessage (UI-9). "Too many attempts" says to wait; nothing
// retries by itself (UI-14).
import { ServerMessage } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import type { SignInProblem } from "../../session/signInProblem.ts";
import { FormAlert } from "./FormAlert.tsx";

export function SignInProblemAlert({
  problem,
  step,
}: {
  problem: SignInProblem;
  step: "password" | "code";
}) {
  const { t } = useTranslation();
  const code = step === "code";
  let title: string;
  let body: string;
  switch (problem.kind) {
    case "tooManyAttempts":
      title = t(
        code ? "totp.tooManyAttemptsTitle" : "signIn.tooManyAttemptsTitle",
      );
      body = t(
        code ? "totp.tooManyAttemptsBody" : "signIn.tooManyAttemptsBody",
      );
      break;
    case "unreachable":
      title = t("signIn.unreachableTitle");
      body = t("signIn.unreachableBody");
      break;
    default:
      title = t(code ? "totp.failedTitle" : "signIn.failedTitle");
      body = t(code ? "totp.rejectedBody" : "signIn.rejectedBody");
  }
  return (
    <FormAlert tone="critical" title={title}>
      <p>{body}</p>
      <ServerMessage label={t("app.serverMessage")}>
        {problem.message}
      </ServerMessage>
    </FormAlert>
  );
}
