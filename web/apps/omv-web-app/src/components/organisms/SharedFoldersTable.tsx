// SPDX-License-Identifier: GPL-3.0-or-later
// The shared folders (phase 3 design 4; phase 5 shares design 1). ShareMgmt.getList pages, sorts and
// searches on the server; the table's state lives in memory (tableStore.ts), never in the address
// (UI-4). A second, separate read of every folder counts the ones that cannot be reached and finds
// this session's unfinished work (1.5); if it fails, those are left out and the table is unaffected.
// SMB.getShareList, read whole, fills the Sharing column, which is not sortable (it is not a server
// field); if it fails, the column says "Not known" and a line above the table says so (design 18 #7).
// After the first load, a new page, sort or search keeps the current rows on screen, marked busy,
// instead of flashing skeletons. Everything from the server is text.
import {
  useShareMgmtGetList,
  type SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  buttonClass,
  CopyButton,
  EmptyState,
  InlineAlert,
  PairStack,
  SearchField,
  ServerMessage,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableLastRefreshed,
  TablePagination,
  TableRow,
  TableSkeletonRows,
  TableStateRow,
  TableToolbar,
} from "@omv-webui/react-ui-components";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useNfsShares } from "../../hooks/useNfsReads.ts";
import {
  useShareServices,
  useSharesSystem,
  useSmbSettings,
  useSmbShares,
} from "../../hooks/useSharesReads.ts";
import {
  nfsSharingCell,
  type NfsSharingCell,
} from "../../services/nfsModel.ts";
import { isFolderAddress } from "../../sharedFolders/folderAddress.ts";
import {
  folderPending,
  sharesSession,
  unfinishedWork,
  type UnfinishedWork,
} from "../../sharedFolders/sharesSession.ts";
import {
  sharingCell,
  smbOn,
  smbState,
  type SharingCell,
} from "../../sharedFolders/smbModel.ts";
import {
  ALL_ROWS,
  clampPage,
  listRequest,
  nextSort,
  PAGE_SIZES,
  pageCount,
  problems,
  rangeOf,
  type SortField,
} from "../../sharedFolders/table.ts";
import {
  sharedFoldersTable,
  useTableState,
} from "../../sharedFolders/tableStore.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { FolderStatus } from "../atoms/FolderStatus.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { ClampedText } from "../molecules/ClampedText.tsx";

const SEARCH_DELAY_MS = 300;

/** The columns in order (1.3); `field` null for Sharing, which the server cannot sort. */
const COLUMNS = [
  { field: "name", label: "sharedFolders.col.name" },
  { field: "status", label: "sharedFolders.col.status" },
  { field: "device", label: "sharedFolders.col.device" },
  { field: null, label: "sharedFolders.col.sharing" },
  { field: "reldirpath", label: "sharedFolders.col.path" },
  { field: "absdirpath", label: "sharedFolders.col.fullPath" },
  { field: "comment", label: "sharedFolders.col.description" },
  { field: "_used", label: "sharedFolders.col.used" },
] as const satisfies readonly {
  field: SortField | null;
  label: `sharedFolders.col.${string}`;
}[];

const store = sharedFoldersTable;

function Missing() {
  const { t } = useTranslation();
  return (
    <span className="text-muted-foreground">{t("common.notAvailable")}</span>
  );
}

/** The folder's file system as the list shows it: OMV's label or device; "Not available" when empty. */
function DeviceText({ device }: { device: string }) {
  if (device === "") {
    return <Missing />;
  }
  return device.startsWith("/") ? (
    <span className="font-mono text-sm [overflow-wrap:anywhere]">{device}</span>
  ) : (
    <span dir="auto" className="break-words">
      {device}
    </span>
  );
}

/**
 * The Sharing column's words (1.3; services design 12.1): Windows and Mac, and "Linux and Unix (NFS)"
 * for a folder with an NFS entry; nothing when not shared. A failed read leaves its part "Not known".
 */
