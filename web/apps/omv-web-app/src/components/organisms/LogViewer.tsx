// SPDX-License-Identifier: GPL-3.0-or-later
// The System logs viewer (phase 5 design 2). No log is read until the reader chooses one (D10); the
// choice reads it once, whole (LogFile.getList re-reads the entire log on every call), and the rows
// are then searched, sorted and paged here. Nothing more is asked of the server until "Refresh" or
// another log. The picker is Base UI's Select, which commits on Enter or a click, so arrowing through
// it does not read every log in turn. The view lives in memory (logsViewStore.ts), never in the
// address (UI-4). Every log line is shown as text (UI-2), in its own direction.
import type { LogRow } from "@omv-webui/react-api-omv/generated";
import { useLogFileGetList } from "@omv-webui/react-api-omv/generated";
import {
  Button,
  EmptyState,
  SearchField,
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
  TableSkeletonRows,
  TableStateRow,
  TableToolbar,
} from "@omv-webui/react-ui-components";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEpochSeconds } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { logsView } from "../../logs/logsViewStore.ts";
import {
  defaultSort,
  isLogId,
  LOG_GROUPS,
  LOG_IDS,
  LOG_PAGE_SIZES,
  logLayout,
  logRequest,
  nextSort,
  pageOf,
  searchRows,
  SERVER_LINE_LIMIT,
  sortRows,
  type LogLayout,
  type LogSortField,
} from "../../logs/logView.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { ReadFailed } from "../molecules/ReadFailed.tsx";

const SEARCH_DELAY_MS = 200;
/** Kept for five minutes after leaving the page, so a quick look elsewhere does not read it again. */
const KEEP_MS = 5 * 60_000;

interface Column {
  field: LogSortField | null;
  label: string;
  key: string;
}

function columnsOf(layout: LogLayout): Column[] {
  switch (layout) {
    case "message":
      return [{ key: "message", field: null, label: "logs.col.message" }];
    case "audit":
      return [
        { key: "time", field: "ts", label: "logs.col.time" },
        { key: "user", field: "username", label: "logs.col.user" },
        { key: "computer", field: "clientipaddr", label: "logs.col.computer" },
        { key: "share", field: "servicename", label: "logs.col.share" },
        { key: "file", field: null, label: "logs.col.file" },
        { key: "action", field: "operation", label: "logs.col.action" },
        { key: "result", field: "result", label: "logs.col.result" },
      ];
    default:
      return [
        { key: "time", field: "ts", label: "logs.col.time" },
        { key: "message", field: null, label: "logs.col.message" },
      ];
  }
}

const str = (value: unknown): string =>
  typeof value === "string" ? value : "";

function TimeCell({ ts }: { ts: LogRow["ts"] }) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <TableCell className="py-2 align-top whitespace-nowrap tabular-nums">
      {typeof ts === "number" ? (
        format.dateTime(ts)
      ) : (
        <span className="text-muted-foreground">{t("common.notReported")}</span>
      )}
    </TableCell>
  );
}

function MessageCell({ message }: { message: unknown }) {
  return (
    <TableCell
      dir="auto"
      className="min-w-64 py-2 align-top font-mono text-[13px] whitespace-pre-wrap [overflow-wrap:anywhere]"
    >
      {str(message)}
    </TableCell>
  );
}

function LogRowView({ row, layout }: { row: LogRow; layout: LogLayout }) {
  if (layout === "message") {
    return (
      <TableRow>
        <MessageCell message={row.message} />
      </TableRow>
    );
  }
  if (layout === "audit") {
    const file = str(row.filename);
    const path = str(row.filepath);
    return (
      <TableRow>
        <TimeCell ts={row.ts} />
        <TableCell dir="auto" className="py-2 align-top break-words">
          {str(row.username)}
        </TableCell>
        <TableCell mono className="py-2 align-top [overflow-wrap:anywhere]">
          {str(row.clientipaddr)}
        </TableCell>
        <TableCell dir="auto" className="py-2 align-top break-words">
          {str(row.servicename)}
        </TableCell>
        <TableCell className="min-w-40 py-2 align-top">
          <span
            dir="auto"
            className="block font-mono text-sm [overflow-wrap:anywhere]"
          >
            {file}
          </span>
          {path !== "" && path !== file ? (
            <span
              dir="auto"
              className="block font-mono text-sm text-muted-foreground [overflow-wrap:anywhere]"
            >
              {path}
            </span>
          ) : null}
        </TableCell>
        <TableCell mono className="py-2 align-top">
          {str(row.operation)}
        </TableCell>
        <TableCell dir="auto" className="py-2 align-top break-words">
          {str(row.result)}
        </TableCell>
      </TableRow>
    );
  }
  return (
    <TableRow>
      <TimeCell ts={row.ts} />
      <MessageCell message={row.message} />
    </TableRow>
  );
}

