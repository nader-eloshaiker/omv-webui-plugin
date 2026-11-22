// SPDX-License-Identifier: GPL-3.0-or-later
// The ZFS list's table (phase 5 ZFS design 1.3, 1.7): one row per pool in the server's order unless the
// reader sorts by name or by how full it is; not paged, in its own named frame. Space for files comes
// from each pool's own folder, and the meter shows the pool row's `capacity` (D6, D7). A pool whose
// report could not be read is Unknown with "Not known" beside it; the other rows stay. No row selection
// and no row action: each pool's actions are on its page.
import type { ZfsObject } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  CapacityMeter,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  TableStateRow,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { naturalCompare } from "../../format/format.ts";
import { useNow } from "../../hooks/useNow.ts";
import type { PoolView } from "../../hooks/useZfsView.ts";
import { useZfsWords } from "../../hooks/useZfsWords.tsx";
import { routerLinkClass } from "../../shell/linkClass.ts";
import {
  fullLevel,
  hasPage,
  isFsRow,
  isVolumeRow,
  onPool,
} from "../../zfs/zfsModel.ts";
import { PoolLink } from "../atoms/PoolLink.tsx";
import { ZfsStateView } from "../molecules/ZfsStateView.tsx";

const COLUMNS = 6;

type SortField = "server" | "pool" | "space";

export function PoolSpace({
  view,
  compact,
}: {
  view: PoolView;
  compact: boolean;
}) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const level = fullLevel(view.row.capacity);
  const threshold =
    level === "ok"
      ? undefined
      : {
          status: level,
          label: t(`health.${level}`),
        };
  return (
    <div className="flex flex-col gap-1">
      <CapacityMeter
        label={t("zfs.col.space")}
        value={view.row.capacity ?? null}
        max={100}
        variant={compact ? "compact" : "default"}
        threshold={threshold}
        valueText={words.spaceText(view.root)}
      />
      {level === "ok" ? null : (
        <span className="text-sm">
          {level === "critical"
            ? t("zfsState.fullCritical")
            : t("zfsState.fullWarning")}
        </span>
      )}
    </div>
  );
}

function LastCheck({ view, now }: { view: PoolView; now: number }) {
  const { t } = useTranslation();
  const words = useZfsWords();
  if (view.reportRead === "loading") {
    return <Skeleton className="h-3 w-24" />;
  }
  const last = words.lastCheck(
    view.row,
    view.reportRead === "read" ? view.report : null,
    now,
  );
  return (
    <span className="flex flex-col gap-0.5">
      <span>{last.main}</span>
      {last.date === null ? null : (
        <span className="text-sm text-muted-foreground">{last.date}</span>
      )}
      {last.old ? (
        <span className="text-sm text-muted-foreground">
          {t("zfs.checkAdvice")}
        </span>
      ) : null}
    </span>
  );
}

function Counts({ rows, pool }: { rows: readonly ZfsObject[]; pool: string }) {
  const { t } = useTranslation();
  const on = onPool(rows, pool);
  const fileSystems = on.filter((r) => isFsRow(r) && r.poolroot !== true);
  const volumes = on.filter(isVolumeRow);
  return (
    <span className="flex flex-col gap-0.5">
      <span>{t("zfs.fsCount", { count: fileSystems.length })}</span>
      {volumes.length > 0 ? (
        <span>{t("zfs.volCount", { count: volumes.length })}</span>
      ) : null}
    </span>
  );
}

