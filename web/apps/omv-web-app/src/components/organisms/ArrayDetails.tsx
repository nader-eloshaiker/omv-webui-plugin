// SPDX-License-Identifier: GPL-3.0-or-later
// An array's technical details (phase 5 RAID design 2.7): mdadm's report, already read for the roles,
// shown on request as text on the terminal pair, with a copy button. The host part of the array's name
// is taken out before it is shown or copied (never shown, journal 2026-11-21); the report stays in the
// session's memory only (UI-13).
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  InlineAlert,
  ServerMessage,
  TaskLog,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { taskLines } from "../../filesystems/terminal.ts";
import { withoutHost } from "../../raid/raidModel.ts";

export function ArrayDetails({
  device,
  detail,
  failed,
  error,
  retrying,
  onRetry,
}: {
  device: string;
  detail: string | null;
  failed: boolean;
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-labelledby="array-details"
      className="flex min-w-0 flex-col gap-2"
    >
      <h2 id="array-details" className="text-lg font-semibold">
        {t("array.details.title")}
      </h2>
      <p className="max-w-prose">{t("array.details.intro")}</p>
      {failed ? (
        <InlineAlert tone="critical" title={t("array.details.failed")}>
          {isRpcError(error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {error.message}
            </ServerMessage>
          ) : null}
          <p>
            <Button
              variant="neutral"
              size="sm"
              loading={retrying}
              onClick={onRetry}
            >
              {t("common.tryAgain")}
            </Button>
          </p>
        </InlineAlert>
      ) : (
        <Disclosure open={open} onOpenChange={setOpen}>
          <DisclosureTrigger>
            {open ? t("array.details.hide") : t("array.details.show")}
          </DisclosureTrigger>
          <DisclosurePanel>
            <TaskLog
              lines={taskLines(withoutHost(detail ?? ""))}
              label={t("array.details.label", { device })}
              copyLabel={t("array.details.copy")}
              copiedLabel={t("tasks.copied")}
              selectedLabel={t("tasks.selected")}
              size="page"
              wrap={false}
            />
          </DisclosurePanel>
        </Disclosure>
      )}
    </section>
  );
}
