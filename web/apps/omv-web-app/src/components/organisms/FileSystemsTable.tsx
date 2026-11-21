// SPDX-License-Identifier: GPL-3.0-or-later
// The File systems list's table (phase 5 file-systems design 1.3, 1.7): the system drive first, then
// every file system OMV has set up or is creating, in the server's order unless the reader sorts by
// name or usage. Not paged; it scrolls in its own named frame. No row selection and no row action:
// each file system's actions are on its page.
import type {
  ConfiguredFilesystem,
  DiskDevice,
  MountedFilesystem,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  EmptyState,
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
import { fileSystemState } from "../../dashboard/dashboard.ts";
import { belongsTo } from "../../disks/diskUse.ts";
import {
  flowStore,
  isActive,
  targetDevice,
} from "../../filesystems/flowRun.ts";
import {
  fsAddress,
  fsName,
  fsState,
  fsUsage,
  isZfs,
  splitTags,
  zfsPool,
} from "../../filesystems/fsModel.ts";
import { naturalCompare } from "../../format/format.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { FsNameView, FsTypeView } from "../atoms/FsNameView.tsx";
import { FsOnDisks } from "../molecules/FsOnDisks.tsx";
import { FsStateView, FsUsageView } from "../molecules/FsStatus.tsx";

const COLUMNS = 6;

type SortField = "device" | "name" | "usage";
interface Sort {
  field: SortField;
  direction: "asc" | "desc";
}

function SystemRow({
  fs,
  disks,
}: {
  fs: MountedFilesystem;
  disks: readonly DiskDevice[] | undefined;
}) {
  const { t } = useTranslation();
  const usage = fileSystemState(fs);
  return (
    <TableRow>
      <TableCell className="min-w-48 py-2">
        <span className="font-medium">{t("filesystems.system.name")}</span>
        <span className="block text-xs text-muted-foreground">
          {t("filesystems.system.line")}
        </span>
      </TableCell>
      <TableCell className="min-w-40 py-2">
        <FsStateView state="ok" />
      </TableCell>
      <TableCell className="min-w-56 py-2">
        <FsUsageView
          row={fs}
          usage={usage}
          label={t("filesystems.system.name")}
        />
      </TableCell>
      <TableCell className="py-2 whitespace-nowrap">
        <FsTypeView type={fs.type} />
      </TableCell>
      <TableCell className="py-2">
        <FsOnDisks
          fs={{
            parentdevicefile: fs.parentdevicefile ?? "",
            canonicaldevicefile: fs.canonicaldevicefile,
            devicefiles: fs.devicefiles ?? [],
            hasmultipledevices: fs.hasmultipledevices,
          }}
          disks={disks}
        />
      </TableCell>
      <TableCell className="py-2">{t("filesystems.usedBy.yes")}</TableCell>
    </TableRow>
  );
}

function FsRow({
  fs,
  pending,
  disks,
}: {
  fs: ConfiguredFilesystem;
  pending: readonly string[];
  disks: readonly DiskDevice[] | undefined;
}) {
  const { t } = useTranslation();
  const words = useFsWords();
  const { run } = useMemoryStore(flowStore);
  const state = fsState(fs, pending);
  const usage = fsUsage(fs);
  const address = fsAddress(fs);
  const name = fsName(fs);
  const nameText = words.nameOf(name);
  const tags = splitTags(fs.comment);
  // "Show progress": this session's running Flow A creates on this row's disk (1.3.1).
  const progress =
    state === "creating" &&
    run !== null &&
    isActive(run) &&
    run.choices.targets.some((target) =>
      belongsTo(fs.parentdevicefile, new Set([targetDevice(target)])),
    );
  return (
    <TableRow>
      <TableCell className="min-w-48 py-2">
        {address === null ? (
          <FsNameView name={name} />
        ) : (
          <Link
            to="/storage/filesystems/$fs"
            params={{ fs: address }}
            aria-label={t("filesystems.open", { name: nameText })}
            className={routerLinkClass}
          >
            <FsNameView name={name} />
          </Link>
        )}
        {tags.length > 0 ? (
          <span
            dir="auto"
            className="block text-xs break-words text-muted-foreground"
          >
            {tags.join(", ")}
          </span>
        ) : null}
        {isZfs(fs) ? (
          // Managed with its pool: no page, grow, unmount or remove here (ZFS design 10.3).
          <span className="block text-xs text-muted-foreground">
            {t("filesystems.zfsLine", { pool: zfsPool(fs) })}
          </span>
        ) : address === null && state !== "creating" ? (
          <span className="block text-xs text-muted-foreground">
            {t("filesystems.noId")}
          </span>
        ) : null}
      </TableCell>
      <TableCell className="min-w-40 py-2">
        <FsStateView state={state} />
        {progress ? (
          <Link
            to={
              run.choices.kind === "multi"
                ? "/storage/filesystems/add-multi"
                : "/storage/filesystems/add"
            }
            className={`${routerLinkClass} text-sm`}
          >
            {t("filesystems.showProgress")}
          </Link>
        ) : null}
      </TableCell>
      <TableCell className="min-w-56 py-2">
        <FsUsageView row={fs} usage={usage} label={nameText} />
      </TableCell>
      <TableCell className="py-2 whitespace-nowrap">
        <FsTypeView type={fs.type} />
      </TableCell>
      <TableCell className="py-2">
        <FsOnDisks fs={fs} disks={disks} />
      </TableCell>
      <TableCell className="py-2">
        {fs._used ? t("filesystems.usedBy.yes") : t("filesystems.usedBy.no")}
      </TableCell>
    </TableRow>
  );
}

export function FileSystemsTable({
  rows,
  system,
  pending,
  disks,
  error,
  failed,
  refreshing,
  onRetry,
}: {
  /** getList's rows without the system drive; undefined until read. */
  rows: readonly ConfiguredFilesystem[] | undefined;
  system: MountedFilesystem | undefined;
  pending: readonly string[];
  disks: readonly DiskDevice[] | undefined;
  error: unknown;
  failed: boolean;
  refreshing: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const words = useFsWords();
  const [sort, setSort] = useState<Sort>({ field: "device", direction: "asc" });
  const [announcement, setAnnouncement] = useState("");

  const sortBy = (field: SortField, label: string) => {
    const direction =
      sort.field === field && sort.direction === "asc" ? "desc" : "asc";
    setSort({ field, direction });
    setAnnouncement(
      t("table.sorted", {
        column: label,
        direction: t(
          direction === "asc" ? "table.ascending" : "table.descending",
        ),
      }),
    );
  };
  const sortOf = (field: SortField) =>
    sort.field === field
      ? sort.direction === "asc"
        ? "ascending"
        : "descending"
      : "none";

  const sorted = (list: readonly ConfiguredFilesystem[]) => {
    if (sort.field === "device") {
      return [...list];
    }
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...list].sort((a, b) =>
      sort.field === "name"
        ? sign * naturalCompare(words.nameText(a), words.nameText(b))
        : sign * (a.percentage - b.percentage),
    );
  };

  const firstLoad = rows === undefined && !failed;
  let body;
  if (firstLoad) {
    body = <TableSkeletonRows rows={3} columns={COLUMNS} />;
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
          {t("filesystems.loadFailed")}
        </EmptyState>
      </TableStateRow>
    );
  } else {
    body = (
      <>
        {system === undefined ? null : <SystemRow fs={system} disks={disks} />}
        {sorted(rows).map((fs) => (
          <FsRow
            key={`${fs.uuid}:${fs.devicefile}:${fs.mountpoint}:${fs.parentdevicefile}`}
            fs={fs}
            pending={pending}
            disks={disks}
          />
        ))}
        {rows.length === 0 ? (
          <TableStateRow colSpan={COLUMNS}>
            <EmptyState
              action={
                <Link to="/storage/filesystems/add" className={routerLinkClass}>
                  {t("filesystems.add")}
                </Link>
              }
            >
              {t("filesystems.empty")}
            </EmptyState>
          </TableStateRow>
        ) : null}
      </>
    );
  }

  const nameLabel = t("filesystems.col.name");
  const usageLabel = t("filesystems.col.usage");
  const sortable = rows !== undefined && rows.length > 1;
  return (
    <div className="flex flex-col gap-2">
      <Table
        aria-label={t("filesystems.tableLabel")}
        frameLabel={t("filesystems.tableLabel")}
        busy={firstLoad || (refreshing && rows !== undefined)}
        busyLabel={firstLoad ? t("filesystems.loading") : undefined}
      >
        <TableHeader>
          <TableRow>
            <TableHead
              sort={sortable ? sortOf("name") : undefined}
              onSort={() => sortBy("name", nameLabel)}
            >
              {nameLabel}
            </TableHead>
            <TableHead>{t("filesystems.col.state")}</TableHead>
            <TableHead
              sort={sortable ? sortOf("usage") : undefined}
              onSort={() => sortBy("usage", usageLabel)}
            >
              {usageLabel}
            </TableHead>
            <TableHead>{t("filesystems.col.type")}</TableHead>
            <TableHead>{t("filesystems.col.on")}</TableHead>
            <TableHead>{t("filesystems.col.usedBy")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{body}</TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">
        {t("filesystems.usedByNote")}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
