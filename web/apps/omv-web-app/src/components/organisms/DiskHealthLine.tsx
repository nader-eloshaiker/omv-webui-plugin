// SPDX-License-Identifier: GPL-3.0-or-later
// The health line above the Disks list and on the Disk health Overview (phase 5 disks design 1.4): the
// session's one disk-health check, read only on the reader's press, because it wakes any sleeping
// disk; the sentence saying so comes before the button. The button keeps its place, so focus stays on
// it while it turns into "Checking…" and then "Check again".
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  InlineAlert,
  ServerMessage,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../format/useFormat.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import { useDiskRollUp } from "../../hooks/useDiskRollUp.ts";

export function DiskHealthLine() {
  const { t } = useTranslation();
  const format = useFormat();
  const check = useDiskCheck();
  const rollUpOf = useDiskRollUp();
  // A check that ends while the line is on screen is announced; one that ended before is not.
  const [openedAt] = useState(Date.now);
  const result = check.result;
  const summary = result ? rollUpOf(result.list.data) : null;

  let announcement = "";
  if (check.checking) {
    announcement = t("diskCheck.checkingLine");
  } else if (result && result.readAt >= openedAt && !check.failed && summary) {
    announcement = t("diskCheck.announce", { summary: summary.text });
  }

  return (
    <section
      aria-label={t("disks.col.health")}
      className="flex flex-col gap-pair"
    >
      {check.failed ? (
        <InlineAlert tone="critical" title={t("diskCheck.failed")}>
          {isRpcError(check.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {check.error.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {result && summary ? (
          <p className="flex flex-wrap items-center gap-2">
            <StatusPill status={summary.status}>
              {t(`health.${summary.status}`)}
            </StatusPill>
            <span>{summary.text}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("disks.health.checkedAt", {
                time: format.clock(result.readAt),
              })}
            </span>
          </p>
        ) : result ? (
          <p className="text-sm">
            {t("disks.health.checkedAt", { time: format.clock(result.readAt) })}
          </p>
        ) : (
          <p className="max-w-prose">{t("disks.health.intro")}</p>
        )}
        <Button
          variant="neutral"
          size={result ? "sm" : "md"}
          loading={check.checking}
          onClick={check.checking ? undefined : check.start}
        >
          {check.checking
            ? t("diskCheck.checking")
            : result
              ? t("diskCheck.checkAgain")
              : check.failed
                ? t("common.tryAgain")
                : t("diskCheck.check")}
        </Button>
      </div>
      <p role="status" className="text-sm empty:hidden">
        {announcement}
      </p>
    </section>
  );
}
