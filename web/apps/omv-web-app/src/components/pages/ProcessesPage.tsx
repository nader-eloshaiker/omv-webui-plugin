// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnostics > Processes (phase 5 design 3), for administrators: what the NAS is busy with right now.
// System.getTopInfo is polled every 5 s in the background (UI-14), the stock page's rate, and stops
// while the tab is hidden. The list re-sorts on every read, so the reader can pause it, read it and
// resume; the pause is kept in memory for the session (processesViewStore.ts). Nothing here acts on a
// process. The figures are not a live region: a reader would hear the list every 5 s. A normal user
// who types the address gets the "only administrators" page, and nothing is called first (UI-4).
import type { TopInfo } from "@omv-webui/react-api-omv/generated";
import {
  getSystemGetTopInfoQueryKey,
  getSystemGetTopInfoQueryOptions,
  useSystemGetTopInfo,
} from "@omv-webui/react-api-omv/generated";
import {
  Button,
  CapacityMeter,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
  SearchField,
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
import { useQueryClient } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useForegroundRead } from "../../hooks/useMonitoringReads.ts";
import { pageOf } from "../../logs/logView.ts";
import {
  isStateLetter,
  loadAverages,
  memoryFigures,
  nextProcessSort,
  PROCESS_PAGE_SIZES,
  processCounts,
  PROCESSES_POLL_MS,
  processRows,
  searchProcesses,
  sortProcesses,
  swapFigures,
  type ProcessRow,
  type ProcessSortField,
} from "../../processes/processes.ts";
import { processesView } from "../../processes/processesViewStore.ts";
import { useSession } from "../../session/sessionContext.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

const TOP_REQUEST = { format: "json" } as const;
const SEARCH_DELAY_MS = 200;

const COLUMNS = [
  { field: "command", label: "processes.col.program", numeric: false },
  { field: "cpu", label: "processes.col.cpu", numeric: true },
  { field: "memory", label: "processes.col.memory", numeric: true },
  { field: "state", label: "processes.col.state", numeric: false },
  { field: "user", label: "processes.col.user", numeric: false },
  { field: "cpuTime", label: "processes.col.time", numeric: false },
  { field: "pid", label: "processes.col.pid", numeric: true },
] as const satisfies readonly {
  field: ProcessSortField;
  label: `processes.col.${string}`;
  numeric: boolean;
}[];

export function ProcessesPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("processes.title")} />;
  }
  return <Processes />;
}

function NotReported() {
  const { t } = useTranslation();
  return (
    <span className="text-muted-foreground">{t("common.notReported")}</span>
  );
}

function Summary({ top }: { top: TopInfo | undefined }) {
  const { t } = useTranslation();
  const format = useFormat();
  const titleId = useId();
  if (top === undefined) {
    return (
      <Card render={<section aria-labelledby={titleId} />}>
        <CardHeader>
          <CardTitle id={titleId}>{t("processes.summary")}</CardTitle>
        </CardHeader>
        <CardContent aria-busy="true">
          <FactListSkeleton rows={4} />
        </CardContent>
      </Card>
    );
  }
  const counts = processCounts(top);
  const memory = memoryFigures(top);
  const swap = swapFigures(top);
  const load = loadAverages(top);
  const meterText = (f: { used: number; total: number; percent: number }) =>
    t("processes.memoryValue", {
      used: formatBytes(f.used),
      total: formatBytes(f.total),
      percent: format.percent(f.percent),
    });
  return (
    <Card render={<section aria-labelledby={titleId} />}>
      <CardHeader>
        <CardTitle id={titleId}>{t("processes.summary")}</CardTitle>
      </CardHeader>
      <CardContent>
        <FactList>
          <FactListItem>
            <FactListLabel>{t("processes.count")}</FactListLabel>
            <FactListValue className="tabular-nums">
              {counts === null ? (
                <NotReported />
              ) : (
                <>
                  {t("processes.countValue", {
                    total: format.count(counts.total),
                    running: format.count(counts.running),
                    sleeping: format.count(counts.sleeping),
                  })}
                  {counts.stopped > 0
                    ? t("processes.countStopped", { count: counts.stopped })
                    : null}
                  {counts.zombie > 0
                    ? t("processes.countZombie", { count: counts.zombie })
                    : null}
                </>
              )}
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("processes.memory")}</FactListLabel>
            <FactListValue>
              {memory === null ? (
                <NotReported />
              ) : (
                <div className="flex flex-col gap-1">
                  <CapacityMeter
                    label={
                      <span className="sr-only">{t("processes.memory")}</span>
                    }
                    value={memory.used}
                    max={memory.total}
                    valueText={meterText(memory)}
                  />
                  {memory.cache === null ? null : (
                    <p className="text-sm text-muted-foreground">
                      {t("processes.cache", {
                        cache: formatBytes(memory.cache),
                      })}
                    </p>
                  )}
                </div>
              )}
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("processes.swap")}</FactListLabel>
            <FactListValue>
              {swap === null ? (
                <NotReported />
              ) : swap === "none" ? (
                t("processes.swapNone")
              ) : (
                <div className="flex flex-col gap-1">
                  <CapacityMeter
                    label={
                      <span className="sr-only">{t("processes.swap")}</span>
                    }
                    value={swap.used}
                    max={swap.total}
                    valueText={meterText(swap)}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("processes.swapHint")}
                  </p>
                </div>
              )}
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("processes.load")}</FactListLabel>
            <FactListValue className="tabular-nums">
              {load === null ? (
                <NotReported />
              ) : (
                t("dashboard.live.loadValue", load)
              )}
            </FactListValue>
          </FactListItem>
        </FactList>
      </CardContent>
    </Card>
  );
}

