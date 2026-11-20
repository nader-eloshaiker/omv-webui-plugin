// SPDX-License-Identifier: GPL-3.0-or-later
// When the dashboard's figures were last read (phase 3 design 1.5). After a failed background poll the
// last values stay and this line says so, with a "Try again" the reader may press. Only the failure is
// announced, once, when it first appears: the normal line changes on every poll and is not a live
// region.
import { Button } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../format/useFormat.ts";

export function FreshnessLine({
  updatedAt,
  failed,
  retrying,
  onRetry,
}: {
  /** When the last good reply arrived, on this computer's clock. */
  updatedAt: number;
  /** The last background read failed. */
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const time = format.clock(updatedAt);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
      {failed ? null : <p>{t("dashboard.fresh", { time })}</p>}
      <p role="status" className="empty:hidden">
        {failed ? t("dashboard.stale", { time }) : ""}
      </p>
      {failed ? (
        <Button
          variant="neutral"
          size="sm"
          loading={retrying}
          onClick={onRetry}
        >
          {t("common.tryAgain")}
        </Button>
      ) : null}
    </div>
  );
}
