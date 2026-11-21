// SPDX-License-Identifier: GPL-3.0-or-later
// A read that failed with nothing to show (phase 3 design 0.3): our sentence, the backend's message as
// text and nothing else from the error (UI-9), and "Try again", a foreground read.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { Button, EmptyState } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";

export function ReadFailed({
  error,
  onRetry,
  retrying = false,
  children,
  className,
}: {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  /** What could not be read: "Could not read the file systems." */
  children: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      variant="error"
      className={className}
      serverMessage={
        isRpcError(error)
          ? { label: t("app.serverMessage"), text: error.message }
          : undefined
      }
      action={
        <Button variant="neutral" loading={retrying} onClick={onRetry}>
          {t("common.tryAgain")}
        </Button>
      }
    >
      {children}
    </EmptyState>
  );
}
