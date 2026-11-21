// SPDX-License-Identifier: GPL-3.0-or-later
// A dashboard card's own stale line (phase 5 design 1.9.2): its background read failed, so its last
// items stay and this line says since when, with a "Try again" for that card only. Announced politely
// once, when it appears; nothing while the card is current.
import { Button } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../format/useFormat.ts";

export function CardStaleLine({
  stale,
  updatedAt,
  retrying,
  onRetry,
}: {
  stale: boolean;
  /** When the last good reply arrived, on this computer's clock. */
  updatedAt: number;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums empty:hidden">
      <p role="status" className="empty:hidden">
        {stale
          ? t("dashboard.cardStale", { time: format.clock(updatedAt) })
          : ""}
      </p>
      {stale ? (
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