function StateWord({ letter }: { letter: string }) {
  const { t } = useTranslation();
  return isStateLetter(letter) ? (
    <>{t(`processes.state.${letter}`)}</>
  ) : (
    <span className="font-mono text-sm">{letter}</span>
  );
}

function ProcessRowView({ row }: { row: ProcessRow }) {
  const format = useFormat();
  return (
    <TableRow>
      <TableCell
        dir="auto"
        className="min-w-48 align-top font-mono text-sm [overflow-wrap:anywhere]"
      >
        {row.command}
      </TableCell>
      <TableCell numeric className="align-top">
        {row.cpu === null ? <NotReported /> : format.percent(row.cpu)}
      </TableCell>
      <TableCell numeric className="align-top whitespace-nowrap">
        {row.memory === null ? <NotReported /> : formatBytes(row.memory)}
      </TableCell>
      <TableCell className="align-top">
        <StateWord letter={row.state} />
      </TableCell>
      <TableCell dir="auto" className="align-top break-words">
        {row.user}
      </TableCell>
      <TableCell mono className="align-top tabular-nums">
        {row.cpuTimeText}
      </TableCell>
      <TableCell numeric mono className="align-top">
        {row.pidText}
      </TableCell>
    </TableRow>
  );
}

function Processes() {
  const { t } = useTranslation();
  const format = useFormat();
  const view = useMemoryStore(processesView);
  const read = useForegroundRead();
  const searchRef = useRef<HTMLInputElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const [sortAnnouncement, setSortAnnouncement] = useState("");
  const queryClient = useQueryClient();
  const frozen =
    view.paused &&
    queryClient.getQueryData(getSystemGetTopInfoQueryKey(TOP_REQUEST)) !==
      undefined;

  const top = useSystemGetTopInfo(TOP_REQUEST, {
    request: { background: true },
    query: {
      // While paused nothing reads: not the timer, not focus, not a finished task elsewhere. The
      // frozen list stays for the session.
      enabled: !frozen,
      refetchInterval: view.paused ? false : PROCESSES_POLL_MS,
      gcTime: Number.POSITIVE_INFINITY,
    },
  });

  useEffect(() => {
    if (view.searchInput === view.search) {
      return undefined;
    }
    const timer = window.setTimeout(
      () => processesView.set({ search: view.searchInput, page: 0 }),
      SEARCH_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [view.searchInput, view.search]);

  const data = top.data;
  const rows = useMemo(() => (data ? processRows(data.processes) : []), [data]);
  const sorted = useMemo(
    () => sortProcesses(rows, view.sort),
    [rows, view.sort],
  );
  const matching = searchProcesses(sorted, view.search);
  const page = pageOf(matching, view.page, view.pageSize);
  const time = format.clock(top.dataUpdatedAt);
  const searching = view.search.trim() !== "";

  const readNow = () => void read(getSystemGetTopInfoQueryOptions(TOP_REQUEST));
  const togglePause = () => {
    if (view.paused) {
      processesView.set({ paused: false });
      setAnnouncement(t("processes.fresh", { time }));
      // Resuming reads at once, in the foreground: the reader asked.
      readNow();
    } else {
      processesView.set({ paused: true });
      setAnnouncement(t("processes.paused", { time }));
    }
  };

  const changeSearch = (value: string) => {
    processesView.set(
      value === ""
        ? { searchInput: "", search: "", page: 0 }
        : { searchInput: value },
    );
  };
  const clearSearch = () => {
    changeSearch("");
    searchRef.current?.focus();
  };
  const sortBy = (field: ProcessSortField, label: string) => {
    const sort = nextProcessSort(view.sort, field);
    processesView.set({ sort, page: 0 });
    setSortAnnouncement(
      t("table.sorted", {
        column: label,
        direction: t(
          sort.direction === "asc" ? "table.ascending" : "table.descending",
        ),
      }),
    );
  };

  if (data === undefined && top.isError) {
    return (
      <Frame>
        <ReadFailed
          error={top.error}
          onRetry={readNow}
          retrying={top.isFetching}
        >
          {t("processes.loadFailed")}
        </ReadFailed>
      </Frame>
    );
  }

  const loading = data === undefined;
  const stale = top.isRefetchError && !view.paused;
  let body;
  if (loading) {
    body = <TableSkeletonRows rows={10} columns={COLUMNS.length} />;
  } else if (matching.length === 0) {
    body = (
      <TableStateRow colSpan={COLUMNS.length}>
        <EmptyState
          variant="filtered"
          action={
            <Button variant="neutral" onClick={clearSearch}>
              {t("processes.clearSearch")}
            </Button>
          }
        >
          {t("processes.filteredEmpty", { search: view.search.trim() })}
        </EmptyState>
      </TableStateRow>
    );
  } else {
    body = page.rows.map((row) => <ProcessRowView key={row.key} row={row} />);
  }

  return (
    <Frame>
      {loading ? (
        <p role="status" className="sr-only">
          {t("processes.loading")}
        </p>
      ) : null}
      <Summary top={data} />

      {loading ? null : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
          <p>
            {view.paused
              ? t("processes.paused", { time })
              : stale
                ? t("processes.stale", { time })
                : t("processes.fresh", { time })}
          </p>
          <Button variant="neutral" size="sm" onClick={togglePause}>
            {view.paused ? (
              <Play aria-hidden="true" />
            ) : (
              <Pause aria-hidden="true" />
            )}
            {view.paused ? t("processes.resume") : t("processes.pause")}
          </Button>
          {stale ? (
            <Button
              variant="neutral"
              size="sm"
              loading={top.isFetching}
              onClick={readNow}
            >
              {t("common.tryAgain")}
            </Button>
          ) : null}
          <p role="status" className="sr-only">
            {announcement}
          </p>
        </div>
      )}

      <div>
        <TableToolbar>
          <SearchField
            ref={searchRef}
            size="sm"
            label={t("processes.search")}
            placeholder={t("processes.searchPlaceholder")}
            clearLabel={t("processes.clearSearch")}
            value={view.searchInput}
            onValueChange={changeSearch}
            disabled={loading}
            className="max-w-sm flex-1 basis-56"
          />
        </TableToolbar>
        <Table
          aria-label={t("processes.tableLabel")}
          frameLabel={t("processes.tableLabel")}
          busy={loading}
          busyLabel={t("processes.loading")}
        >
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => {
                const label = t(column.label);
                return (
                  <TableHead
                    key={column.field}
                    numeric={column.numeric}
                    sort={
                      view.sort.field === column.field
                        ? view.sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    onSort={() => sortBy(column.field, label)}
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
          {sortAnnouncement}
        </p>
        <p className="pt-2 text-sm text-muted-foreground">
          {t("processes.stateNote")}
        </p>
        {matching.length > 0 ? (
          <TablePagination
            aria-label={t("processes.pages")}
            page={page.page}
            pageCount={page.pageCount}
            onPageChange={(next) => processesView.set({ page: next })}
            range={t(searching ? "table.rangeMatching" : "table.range", {
              from: format.count(page.from),
              to: format.count(page.to),
              total: format.count(matching.length),
            })}
            pageSize={view.pageSize}
            pageSizeOptions={PROCESS_PAGE_SIZES}
            onPageSizeChange={(pageSize) =>
              processesView.set({ pageSize, page: 0 })
            }
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
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageTitle>{t("processes.title")}</PageTitle>
      <p className="max-w-prose">{t("processes.intro")}</p>
      {children}
    </div>
  );
}