function SharingText({
  cell,
  nfs,
}: {
  cell: SharingCell;
  nfs: NfsSharingCell;
}) {
  const { t } = useTranslation();
  let smb = null;
  switch (cell.kind) {
    case "none":
      break;
    case "unknown":
      smb = (
        <span className="text-muted-foreground">
          {t("sharedFolders.sharing.unknown")}
        </span>
      );
      break;
    default:
      smb = (
        <>
          <span>
            {t(
              cell.kind === "smb"
                ? "sharedFolders.sharing.smb"
                : "sharedFolders.sharing.smbOff",
            )}
          </span>
          {cell.guests ? (
            <span className="text-sm">{t("sharedFolders.sharing.guests")}</span>
          ) : null}
        </>
      );
  }
  const linux =
    nfs === "nfs" ? (
      <span>{t("sharedFolders.sharing.nfs")}</span>
    ) : nfs === "unknown" && cell.kind !== "unknown" ? (
      <span className="text-muted-foreground">
        {t("sharedFolders.sharing.nfsUnknown")}
      </span>
    ) : null;
  if (smb === null && linux === null) {
    return null;
  }
  return (
    <span className="flex flex-col">
      {smb}
      {linux}
    </span>
  );
}

/** The folder's name: a router link to its page, when its UUID can be an address (UI-4). */
function FolderName({ folder }: { folder: SharedFolder }) {
  const { t } = useTranslation();
  if (!isFolderAddress(folder.uuid)) {
    return (
      <span dir="auto" className="font-medium break-words">
        {inertBidi(folder.name)}
      </span>
    );
  }
  return (
    <Link
      to="/storage/shared-folders/$folder"
      params={{ folder: folder.uuid }}
      aria-label={t("sharedFolders.open", { folder: inertBidi(folder.name) })}
      dir="auto"
      className={`font-medium break-words ${routerLinkClass}`}
    >
      {inertBidi(folder.name)}
    </Link>
  );
}

function FolderRow({
  folder,
  sharing,
  nfs,
  pending,
}: {
  folder: SharedFolder;
  sharing: SharingCell;
  /** Whether it has an NFS entry (services design 12.1). */
  nfs: NfsSharingCell;
  /** This session changed it and the change is not applied (0.8). */
  pending: boolean;
}) {
  const { t } = useTranslation();
  const device = folder.device;
  const full = folder.absdirpath ?? "";
  return (
    <TableRow>
      <TableCell narrow="title" className="@min-[40rem]:min-w-32">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <FolderName folder={folder} />
          {pending ? <PendingMark /> : null}
        </span>
      </TableCell>
      {/* A line, not an aside: a status other than OK says what it means. */}
      <TableCell
        label={t("sharedFolders.col.status")}
        className="@min-[40rem]:min-w-40"
      >
        <FolderStatus status={folder.status} />
      </TableCell>
      <TableCell
        label={t("sharedFolders.col.device")}
        className="@min-[40rem]:min-w-32"
      >
        <DeviceText device={device} />
      </TableCell>
      <TableCell
        label={t("sharedFolders.col.sharing")}
        className="@min-[40rem]:min-w-32"
      >
        <SharingText cell={sharing} nfs={nfs} />
      </TableCell>
      {/* Stacked, the path is said by the full path, which ends with it; it stays a line only
          when the full path is not known. */}
      <TableCell
        label={t("sharedFolders.col.path")}
        narrow={full === "" ? "line" : "hidden"}
        mono
        className="[overflow-wrap:anywhere] @min-[40rem]:min-w-28"
      >
        {folder.reldirpath}
      </TableCell>
      <TableCell
        label={t("sharedFolders.col.fullPath")}
        className="@min-[40rem]:min-w-48"
      >
        {full === "" ? (
          <Missing />
        ) : (
          <span className="flex items-start gap-1">
            <span className="min-w-0 font-mono text-sm [overflow-wrap:anywhere]">
              {inertBidi(full)}
            </span>
            <CopyButton
              text={full}
              label={t("sharedFolders.copyPath", {
                name: inertBidi(folder.name),
              })}
              copiedLabel={t("common.copied")}
              selectedLabel={t("common.copySelected")}
              className="-my-1 shrink-0"
            />
          </span>
        )}
      </TableCell>
      <TableCell
        label={t("sharedFolders.col.description")}
        className="text-muted-foreground @min-[40rem]:min-w-40"
      >
        {folder.comment === "" ? null : (
          <ClampedText>{inertBidi(folder.comment)}</ClampedText>
        )}
      </TableCell>
      <TableCell label={t("sharedFolders.col.used")}>
        {folder._used ? t("sharedFolders.yes") : t("sharedFolders.no")}
      </TableCell>
    </TableRow>
  );
}

