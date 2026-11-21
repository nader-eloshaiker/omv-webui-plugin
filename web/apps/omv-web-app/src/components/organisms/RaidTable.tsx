// SPDX-License-Identifier: GPL-3.0-or-later
// The RAID list's table (phase 5 RAID design 1.3, 1.7): one row per array in the server's order unless
// the reader sorts by name or size; not paged, in its own named frame. The disks column counts from each
// array's report (the VM showed that `devices` lists failed members and spares too), and says only
// "2 disks" when the report could not be read. No row selection and no row action: each array's
// actions are on its page.
import type {
  ConfiguredFilesystem,
  DiskDevice,
  MdArray,
} from "@omv-webui/react-api-omv/generated";
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
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { belongsTo, diskNames } from "../../disks/diskUse.ts";
import { fsAddress, fsName } from "../../filesystems/fsModel.ts";
import { naturalCompare, parseByteCount } from "../../format/format.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { useRaidWords } from "../../hooks/useRaidWords.tsx";
import type { ArrayState, ArrayUsedBy, Report } from "../../raid/raidModel.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { ArrayLink } from "../atoms/ArrayLink.tsx";
import { DiskLink } from "../atoms/DiskLink.tsx";
import { RaidStateView } from "../molecules/RaidStateView.tsx";

const COLUMNS = 6;

export interface RaidRowView {
  row: MdArray;
  state: ArrayState;
  report: Report | null;
  used: ArrayUsedBy;
}

type SortField = "server" | "array" | "size";

function UsedByCell({ used }: { used: ArrayUsedBy }) {
  const { t } = useTranslation();
  const words = useFsWords();
  if (used.kind !== "known") {
    return (
      <span className="text-muted-foreground">
        {used.kind === "loading" ? "" : t("raid.usedBy.unknown")}
      </span>
    );
  }
  const linkOf = (fs: ConfiguredFilesystem) => {
    const address = fsAddress(fs);
    const name = words.nameText(fs);
    return address === null ? (
      <span dir="auto">{name}</span>
    ) : (
      <Link
        to="/storage/filesystems/$fs"
        params={{ fs: address }}
        aria-label={t("filesystems.open", { name })}
        className={routerLinkClass}
      >
        <span dir="auto">{words.nameOf(fsName(fs))}</span>
      </Link>
    );
  };
  if (used.configured.length > 0) {
    return (
      <ul className="flex flex-col gap-0.5">
        {used.configured.map((fs) => (
          <li key={`${fs.uuid}:${fs.devicefile}`}>{linkOf(fs)}</li>
        ))}
      </ul>
    );
  }
  if (used.other || used.creating) {
    return <>{t("raid.usedBy.other")}</>;
  }
  return <>{t("raid.usedBy.none")}</>;
}

function MemberDisks({
  devices,
  disks,
}: {
  devices: readonly string[];
  disks: readonly DiskDevice[] | undefined;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {devices.map((device) => {
        const disk = disks?.find((d) => belongsTo(device, diskNames(d)));
        return (
          <li key={device} className="whitespace-nowrap">
            {disk !== undefined && device === disk.canonicaldevicefile ? (
              <DiskLink
                devicename={disk.devicename}
                device={disk.canonicaldevicefile}
              />
            ) : (
              <Identifier>{device}</Identifier>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function RaidTable({
  rows,
  disks,
  error,
  failed,
  refreshing,
  onRetry,
}: {
  rows: readonly RaidRowView[] | undefined;
  disks: readonly DiskDevice[] | undefined;
  error: unknown;
  failed: boolean;
  refreshing: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const words = useRaidWords();
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
  const sorted = (list: readonly RaidRowView[]) => {
    if (sort.field === "server") {
      return [...list];
    }
    const sign = sort.asc ? 1 : -1;
    return [...list].sort((a, b) =>
      sort.field === "array"
        ? sign * naturalCompare(a.row.devicefile, b.row.devicefile)
        : sign *
          ((parseByteCount(a.row.size) ?? 0) -
            (parseByteCount(b.row.size) ?? 0)),
    );
  };

  const firstLoad = rows === undefined && !failed;
  let body;
  if (firstLoad) {
    body = <TableSkeletonRows rows={2} columns={COLUMNS} />;
  } else if (rows === undefined) {
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
          {t("raid.loadFailed")}
        </EmptyState>
      </TableStateRow>
    );
  } else if (rows.length === 0) {
    body = (
      <TableStateRow colSpan={COLUMNS}>
        <EmptyState
          action={
            <Link to="/storage/md/create" className={routerLinkClass}>
              {t("raid.create")}
            </Link>
          }
        >
          {t("raid.empty")}
        </EmptyState>
      </TableStateRow>
    );
  } else {
    body = sorted(rows).map(({ row, state, report, used }) => (
      <TableRow key={`${row.uuid}:${row.devicefile}`}>
        <TableCell className="min-w-36 py-2">
          <span className="whitespace-nowrap">
            <ArrayLink devicefile={row.devicefile} />
          </span>
          {/^\/dev\/md[0-9]{1,3}$/.test(row.devicefile) ? null : (
            <span className="block text-xs text-muted-foreground">
              {t("raid.noPage")}
            </span>
          )}
        </TableCell>
        <TableCell className="min-w-56 py-2">
          <RaidStateView row={row} state={state} compact />
        </TableCell>
        <TableCell className="py-2">{words.levelWord(row.level)}</TableCell>
        <TableCell className="py-2 text-end whitespace-nowrap tabular-nums">
          {words.sizeText(row.size)}
        </TableCell>
        <TableCell className="min-w-40 py-2">
          <span className="block">{words.disksText(row, report)}</span>
          <MemberDisks devices={row.devices} disks={disks} />
        </TableCell>
        <TableCell className="min-w-32 py-2">
          <UsedByCell used={used} />
        </TableCell>
      </TableRow>
    ));
  }

  const arrayLabel = t("raid.col.array");
  const sizeLabel = t("raid.col.size");
  const sortable = rows !== undefined && rows.length > 1;
  return (
    <div className="flex flex-col gap-2">
      <Table
        aria-label={t("raid.tableLabel")}
        frameLabel={t("raid.tableLabel")}
        busy={firstLoad || (refreshing && rows !== undefined)}
        busyLabel={firstLoad ? t("raid.loading") : undefined}
      >
        <TableHeader>
          <TableRow>
            <TableHead
              sort={sortable ? sortOf("array") : undefined}
              onSort={() => sortBy("array", arrayLabel)}
            >
              {arrayLabel}
            </TableHead>
            <TableHead>{t("raid.col.state")}</TableHead>
            <TableHead>{t("raid.col.level")}</TableHead>
            <TableHead
              className="text-end"
              sort={sortable ? sortOf("size") : undefined}
              onSort={() => sortBy("size", sizeLabel)}
            >
              {sizeLabel}
            </TableHead>
            <TableHead>{t("raid.col.disks")}</TableHead>
            <TableHead>{t("raid.col.usedBy")}</TableHead>
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
