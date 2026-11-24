// SPDX-License-Identifier: GPL-3.0-or-later
// A read about one interface failed (phase 5 network design 4.3): our sentence naming the interface
// (isolated, any bidirectional control shown), the backend's message as text and nothing else from
// the error (UI-9), and "Try again", a foreground read.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  EmptyState,
  IsolatedIdentifier,
} from "@omv-webui/react-ui-components";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";

export function IfaceReadFailed({
  sentence,
  iface,
  error,
  onRetry,
  retrying = false,
}: {
  sentence: "iface.loadNowFailed" | "iface.loadSettingsFailed";
  iface: string;
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      variant="error"
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
      <Trans
        i18nKey={sentence}
        components={{ iface: <IsolatedIdentifier value={inertBidi(iface)} /> }}
      />
    </EmptyState>
  );
}