/** One unfinished-work line (1.5), with its action. */
function UnfinishedLine({ work }: { work: UnfinishedWork }) {
  const { t } = useTranslation();
  const { folder } = work;
  const name = <FolderNameText value={folder.name} />;
  const linked = isFolderAddress(folder.uuid);
  return (
    <InlineAlert tone="neutral">
      <p>
        <Trans
          i18nKey={`sharedFolders.unfinished.${work.kind}`}
          components={{ folder: name }}
        />
      </p>
      {work.kind === "notSaved" || !linked ? null : (
        <p>
          <Link
            to="/storage/shared-folders/$folder"
            params={{ folder: folder.uuid }}
            hash={work.kind === "notShared" ? "sharing" : undefined}
            className={routerLinkClass}
          >
            {work.kind === "notShared"
              ? t("sharedFolders.unfinished.shareIt")
              : t("sharedFolders.unfinished.open", {
                  folder: inertBidi(folder.name),
                })}
          </Link>
        </p>
      )}
    </InlineAlert>
  );
}

export function SharedFoldersTable() {
  const { t } = useTranslation();
  const format = useFormat();
  const state = useTableState();
  const searchRef = useRef<HTMLInputElement>(null);
  const usedNoteId = useId();
  const [announcement, setAnnouncement] = useState("");

  const table = useShareMgmtGetList(listRequest(state), {
    query: { placeholderData: keepPreviousData },
  });
  const all = useShareMgmtGetList(ALL_ROWS);
  // The Sharing column's reads (1.1): with the table, on Refresh and on window focus.
  const shares = useSmbShares({ focus: true });
  const nfsShares = useNfsShares({ focus: true });
  const settings = useSmbSettings({ focus: true });
  const services = useShareServices({ focus: true });
  const system = useSharesSystem();
  const memory = useMemoryStore(sharesSession);
  const pending = system.pending ?? [];
  const on = smbOn(
    smbState(
      { data: settings.data, failed: settings.isError, error: settings.error },
      {
        data: services.data?.data,
        failed: services.isError,
        error: services.error,
      },
      pending,
    ),
  );
  const sharesRead = {
    data: shares.data?.data,
    failed: shares.isError,
    error: shares.error,
  };

  // The search is sent 300 ms after typing stops, and starts again from the first page.
  useEffect(() => {
    if (state.searchInput === state.search) {
      return undefined;
    }
    const id = window.setTimeout(
      () => store.set({ search: state.searchInput, page: 0 }),
      SEARCH_DELAY_MS,
    );
    return () => window.clearTimeout(id);
  }, [state.searchInput, state.search]);

  // Folders deleted elsewhere can leave this page past the end: move to the last one that exists.
  const total = table.isPlaceholderData ? undefined : table.data?.total;
  useEffect(() => {
    if (total === undefined) {
      return;
    }
    const page = clampPage(state.page, total, state.pageSize);
    if (page !== state.page) {
      store.set({ page });
    }
  }, [total, state.page, state.pageSize]);

  const data = table.data;
  const searching = state.search.trim() !== "";
  const firstLoad = data === undefined && !table.isError;
  const failed = data === undefined && table.isError;
  const noFolders = data !== undefined && data.total === 0 && !searching;
  const busy = table.isPlaceholderData;
  const refresh = () => {
    void table.refetch();
    void all.refetch();
    void shares.refetch();
    void nfsShares.refetch();
    void settings.refetch();
    void services.refetch();
  };

  const changeSearch = (value: string) => {
    // Clearing applies at once; typing waits for the pause.
    store.set(
      value === ""
        ? { searchInput: "", search: "", page: 0 }
        : { searchInput: value },
    );
  };

  const clearSearch = () => {
    changeSearch("");
    searchRef.current?.focus();
  };

  const sortBy = (field: SortField, label: string) => {
    const sort = nextSort(state.sort, field);
    store.set({ sort, page: 0 });
    setAnnouncement(
      t("table.sorted", {
        column: label,
        direction: t(
          sort.direction === "asc" ? "table.ascending" : "table.descending",
        ),
      }),
    );
  };

  const issues = all.data ? problems(all.data.data) : null;
  const unfinished = all.data
    ? unfinishedWork(memory, all.data.data, shares.data?.data, pending)
    : [];

  let body;
  if (firstLoad) {
    body = (
      <TableSkeletonRows
        rows={Math.min(state.pageSize, 10)}
        columns={COLUMNS.length}
      />
    );
  } else if (failed) {
    body = (
      <TableStateRow colSpan={COLUMNS.length}>
        <EmptyState
          variant="error"
          serverMessage={
            isRpcError(table.error)
              ? { label: t("app.serverMessage"), text: table.error.message }
              : undefined
          }
          action={
            <Button variant="neutral" onClick={refresh}>
              {t("common.tryAgain")}
            </Button>
          }
        >
          {t("sharedFolders.loadFailed")}
        </EmptyState>
      </TableStateRow>
    );
  } else if (data && data.total === 0) {
    body = (
      <TableStateRow colSpan={COLUMNS.length}>
        {searching ? (
          <EmptyState
            variant="filtered"
            action={
              <Button variant="neutral" onClick={clearSearch}>
                {t("sharedFolders.clearSearch")}
              </Button>
            }
          >
            {t("sharedFolders.filteredEmpty", { search: state.search.trim() })}
          </EmptyState>
        ) : (
          <EmptyState
            action={
              <Link
                to="/storage/shared-folders/add"
                className={routerLinkClass}
              >
                {t("sharedFolders.add")}
              </Link>
            }
          >
            {t("sharedFolders.empty")}
          </EmptyState>
        )}
      </TableStateRow>
    );
  } else {
    body = data?.data.map((folder) => (
      <FolderRow
        key={folder.uuid}
        folder={folder}
        sharing={sharingCell(folder.uuid, sharesRead, on)}
        nfs={nfsSharingCell(folder.uuid, {
          data: nfsShares.data?.data,
          failed: nfsShares.isError,
        })}
        pending={folderPending(memory, folder.uuid, pending)}
      />
    ));
  }

  const range = data ? rangeOf(state.page, state.pageSize, data.total) : null;

  return (
    <div className="flex min-w-0 flex-col gap-group">
      {issues && issues.count > 0 && issues.worst ? (
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={issues.worst}>
            {t(`sharedFolders.status.${issues.worst}`)}
          </StatusPill>
          <p>
            {t("sharedFolders.rollUp", {
              count: issues.count,
              total: issues.total,
            })}
          </p>
          <Button
            variant="neutral"
            size="sm"
            onClick={() => {
              store.set({
                sort: { field: "status", direction: "asc" },
                page: 0,
              });
              setAnnouncement(
                t("table.sorted", {
                  column: t("sharedFolders.col.status"),
                  direction: t("table.ascending"),
                }),
              );
            }}
          >
            {t("sharedFolders.showFirst")}
          </Button>
        </div>
      ) : null}

      {unfinished.map((work) => (
        <UnfinishedLine key={`${work.kind}:${work.folder.uuid}`} work={work} />
      ))}

      <PairStack>
        <TableToolbar className="items-start">
          {noFolders ? null : (
            <SearchField
              ref={searchRef}
              size="sm"
              label={t("sharedFolders.search")}
              placeholder={t("sharedFolders.searchPlaceholder")}
              hint={t("sharedFolders.searchHint")}
              clearLabel={t("sharedFolders.clearSearch")}
              value={state.searchInput}
              onValueChange={changeSearch}
              busy={busy}
              className="max-w-md flex-1 basis-64"
            />
          )}
          <div className="ms-auto flex items-center gap-3 self-center">
            {busy ? (
              <span className="text-sm text-muted-foreground">
                {t("app.loading")}
              </span>
            ) : null}
            <Link
              to="/storage/shared-folders/add"
              className={buttonClass({ variant: "primary" })}
            >
              {t("sharedFolders.add")}
            </Link>
          </div>
        </TableToolbar>

        {shares.isError ? (
          <InlineAlert
            tone="critical"
            title={t("sharedFolders.sharing.loadFailed")}
          >
            {isRpcError(shares.error) ? (
              <ServerMessage label={t("app.serverMessage")}>
                {shares.error.message}
              </ServerMessage>
            ) : null}
            <p>
              <Button
                variant="neutral"
                size="sm"
                loading={shares.isFetching}
                onClick={() => void shares.refetch()}
              >
                {t("common.tryAgain")}
              </Button>
            </p>
          </InlineAlert>
        ) : null}

        <Table
          aria-label={t("sharedFolders.tableLabel")}
          busy={firstLoad || busy}
          busyLabel={t("sharedFolders.loading")}
        >
          <TableHeader>
            <TableRow>
              {COLUMNS.map(({ field, label }) => {
                const text = t(label);
                if (field === null) {
                  return <TableHead key={label}>{text}</TableHead>;
                }
                return (
                  <TableHead
                    key={field}
                    aria-describedby={
                      field === "_used" ? usedNoteId : undefined
                    }
                    sort={
                      state.sort.field === field
                        ? state.sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    onSort={() => sortBy(field, text)}
                  >
                    {text}
                    {field === "_used" ? (
                      <span aria-hidden="true">*</span>
                    ) : null}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>{body}</TableBody>
        </Table>
        <p id={usedNoteId} className="text-sm text-muted-foreground">
          <span aria-hidden="true">* </span>
          {t("sharedFolders.usedNote")}
        </p>
        <p role="status" className="sr-only">
          {announcement}
        </p>

        {data && data.total > 0 && range ? (
          <TablePagination
            aria-label={t("sharedFolders.pages")}
            page={state.page}
            pageCount={pageCount(data.total, state.pageSize)}
            onPageChange={(page) => store.set({ page })}
            range={t(searching ? "table.rangeMatching" : "table.range", {
              from: range.from,
              to: range.to,
              total: range.total,
            })}
            pageSize={state.pageSize}
            pageSizeOptions={PAGE_SIZES}
            onPageSizeChange={(pageSize) => store.set({ pageSize, page: 0 })}
            pageSizeLabel={t("table.pageSize")}
            previous={{
              label: t("table.previous"),
              unavailableReason: t("table.firstPageReason"),
            }}
            next={{
              label: t("table.next"),
              unavailableReason: t("table.lastPageReason"),
            }}
          />
        ) : null}
        {data ? (
          <TableLastRefreshed
            action={
              <Button
                variant="ghost"
                size="sm"
                loading={table.isFetching && !busy}
                onClick={refresh}
              >
                {t("sharedFolders.refresh")}
              </Button>
            }
          >
            {t("sharedFolders.lastRefreshed", {
              time: format.clock(table.dataUpdatedAt),
            })}
          </TableLastRefreshed>
        ) : null}
      </PairStack>
    </div>
  );
}
