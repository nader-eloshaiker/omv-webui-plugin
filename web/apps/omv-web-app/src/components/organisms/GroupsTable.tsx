// SPDX-License-Identifier: GPL-3.0-or-later
// The Groups list's table (phase 5 users design 8.2 to 8.4): getGroupList read whole, with the people
// (getUserList) for the members' names and the shared folders (ShareMgmt.getList) for how many each
// group can open; searched, sorted and paged at 50 in the browser (D2). Read on opening, Refresh and
// window focus. A side read failing takes away only what it feeds: members by count only, the folders
// column "Not known". The search, sort and page are transient UI state, held here, never in the
// address (UI-4). Everything from the server is text (UI-2).
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  buttonClass,
  EmptyState,
  ExternalLink,
  InlineAlert,
  PairStack,
  SearchField,
  ServerMessage,
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
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useFormat } from "../../format/useFormat.ts";
import { groupHasPage } from "../../groups/groupPage.ts";
import {
  GROUP_PAGE_SIZE,
  GROUP_PAGE_SIZES,
  groupListRows,
  INITIAL_GROUP_SORT,
  nextGroupSort,
  pageOfGroups,
  searchGroups,
  sortGroups,
  type GroupListRow,
  type GroupSortField,
} from "../../groups/groupsTable.ts";
import { useNamesText } from "../../hooks/useNamesText.ts";
import {
  useSharedFoldersAll,
  useUserAccounts,
  useUserGroups,
} from "../../hooks/useSharesReads.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { ClampedText } from "../molecules/ClampedText.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";

const COLUMNS = [
  { field: "name", label: "groups.col.name" },
  { field: "comment", label: "groups.col.description" },
  { field: "members", label: "groups.col.members" },
  { field: "folders", label: "groups.col.folders" },
] as const satisfies readonly {
  field: GroupSortField;
  label: `groups.col.${string}`;
}[];

/** At most three names in the Members column (8.2). */
const MEMBERS_SHOWN = 3;

function GroupName({ name }: { name: string }) {
  const { t } = useTranslation();
  if (!groupHasPage(name)) {
    return (
      <span dir="auto" className="font-medium break-words">
        {inertBidi(name)}
      </span>
    );
  }
  return (
    <Link
      to="/usermgmt/groups/$group"
      params={{ group: name }}
      aria-label={t("groups.open", { group: inertBidi(name) })}
      dir="auto"
      className={`font-medium break-words ${routerLinkClass}`}
    >
      {inertBidi(name)}
    </Link>
  );
}

function GroupRow({
  row,
  namesKnown,
}: {
  row: GroupListRow;
  /** getUserList was read: the members are named; else by count only (8.3). */
  namesKnown: boolean;
}) {
  const { t } = useTranslation();
  const namesText = useNamesText();
  const count = row.members.length;
  const members =
    count === 0
      ? t("groups.nobody")
      : namesKnown
        ? t("groups.members", {
            count,
            list: namesText(row.members, MEMBERS_SHOWN),
          })
        : t("groups.membersCount", { count });
  const folders =
    row.folders === null ? (
      <span className="text-muted-foreground">{t("groups.notKnown")}</span>
    ) : row.folders === 0 ? (
      t("groups.none")
    ) : (
      <span className="tabular-nums">{row.folders}</span>
    );
  const description =
    row.comment === "" ? (
      <span className="text-muted-foreground">{t("groups.none")}</span>
    ) : (
      <ClampedText>{inertBidi(row.comment)}</ClampedText>
    );
  return (
    <TableRow>
      {/* A narrow table stacks: the name at the top, every other column a line under it (8.2). */}
      <TableCell narrow="title" className="@min-[40rem]:min-w-32">
        <GroupName name={row.name} />
      </TableCell>
      <TableCell
        label={t("groups.col.description")}
        className="text-muted-foreground @min-[40rem]:min-w-40"
      >
        <span dir="auto">{description}</span>
      </TableCell>
      <TableCell
        label={t("groups.col.members")}
        className="@min-[40rem]:min-w-40"
      >
        {members}
      </TableCell>
      <TableCell label={t("groups.col.folders")}>{folders}</TableCell>
    </TableRow>
  );
}

