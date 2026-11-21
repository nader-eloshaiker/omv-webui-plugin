// SPDX-License-Identifier: GPL-3.0-or-later
// A file system's state and how full it is (phase 5 file-systems design 0.2, D3): two facts, each in
// words. OK means mounted and reachable. A pending mount is the pending mark with its words, not a
// health pill; one being created is the task pill "Running", not pending yellow. How full is the
// dashboard's rule: a Warning or Critical pill beside the figure when the level is crossed or it is
// full, Unknown when it could not be read, and no pill otherwise.
import type { ConfiguredFilesystem } from "@omv-webui/react-api-omv/generated";
import { CapacityMeter, StatusPill } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import type { FsMountState, FsUsage } from "../../filesystems/fsModel.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";

export function FsStateView({
  state,
  className,
}: {
  state: FsMountState;
  className?: string;
}) {
  const { t } = useTranslation();
  let pill;
  let reason: string | null = null;
  switch (state) {
    case "ok":
      pill = <StatusPill status="ok">{t("health.ok")}</StatusPill>;
      break;
    case "setUpPending":
      pill = <StatusPill status="pending">{t("pending.itemMark")}</StatusPill>;
      reason = t("filesystem.state.setUpPending");
      break;
    case "notMounted":
      pill = <StatusPill status="critical">{t("health.critical")}</StatusPill>;
      reason = t("filesystem.state.notMounted");
      break;
    case "creating":
      pill = <StatusPill status="running">{t("tasks.running")}</StatusPill>;
      reason = t("filesystem.state.creating");
      break;
    case "missing":
      pill = <StatusPill status="critical">{t("health.critical")}</StatusPill>;
      reason = t("filesystem.reason.missing");
      break;
  }
  return (
    <span className={className ?? "flex flex-col items-start gap-1"}>
      {pill}
      {reason === null ? null : <span className="text-sm">{reason}</span>}
    </span>
  );
}

/** The usage meter, compact in a table row or full size on a file system's page. */
export function FsUsageView({
  row,
  usage,
  label,
  variant = "compact",
}: {
  row: Pick<
    ConfiguredFilesystem,
    "percentage" | "available" | "size" | "usagewarnthreshold"
  >;
  usage: FsUsage;
  /** What the meter measures, for assistive technology: the file system's name. */
  label: string;
  variant?: "compact" | "default";
}) {
  const { t } = useTranslation();
  const format = useFormat();
  if (usage === "none") {
    return (
      <span className="text-muted-foreground">
        {t("filesystems.noReading")}
      </span>
    );
  }
  const size = parseByteCount(row.size);
  const free = parseByteCount(row.available);
  if (usage === "unknown" || size === null || free === null) {
    return (
      <span className="flex flex-col items-start gap-1">
        <StatusPill status="unknown">{t("health.unknown")}</StatusPill>
        <span className="text-sm">{t("filesystem.usage.unread")}</span>
      </span>
    );
  }
  const level = row.usagewarnthreshold ?? 0;
  const threshold =
    usage === "critical"
      ? { status: "critical" as const, label: t("health.critical") }
      : usage === "warning"
        ? { status: "warning" as const, label: t("health.warning") }
        : undefined;
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <CapacityMeter
        variant={variant}
        label={label}
        value={row.percentage}
        max={100}
        threshold={threshold}
        valueText={t("dashboard.storage.value", {
          percent: format.percent(row.percentage),
          free: formatBytes(free),
          size: formatBytes(size),
        })}
      />
      {usage === "critical" ? (
        <span className="text-sm">{t("filesystem.usage.full")}</span>
      ) : usage === "warning" ? (
        <span className="text-sm">
          {t("filesystem.usage.overLevel", { level: `${String(level)}%` })}
        </span>
      ) : null}
    </span>
  );
}