export function LogViewer() {
  const { t } = useTranslation();
  const format = useFormat();
  const state = useMemoryStore(logsView);
  const searchRef = useRef<HTMLInputElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const refreshReasonId = useId();
  const id = state.logId;
  const layout = id === undefined ? "journal" : logLayout(id);

  const log = useLogFileGetList(logRequest(id ?? "syslog"), {
    query: {
      enabled: id !== undefined,
      // Read once per choice; Refresh reads again. Not on focus, reconnect or a remount.
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: KEEP_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
    },
  });

  // The search runs 200 ms after typing stops, from the first page.
  useEffect(() => {
    if (state.searchInput === state.search) {
      return undefined;
    }
    const timer = window.setTimeout(
      () => logsView.set({ search: state.searchInput, page: 0 }),
      SEARCH_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.searchInput, state.search]);

  const data = id === undefined ? undefined : log.data;
  const all = data?.data;
  // Sorting and searching up to 100,000 lines is the page's hot path: done once per change, not per
  // render.
  const sorted = useMemo(
    () => (all ? sortRows(all, state.sort) : []),
    [all, state.sort],
  );
  const matching = useMemo(
    () => searchRows(sorted, state.search, layout, formatEpochSeconds),
    [sorted, state.search, layout],
  );
  const page = pageOf(matching, state.page, state.pageSize);
  const columns = columnsOf(layout);
  const searching = state.search.trim() !== "";
  const firstRead = id !== undefined && log.isPending && log.isFetching;
  const failed = id !== undefined && log.isError && data === undefined;
  const refreshing = log.isFetching && data !== undefined;
  const logName = id === undefined ? "" : t(`logs.id.${id}`);

  const choose = (value: unknown) => {
    if (!isLogId(value) || value === id) {
      return;
    }
    logsView.set({
      logId: value,
      searchInput: "",
      search: "",
      sort: defaultSort(logLayout(value)),
      page: 0,
    });
  };

  const refresh = () => {
    logsView.set({ page: 0 });
    void log.refetch();
  };

  const changeSearch = (value: string) => {
    logsView.set(
      value === ""
        ? { searchInput: "", search: "", page: 0 }
        : { searchInput: value },
    );
  };
  const clearSearch = () => {
    changeSearch("");
    searchRef.current?.focus();
  };

  const sortBy = (field: LogSortField, label: string) => {
    const sort = nextSort(state.sort, field);
    logsView.set({ sort, page: 0 });
    setAnnouncement(
      t("table.sorted", {
        column: label,
        direction: t(
          sort.direction === "asc" ? "table.ascending" : "table.descending",
        ),
      }),
    );
  };

  let count = "";
  if (firstRead) {
    count = t("logs.reading");
  } else if (data) {
    count = searching
      ? t("logs.countMatching", {
          count: matching.length,
          shown: format.count(matching.length),
          total: format.count(data.total),
        })
      : t("logs.count", {
          count: data.total,
          shown: format.count(data.total),
          time: format.clock(log.dataUpdatedAt),
        });
  }

  let body;
  if (id === undefined) {
    body = (
      <TableStateRow colSpan={columns.length}>
        <EmptyState>{t("logs.nothingChosen")}</EmptyState>
      </TableStateRow>
    );
  } else if (firstRead) {
    body = <TableSkeletonRows rows={10} columns={columns.length} />;
  } else if (failed) {
    body = (
      <TableStateRow colSpan={columns.length}>
        <ReadFailed
          error={log.error}
          onRetry={() => void log.refetch()}
          retrying={log.isFetching}
        >
          {t("logs.loadFailed")}
        </ReadFailed>
      </TableStateRow>
    );
  } else if (data && data.total === 0) {
    body = (
      <TableStateRow colSpan={columns.length}>
        <EmptyState>
          {id === "smbdaudit" || id === "rsync"
            ? t(`logs.emptyFor.${id}`)
            : t("logs.empty")}
        </EmptyState>
      </TableStateRow>
    );
  } else if (data && matching.length === 0) {
    body = (
      <TableStateRow colSpan={columns.length}>
        <EmptyState
          variant="filtered"
          action={
            <Button variant="neutral" onClick={clearSearch}>
              {t("logs.clearSearch")}
            </Button>
          }
        >
          {t("logs.filteredEmpty", { search: state.search.trim() })}
        </EmptyState>
      </TableStateRow>
    );
  } else {
    body = page.rows.map((row) => (
      <LogRowView key={row.rownum} row={row} layout={layout} />
    ));
  }

  const items = LOG_IDS.map((value) => ({
    value,
    label: t(`logs.id.${value}`),
  }));
  const oldestFirst =
    state.sort.field === "rownum" && state.sort.direction === "asc";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <TableToolbar className="items-end gap-x-3 gap-y-3">
        <div className="flex w-full max-w-sm flex-col gap-1">
          <Select items={items} value={id ?? null} onValueChange={choose}>
            <SelectLabel>{t("logs.picker")}</SelectLabel>
            <SelectTrigger placeholder={t("logs.pickerPlaceholder")} />
            <SelectContent>
              {LOG_GROUPS.map((group) => (
                <SelectGroup key={group.group}>
                  <SelectGroupLabel>
                    {t(`logs.group.${group.group}`)}
                  </SelectGroupLabel>
                  {group.ids.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`logs.id.${value}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        {data ? (
          <SearchField
            ref={searchRef}
            label={t("logs.search")}
            placeholder={t("logs.searchPlaceholder")}
            clearLabel={t("logs.clearSearch")}
            value={state.searchInput}
            onValueChange={changeSearch}
            className="max-w-sm flex-1 basis-56"
          />
        ) : null}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {layout === "message" && data ? (
            <Button
              variant="neutral"
              onClick={() =>
                logsView.set({
                  sort: {
                    field: "rownum",
                    direction: oldestFirst ? "desc" : "asc",
                  },
                  page: 0,
                })
              }
            >
              {oldestFirst ? t("logs.newestFirst") : t("logs.oldestFirst")}
            </Button>
          ) : null}
          <Button
            variant="neutral"
            disabled={id === undefined}
            focusableWhenDisabled
            aria-describedby={id === undefined ? refreshReasonId : undefined}
            loading={refreshing}
            onClick={id === undefined || log.isFetching ? undefined : refresh}
          >
            {refreshing ? t("logs.refreshing") : t("logs.refresh")}
          </Button>
          {id === undefined ? (
            <span id={refreshReasonId} className="sr-only">
              {t("logs.refreshReason")}
            </span>
          ) : null}
        </div>
      </TableToolbar>

      <p role="status" className="text-sm tabular-nums empty:hidden">
        {count}
      </p>
      {data && data.total >= SERVER_LINE_LIMIT ? (
        <p className="text-sm text-muted-foreground">{t("logs.limit")}</p>
      ) : null}
      {layout === "message" && data ? (
        <p className="text-sm text-muted-foreground">{t("logs.noTimes")}</p>
      ) : null}

      <div>
        <Table
          aria-label={
            id === undefined
              ? t("logs.title")
              : t("logs.tableLabel", { log: logName })
          }
          frameLabel={
            id === undefined
              ? undefined
              : t("logs.tableLabel", { log: logName })
          }
          busy={firstRead || refreshing}
          busyLabel={t("logs.reading")}
        >
          <TableHeader>
            <TableRow>
              {columns.map((column) => {
                const label = t(column.label as "logs.col.time");
                const field = column.field;
                const sortable = field !== null && layout !== "message";
                return (
                  <TableHead
                    key={column.key}
                    sort={
                      sortable
                        ? state.sort.field === field
                          ? state.sort.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                        : undefined
                    }
                    onSort={
                      sortable && data ? () => sortBy(field, label) : undefined
                    }
                  >
                    {label}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>{body}</TableBody>
        </Table>
        <p role="status" className="sr-only">
          {announcement}
        </p>
        {data && matching.length > 0 ? (
          <TablePagination
            aria-label={t("logs.pages")}
            page={page.page}
            pageCount={page.pageCount}
            onPageChange={(next) => logsView.set({ page: next })}
            range={t(searching ? "table.rangeMatching" : "table.range", {
              from: format.count(page.from),
              to: format.count(page.to),
              total: format.count(matching.length),
            })}
            pageSize={state.pageSize}
            pageSizeOptions={LOG_PAGE_SIZES}
            onPageSizeChange={(pageSize) => logsView.set({ pageSize, page: 0 })}
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
      </div>
    </div>
  );
}