export function GroupsTable() {
  const { t } = useTranslation();
  const format = useFormat();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(INITIAL_GROUP_SORT);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(GROUP_PAGE_SIZE);
  const [announcement, setAnnouncement] = useState("");

  const groups = useUserGroups({ focus: true });
  const users = useUserAccounts({ focus: true });
  const folders = useSharedFoldersAll({ focus: true });

  const refresh = () => {
    void groups.refetch();
    void users.refetch();
    void folders.refetch();
  };

  const data = groups.data?.data;
  const firstLoad = data === undefined && !groups.isError;
  const failed = data === undefined && groups.isError;
  const namesKnown = users.data !== undefined;
  const foldersFailed = folders.isError && folders.data === undefined;
  const usersFailed = users.isError && users.data === undefined;

  const all = data === undefined ? [] : groupListRows(data, folders.data?.data);
  const searching = search.trim() !== "";
  const matching = sortGroups(searchGroups(all, search), sort);
  const shown = pageOfGroups(matching, page, pageSize);

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(0);
  };
  const clearSearch = () => {
    changeSearch("");
    searchRef.current?.focus();
  };
  const sortBy = (field: GroupSortField, label: string) => {
    const next = nextGroupSort(sort, field);
    setSort(next);
    setPage(0);
    setAnnouncement(
      t("table.sorted", {
        column: label,
        direction: t(
          next.direction === "asc" ? "table.ascending" : "table.descending",
        ),
      }),
    );
  };

  if (failed) {
    return (
      <ReadFailed
        error={groups.error}
        retrying={groups.isFetching}
        onRetry={refresh}
      >
        {t("groups.loadFailed")}
      </ReadFailed>
    );
  }
  const noGroups = data !== undefined && data.length === 0;
  if (noGroups) {
    return (
      <EmptyState
        action={
          <Link to="/usermgmt/groups/add" className={routerLinkClass}>
            {t("groups.add")}
          </Link>
        }
      >
        {t("groups.empty")}
      </EmptyState>
    );
  }

  let body;
  if (firstLoad) {
    body = <TableSkeletonRows rows={5} columns={COLUMNS.length} />;
  } else if (matching.length === 0) {
    body = (
      <TableStateRow colSpan={COLUMNS.length}>
        <EmptyState
          variant="filtered"
          action={
            <Button variant="neutral" onClick={clearSearch}>
              {t("groups.clearSearch")}
            </Button>
          }
        >
          {t("groups.filtered", { search: search.trim() })}
        </EmptyState>
      </TableStateRow>
    );
  } else {
    body = shown.rows.map((row) => (
      <GroupRow key={row.name} row={row} namesKnown={namesKnown} />
    ));
  }
  const noPage = all.filter((r) => !groupHasPage(r.name));

  return (
    <PairStack>
      <TableToolbar className="items-start">
        <SearchField
          ref={searchRef}
          size="sm"
          label={t("groups.search")}
          clearLabel={t("groups.clearSearch")}
          value={search}
          onValueChange={changeSearch}
          className="max-w-md flex-1 basis-64"
        />
        <div className="ms-auto flex items-center gap-3 self-center">
          <Link
            to="/usermgmt/groups/add"
            className={buttonClass({ variant: "primary" })}
          >
            {t("groups.add")}
          </Link>
        </div>
      </TableToolbar>

      {usersFailed || foldersFailed ? (
        <InlineAlert tone="neutral">
          {usersFailed ? <p>{t("groups.membersFailed")}</p> : null}
          {foldersFailed ? <p>{t("groups.foldersFailed")}</p> : null}
          {usersFailed && isRpcError(users.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {users.error.message}
            </ServerMessage>
          ) : null}
          {foldersFailed && isRpcError(folders.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {folders.error.message}
            </ServerMessage>
          ) : null}
          <p>
            <Button
              variant="neutral"
              size="sm"
              loading={users.isFetching || folders.isFetching}
              onClick={refresh}
            >
              {t("common.tryAgain")}
            </Button>
          </p>
        </InlineAlert>
      ) : null}

      {noPage.map((r) => (
        <InlineAlert key={r.name} tone="neutral">
          <p>
            <bdi dir="auto" className="font-mono">
              {inertBidi(r.name)}
            </bdi>
            {": "}
            {t("groups.addNameNoPage")}{" "}
            <ExternalLink href={CLASSIC.groups} newTabLabel={t("app.newTab")}>
              {t("groups.classicLink")}
            </ExternalLink>
          </p>
        </InlineAlert>
      ))}

      <Table
        aria-label={t("groups.tableLabel")}
        busy={firstLoad}
        busyLabel={t("groups.loading")}
      >
        <TableHeader>
          <TableRow>
            {COLUMNS.map(({ field, label }) => {
              const text = t(label);
              return (
                <TableHead
                  key={field}
                  sort={
                    sort.field === field
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  onSort={() => sortBy(field, text)}
                >
                  {text}
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
      {firstLoad ? (
        <p role="status" className="sr-only">
          {t("groups.loading")}
        </p>
      ) : null}

      {matching.length > GROUP_PAGE_SIZE ? (
        <TablePagination
          aria-label={t("groups.pages")}
          page={shown.page}
          pageCount={shown.pageCount}
          onPageChange={setPage}
          range={t(searching ? "table.rangeMatching" : "table.range", {
            from: shown.from,
            to: shown.to,
            total: matching.length,
          })}
          pageSize={pageSize}
          pageSizeOptions={GROUP_PAGE_SIZES}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(0);
          }}
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
      {data === undefined ? null : (
        <TableLastRefreshed
          action={
            <Button
              variant="ghost"
              size="sm"
              loading={groups.isFetching}
              onClick={refresh}
            >
              {t("groups.refresh")}
            </Button>
          }
        >
          {t("groups.lastRefreshed", {
            time: format.clock(groups.dataUpdatedAt),
          })}
        </TableLastRefreshed>
      )}
    </PairStack>
  );
}
