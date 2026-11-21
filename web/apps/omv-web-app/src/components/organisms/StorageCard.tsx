// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's Storage card (phase 5 design 1.2): every mounted file system, the system drive
// included, worst first, with its meter and the administrator's own warning level. A file system below
// its level is not claimed as OK (with level 0 nothing is monitored). File systems that are set up but
// whose disk is gone come from a second read (FileSystemMgmt.getList, once per visit, D3); if that read
// fails, the card shows what it has. At most six items show before "Show all" (D16).
import {
  CapacityMeter,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  EmptyState,
  HealthListItem,
  rollUp,
  Skeleton,
  StatusPill,
  type RollUpStatus,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  STORAGE_VISIBLE,
  type FsState,
  type StorageItem,
} from "../../dashboard/dashboard.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { FileSystemName } from "../atoms/FileSystemName.tsx";
import { CardStaleLine } from "../molecules/CardStaleLine.tsx";
import { DashboardCard } from "../molecules/DashboardCard.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";

const ROLL_UP: Record<FsState, RollUpStatus> = {
  critical: "critical",
  warning: "warning",
  unknown: "unknown",
  below: "ok",
};

/** The name, a router link to the file system's page when it has one (file-systems design 9). */
function ItemName({ item }: { item: StorageItem }) {
  if (item.address === null) {
    return <FileSystemName name={item.name} />;
  }
  return (
    <Link
      to="/storage/filesystems/$fs"
      params={{ fs: item.address }}
      className={routerLinkClass}
    >
      <FileSystemName name={item.name} />
    </Link>
  );
}

function MountedItem({
  item,
}: {
  item: Extract<StorageItem, { kind: "mounted" }>;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const { fs, state } = item;
  const size = parseByteCount(fs.size);
  const free = parseByteCount(fs.available);
  const noReading = state === "unknown" || size === null || free === null;
  const root = item.name.kind === "systemDrive";
  const threshold =
    state === "critical" || state === "warning"
      ? { status: state, label: t(`health.${state}`) }
      : undefined;
  return (
    <li className="flex flex-col gap-1">
      {noReading ? (
        <CapacityMeter
          label={
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <ItemName item={item} />
              </span>
              <StatusPill status="unknown">{t("health.unknown")}</StatusPill>
            </span>
          }
          value={null}
          max={100}
          valueText={t("filesystem.usage.unread")}
        />
      ) : (
        <CapacityMeter
          label={<ItemName item={item} />}
          value={fs.percentage}
          max={100}
          threshold={threshold}
          valueText={t("dashboard.storage.value", {
            percent: format.percent(fs.percentage),
            free: formatBytes(free),
            size: formatBytes(size),
          })}
        />
      )}
      {root ? (
        <p className="text-sm text-muted-foreground">
          {t("dashboard.storage.systemDriveHint")}
        </p>
      ) : fs.comment.trim() !== "" ? (
        <p
          dir="auto"
          className="line-clamp-2 text-sm break-words text-muted-foreground"
        >
          {fs.comment}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground tabular-nums">
        {fs.usagewarnthreshold > 0
          ? t("dashboard.storage.warnsAt", {
              threshold: `${String(fs.usagewarnthreshold)}%`,
            })
          : t("dashboard.storage.noLevel")}
      </p>
    </li>
  );
}

function Item({ item }: { item: StorageItem }) {
  const { t } = useTranslation();
  if (item.kind === "missing") {
    return (
      <HealthListItem
        className="py-0"
        status="critical"
        statusLabel={t("health.critical")}
        name={<ItemName item={item} />}
        nameVariant={item.name.kind === "device" ? "identifier" : "text"}
        reason={t("filesystem.reason.missing")}
      />
    );
  }
  return <MountedItem item={item} />;
}

export function StorageCard({
  items,
  loading,
  error,
  stale,
  updatedAt,
  retrying,
  onRetry,
}: {
  /** The card's items, worst first; undefined until the first read. */
  items: readonly StorageItem[] | undefined;
  loading: boolean;
  /** Set when the first read failed and there is nothing to show. */
  error: unknown;
  stale: boolean;
  updatedAt: number;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const link = (
    <Link to="/storage/filesystems" className={routerLinkClass}>
      {t("dashboard.storage.link")}
    </Link>
  );

  let content;
  if (items === undefined && loading) {
    content = (
      <>
        {[0, 1].map((i) => (
          <CapacityMeter
            key={i}
            loading
            label={<Skeleton className="w-28" />}
            value={null}
            max={100}
            valueText={t("app.loading")}
          />
        ))}
      </>
    );
  } else if (items === undefined) {
    content = (
      <ReadFailed
        error={error}
        onRetry={onRetry}
        retrying={retrying}
        className="py-4"
      >
        {t("dashboard.storage.loadFailed")}
      </ReadFailed>
    );
  } else if (items.length === 0) {
    content = (
      <EmptyState
        className="py-4"
        action={
          <Link to="/storage/filesystems/add" className={routerLinkClass}>
            {t("dashboard.storage.emptyLink")}
          </Link>
        }
      >
        {t("dashboard.storage.empty")}
      </EmptyState>
    );
  } else {
    const summary = rollUp(
      items.map((i) => (i.kind === "missing" ? "critical" : ROLL_UP[i.state])),
    );
    const worst = summary.status;
    const first = items.slice(0, STORAGE_VISIBLE);
    const rest = items.slice(STORAGE_VISIBLE);
    content = (
      <>
        {worst === "critical" || worst === "warning" ? (
          <p className="flex flex-wrap items-center gap-2">
            <StatusPill status={worst}>{t(`health.${worst}`)}</StatusPill>
            <span>
              {t("dashboard.storage.rollUp", {
                count: summary.count,
                total: summary.total,
                status: t(`health.${worst}`),
              })}
            </span>
          </p>
        ) : null}
        <ul className="flex flex-col gap-4">
          {first.map((item) => (
            <Item key={item.key} item={item} />
          ))}
        </ul>
        {rest.length > 0 ? (
          <Disclosure open={showAll} onOpenChange={setShowAll}>
            <DisclosurePanel keepMounted={false}>
              <ul className="flex flex-col gap-4">
                {rest.map((item) => (
                  <Item key={item.key} item={item} />
                ))}
              </ul>
            </DisclosurePanel>
            <DisclosureTrigger variant="inline">
              {showAll
                ? t("dashboard.storage.showFewer")
                : t("dashboard.storage.showAll", { count: items.length })}
            </DisclosureTrigger>
          </Disclosure>
        ) : null}
        <CardStaleLine
          stale={stale}
          updatedAt={updatedAt}
          retrying={retrying}
          onRetry={onRetry}
        />
      </>
    );
  }

  return (
    <DashboardCard
      title={t("dashboard.storage.title")}
      busy={items === undefined && loading}
      busyLabel={t("dashboard.storage.loading")}
      footer={link}
    >
      {content}
    </DashboardCard>
  );
}
