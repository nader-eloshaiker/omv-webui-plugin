// SPDX-License-Identifier: GPL-3.0-or-later
// The router's error state: a plain sentence, the backend's message as text when the failure was the
// backend's (UI-9; nothing else from an error is shown), and two ways on.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { Button, ServerMessage } from "@omv-webui/react-ui-components";
import {
  Link,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageTitle } from "../atoms/PageTitle.tsx";

export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageTitle>{t("routeError.title")}</PageTitle>
      <p>{t("routeError.body")}</p>
      {isRpcError(error) ? (
        <ServerMessage label={t("app.serverMessage")}>
          {error.message}
        </ServerMessage>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="neutral"
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          {t("routeError.retry")}
        </Button>
        <Link to="/" className="text-link underline">
          {t("routeError.home")}
        </Link>
      </div>
    </div>
  );
}
