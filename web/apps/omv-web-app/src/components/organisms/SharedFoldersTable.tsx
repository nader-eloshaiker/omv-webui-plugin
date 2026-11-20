// SPDX-License-Identifier: GPL-3.0-or-later
// The shared folders, read-only (phase 3 design 4). ShareMgmt.getList pages, sorts and searches on the
// server; the table's state lives in memory (tableStore.ts), never in the address (UI-4). A second,
// separate read of every folder counts the ones that cannot be reached; if it fails, the count is left
// out and the table is unaffected. After the first load, a new page, sort or search keeps the current
// rows on screen, marked busy, instead of flashing skeletons. Everything from the server is text.
import {
  useShareMgmtGetList,
  type SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  CopyButton,
  EmptyState,
  ExternalLink,
  SearchField,
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
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../format/useFormat.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
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
import { FolderStatus } from "../atoms/FolderStatus.tsx";
import { ClampedText } from "../molecules/ClampedText.tsx";

const SEARCH_DELAY_MS = 300;

const COLUMNS = [
  { field: "name", label: "sharedFolders.col.name" },
  { field: "status", label: "sharedFolders.col.status" },
  { field: "device", label: "sharedFolders.col.device" },
  { field: "reldirpath", label: "sharedFolders.col.path" },
  { field: "absdirpath", label: "sharedFolders.col.fullPath" },
  { field: "comment", label: "sharedFolders.col.description" },
  { field: "_used", label: "sharedFolders.col.used" },
] as const satisfies readonly {
  field: SortField;
  label: `sharedFolders.col.${string}`;
}[];

const store = sharedFoldersTable;

function Missing() {
  const { t } = useTranslation();
  return (
    <span className="text-muted-foreground">{t("common.notAvailable")}</span>
  );
}

function FolderRow({ folder }: { folder: SharedFolder }) {
  const { t } = useTranslation();
  const device = folder.device;
  const full = folder.absdirpath ?? "";
  return (
    <TableRow>
      <TableCell dir="auto" className="min-w-32 py-2 font-medium break-words">
        {folder.name}
      </TableCell>
      <TableCell className="min-w-40 py-2">
        <FolderStatus status={folder.status} />
      </TableCell>
      <TableCell className="min-w-32 py-2">
        {device === "" ? (
          <Missing />
        ) : device.startsWith("/") ? (
          <span className="font-mono text-sm [overflow-wrap:anywhere]">
            {device}
          </span>
        ) : (
          <span dir="auto" className="break-words">
            {device}
          </span>
        )}
      </TableCell>
      <TableCell mono className="min-w-28 py-2 [overflow-wrap:anywhere]">
        {folder.reldirpath}
      </TableCell>
      <TableCell className="min-w-48 py-2">
        {full === "" ? (
          <Missing />
        ) : (
          <span className="flex items-start gap-1">
            <span className="min-w-0 font-mono text-sm [overflow-wrap:anywhere]">
              {full}
            </span>
            <CopyButton
              text={full}
              label={t("sharedFolders.copyPath", { name: folder.name })}
              copiedLabel={t("common.copied")}
              selectedLabel={t("common.copySelected")}
              className="-my-1 shrink-0"
            />
          </span>
        )}
      </TableCell>
      <TableCell className="min-w-40 py-2 text-muted-foreground">
        {folder.comment === "" ? null : (
          <ClampedText>{folder.comment}</ClampedText>
        )}
      </TableCell>
      <TableCell className="py-2">
        {folder._used ? t("sharedFolders.yes") : t("sharedFolders.no")}
      </TableCell>
    </TableRow>
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
      t("sharedFolders.sorted", {
        column: label,
        direction: t(
          sort.direction === "asc"
            ? "sharedFolders.ascending"
            : "sharedFolders.descending",
        ),
      }),
    );
  };

  const issues = all.data ? problems(all.data.data) : null;

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
              <ExternalLink
                href={CLASSIC.addSharedFolder}
                newTabLabel={t("app.newTab")}
              >
                {t("sharedFolders.addClassic")}
              </ExternalLink>
            }
          >
            {t("sharedFolders.empty")}
          </EmptyState>
        )}
      </TableStateRow>
    );
  } else {
    body = data?.data.map((folder) => (
      <FolderRow key={folder.uuid} folder={folder} />
    ));
  }

  const range = data ? rangeOf(state.page, state.pageSize, data.total) : null;

  return (
    <div className="flex flex-col gap-3">
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
                t("sharedFolders.sorted", {
                  column: t("sharedFolders.col.status"),
                  direction: t("sharedFolders.ascending"),
                }),
              );
            }}
          >
            {t("sharedFolders.showFirst")}
          </Button>
        </div>
      ) : null}

      <div>
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
            <ExternalLink
              href={CLASSIC.addSharedFolder}
              newTabLabel={t("app.newTab")}
            >
              {t("sharedFolders.add")}
            </ExternalLink>
          </div>
        </TableToolbar>

        <Table
          aria-label={t("sharedFolders.tableLabel")}
          busy={firstLoad || busy}
          busyLabel={t("sharedFolders.loading")}
        >
          <TableHeader>
            <TableRow>
              {COLUMNS.map(({ field, label }) => {
                const text = t(label);
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
        <p id={usedNoteId} className="pt-2 text-sm text-muted-foreground">
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
            range={t(
              searching ? "sharedFolders.rangeMatching" : "sharedFolders.range",
              {
                from: range.from,
                to: range.to,
                total: range.total,
              },
            )}
            pageSize={state.pageSize}
            pageSizeOptions={PAGE_SIZES}
            onPageSizeChange={(pageSize) => store.set({ pageSize, page: 0 })}
            pageSizeLabel={t("sharedFolders.pageSize")}
            previous={{
              label: t("sharedFolders.previous"),
              unavailableReason: t("sharedFolders.firstPageReason"),
            }}
            next={{
              label: t("sharedFolders.next"),
              unavailableReason: t("sharedFolders.lastPageReason"),
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
      </div>
    </div>
  );
}