export function ZfsPoolsTable({
  views,
  rows,
  error,
  failed,
  refreshing,
  onRetry,
}: {
  views: readonly PoolView[] | undefined;
  rows: readonly ZfsObject[] | undefined;
  error: unknown;
  failed: boolean;
  refreshing: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const now = useNow(60_000);
  const [sort, setSort] = useState<{ field: SortField; asc: boolean }>({
    field: "server",
    asc: true,
  });
  const [announcement, setAnnouncement] = useState("");
  const sortBy = (field: SortField, label: string) => {
    const asc = !(sort.field === field && sort.asc);
    setSort({ field, asc });
    setAnnouncement(
      t("table.sorted", {
        column: label,
        direction: t(asc ? "table.ascending" : "table.descending"),
      }),
    );
  };
  const sortOf = (field: SortField) =>
    sort.field === field ? (sort.asc ? "ascending" : "descending") : "none";
  const sorted = (list: readonly PoolView[]) => {
    if (sort.field === "server") {
      return [...list];
    }
    const sign = sort.asc ? 1 : -1;
    return [...list].sort((a, b) =>
      sort.field === "pool"
        ? sign * naturalCompare(a.row.path, b.row.path)
        : sign * ((a.row.capacity ?? 0) - (b.row.capacity ?? 0)),
    );
  };

  const firstLoad = views === undefined && !failed;
  let body;
  if (firstLoad) {
    body = <TableSkeletonRows rows={2} columns={COLUMNS} />;
  } else if (views === undefined || rows === undefined) {
    body = (
      <TableStateRow colSpan={COLUMNS}>
        <EmptyState
          variant="error"
          serverMessage={
            isRpcError(error)
              ? { label: t("app.serverMessage"), text: error.message }
              : undefined
          }
          action={
            <Button variant="neutral" loading={refreshing} onClick={onRetry}>
              {t("common.tryAgain")}
            </Button>
          }
        >
          {t("zfs.loadFailed")}
        </EmptyState>
      </TableStateRow>
    );
  } else if (views.length === 0) {
    body = (
      <TableStateRow colSpan={COLUMNS}>
        <EmptyState
          action={
            <Link to="/storage/zfs/create" className={routerLinkClass}>
              {t("zfs.create")}
            </Link>
          }
        >
          <span className="block">{t("zfs.empty")}</span>
          <span className="mt-2 block text-sm text-muted-foreground">
            {t("zfs.emptyImport")}
          </span>
        </EmptyState>
      </TableStateRow>
    );
  } else {
    body = sorted(views).map((view) => {
      const layout =
        view.reportRead === "read"
          ? words.poolLayout(view.report)
          : view.reportRead === "failed"
            ? t("zfsLayout.unknown")
            : null;
      return (
        <TableRow key={view.row.path}>
          <TableCell className="min-w-32 py-2 max-sm:max-w-40">
            {/* A name stays on one line; at a phone's width a long one ends in an ellipsis (its
                full name is the link's accessible name). */}
            <span className="block max-w-36 truncate sm:max-w-none">
              <PoolLink pool={view.row.path} />
            </span>
            {hasPage(view.row) ? null : (
              <span className="block text-xs text-muted-foreground">
                {t("zfs.noPage")}
              </span>
            )}
            {/* Under the small breakpoint the columns after State are said here (1.8). */}
            <span className="mt-1 flex flex-col gap-1 text-sm sm:hidden">
              <span>{layout}</span>
              <PoolSpace view={view} compact />
              <LastCheck view={view} now={now} />
            </span>
          </TableCell>
          <TableCell className="py-2 sm:min-w-56">
            {view.reportRead === "loading" ? (
              <Skeleton className="h-5 w-20" />
            ) : (
              <ZfsStateView state={view.state} report={view.report} compact />
            )}
          </TableCell>
          <TableCell className="py-2 max-sm:hidden">
            {layout ?? <Skeleton className="h-3 w-24" />}
          </TableCell>
          <TableCell className="min-w-44 py-2 max-sm:hidden">
            <PoolSpace view={view} compact />
          </TableCell>
          <TableCell className="min-w-36 py-2 max-sm:hidden">
            <LastCheck view={view} now={now} />
          </TableCell>
          <TableCell className="py-2 max-sm:hidden">
            <Counts rows={rows} pool={view.row.path} />
          </TableCell>
        </TableRow>
      );
    });
  }

  const poolLabel = t("zfs.col.pool");
  const spaceLabel = t("zfs.col.space");
  const sortable = views !== undefined && views.length > 1;
  return (
    <div className="flex flex-col gap-2">
      <Table
        aria-label={t("zfs.tableLabel")}
        frameLabel={t("zfs.tableLabel")}
        busy={firstLoad || (refreshing && views !== undefined)}
        busyLabel={firstLoad ? t("zfs.loading") : undefined}
      >
        <TableHeader>
          <TableRow>
            <TableHead
              sort={sortable ? sortOf("pool") : undefined}
              onSort={() => sortBy("pool", poolLabel)}
            >
              {poolLabel}
            </TableHead>
            <TableHead>{t("zfs.col.state")}</TableHead>
            <TableHead className="max-sm:hidden">
              {t("zfs.col.layout")}
            </TableHead>
            <TableHead
              className="max-sm:hidden"
              sort={sortable ? sortOf("space") : undefined}
              onSort={() => sortBy("space", spaceLabel)}
            >
              {spaceLabel}
            </TableHead>
            <TableHead className="max-sm:hidden">
              {t("zfs.col.lastCheck")}
            </TableHead>
            <TableHead className="max-sm:hidden">
              {t("zfs.col.fileSystems")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{body}</TableBody>
      </Table>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
