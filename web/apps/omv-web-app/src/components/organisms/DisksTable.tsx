// SPDX-License-Identifier: GPL-3.0-or-later
// The Disks list's table (phase 5 disks design 1.3, 1.6): every disk, not paged, with its model and
// serial number, size, what it holds, its health from the session's check, and its power state as a
// word. No row is selectable and there is no row action: each disk's actions are on its page. The rows
// keep the device order unless the reader sorts by Disk or Size.
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  EmptyState,
  Identifier,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  TableStateRow,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DEVICE_ORDER,
  nextDiskSort,
  sortDisks,
  type DiskSort,
  type DiskSortField,
} from "../../disks/disksList.ts";
import type { DiskUseResult } from "../../disks/diskUse.ts";
import { degrees, powerWord } from "../../disks/diskWords.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import { DiskLink } from "../atoms/DiskLink.tsx";
import { DiskHealthStatus } from "../molecules/DiskHealthStatus.tsx";
import { DisksUseLines } from "../molecules/DisksUseLines.tsx";

const COLUMNS = 6;

interface Props {
  disks: readonly DiskDevice[] | undefined;
  uses: ReadonlyMap<string, DiskUseResult>;
  /** The use inputs are still being read. */
  usesLoading: boolean;
  /** DiskMgmt.getList failed and there is nothing to show. */
  error: unknown;
  failed: boolean;
  refreshing: boolean;
  onRetry: () => void;
}

function DiskRow({
  disk,
  use,
  usesLoading,
}: {
  disk: DiskDevice;
  use: DiskUseResult | undefined;
  usesLoading: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const check = useDiskCheck();
  const reading = check.reading(disk.canonicaldevicefile);
  const size = parseByteCount(disk.size);
  const temperature =
    degrees(reading?.temperature) ?? degrees(disk.temperature);
  const power = powerWord(disk.powermode);
  const model = disk.model.trim();
  return (
    <TableRow>
      <TableCell className="py-2 whitespace-nowrap">
        <DiskLink
          devicename={disk.devicename}
          device={disk.canonicaldevicefile}
        />
      </TableCell>
      <TableCell className="min-w-48 py-2">
        {model === "" ? (
          <span className="text-muted-foreground">{t("disks.noModel")}</span>
        ) : (
          <span dir="auto" className="break-words">
            {model}
          </span>
        )}
        {disk.serialnumber.trim() === "" ? null : (
          <span className="block text-xs text-muted-foreground">
            <Identifier>{disk.serialnumber}</Identifier>
          </span>
        )}
      </TableCell>
      <TableCell numeric className="py-2 whitespace-nowrap">
        {size === null ? "" : formatBytes(size)}
      </TableCell>
      <TableCell className="min-w-56 py-2">
        <DisksUseLines uses={use?.uses} loading={usesLoading} />
      </TableCell>
      <TableCell className="min-w-40 py-2">
        <span className="flex flex-col items-start gap-1">
          <DiskHealthStatus
            checked={check.result !== undefined}
            reading={reading}
          />
          {temperature === null ? null : (
            <span className="text-sm tabular-nums">
              {format.celsius(temperature)}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell className="py-2 whitespace-nowrap">
        {power === "unknown" ? (
          <span className="text-muted-foreground">
            {t("disks.power.unknown")}
          </span>
        ) : (
          t(`disks.power.${power}`)
        )}
      </TableCell>
    </TableRow>
  );
}

export function DisksTable({
  disks,
  uses,
  usesLoading,
  error,
  failed,
  refreshing,
  onRetry,
}: Props) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<DiskSort>(DEVICE_ORDER);
  const [announcement, setAnnouncement] = useState("");

  const sortBy = (field: DiskSortField, label: string) => {
    const next = nextDiskSort(sort, field);
    setSort(next);
    setAnnouncement(
      t("table.sorted", {
        column: label,
        direction: t(
          next.direction === "asc" ? "table.ascending" : "table.descending",
        ),
      }),
    );
  };
  const sortOf = (field: DiskSortField) =>
    sort.field === field
      ? sort.direction === "asc"
        ? "ascending"
        : "descending"
      : "none";

  const firstLoad = disks === undefined && !failed;
  let body;
  if (firstLoad) {
    body = <TableSkeletonRows rows={4} columns={COLUMNS} />;
  } else if (disks === undefined) {
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
          {t("disks.loadFailed")}
        </EmptyState>
      </TableStateRow>
    );
  } else if (disks.length === 0) {
    body = (
      <TableStateRow colSpan={COLUMNS}>
        <EmptyState>{t("disks.empty")}</EmptyState>
      </TableStateRow>
    );
  } else {
    body = sortDisks(disks, sort).map((disk) => (
      <DiskRow
        key={disk.devicefile || disk.canonicaldevicefile}
        disk={disk}
        use={uses.get(disk.devicename)}
        usesLoading={usesLoading}
      />
    ));
  }

  const showHeader = disks !== undefined && disks.length > 0;
  const diskLabel = t("disks.col.disk");
  const sizeLabel = t("disks.col.size");
  return (
    <div>
      <Table
        aria-label={t("disks.tableLabel")}
        frameLabel={t("disks.tableLabel")}
        busy={firstLoad || (refreshing && showHeader)}
        busyLabel={firstLoad ? t("disks.loading") : undefined}
      >
        {firstLoad || showHeader ? (
          <TableHeader>
            <TableRow>
              <TableHead
                sort={showHeader ? sortOf("disk") : undefined}
                onSort={() => sortBy("disk", diskLabel)}
              >
                {diskLabel}
              </TableHead>
              <TableHead>{t("disks.col.model")}</TableHead>
              <TableHead
                numeric
                sort={showHeader ? sortOf("size") : undefined}
                onSort={() => sortBy("size", sizeLabel)}
              >
                {sizeLabel}
              </TableHead>
              <TableHead>{t("disks.col.use")}</TableHead>
              <TableHead>{t("disks.col.health")}</TableHead>
              <TableHead>{t("disks.col.power")}</TableHead>
            </TableRow>
          </TableHeader>
        ) : null}
        <TableBody>{body}</TableBody>
      </Table>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
