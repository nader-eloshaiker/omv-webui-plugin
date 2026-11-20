// SPDX-License-Identifier: GPL-3.0-or-later
import { Button, ServerMessage } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { useSignOut } from "../../session/useSignOut.ts";
import { FormAlert } from "../molecules/FormAlert.tsx";

export function SignOutButton() {
  const { t } = useTranslation();
  const { signOut, pending, failure } = useSignOut();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="neutral"
        loading={pending}
        onClick={() => void signOut()}
      >
        {t("signOut.action")}
      </Button>
      {failure ? (
        <FormAlert tone="critical" title={t("signOut.failedTitle")}>
          <p>{t("signOut.failedBody")}</p>
          {failure.message ? (
            <ServerMessage label={t("app.serverMessage")}>
              {failure.message}
            </ServerMessage>
          ) : null}
        </FormAlert>
      ) : null}
    </div>
  );
}
