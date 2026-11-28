// SPDX-License-Identifier: GPL-3.0-or-later
// The people on the Users page (phase 5 users design 1.2 items 5 to 7, 1.3, 1.4, 1.6): the toolbar
// (search, the Show filter, "Add a person"), the table searched, filtered, sorted and paged at 50 in
// the browser (the list is read whole, D2), and its states. The table's choices live in this view only:
// never in the address (UI-4) or storage (UI-13). A narrow table stacks: the name at the top and every
// other column a line under it with its word ("Table"). Everything from the server is text (UI-2); a name with no page here (`add`) is shown as text with the classic list's link.
import type {
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  buttonClass,
  EmptyState,
  InlineAlert,
  PairStack,
  SearchField,
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  ServerMessage,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
  TableStateRow,
  TableToolbar,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { isAdministrator, sshAllowed } from "../../users/userModel.ts";
import {
  DEFAULT_USERS_SORT,
  groupsColumn,
  nextUsersSort,
  pageOf,
  USERS_PAGE_SIZE,
  USERS_PAGE_SIZES,
  USERS_SHOW,
  visibleUsers,
  type UsersShow,
  type UsersSort,
  type UsersSortField,
} from "../../users/usersList.ts";
import { PersonLink } from "../atoms/PersonLink.tsx";
import { ClampedText } from "../molecules/ClampedText.tsx";

const COLUMNS = [
  { field: "name", label: "users.col.name" },
  { field: "description", label: "users.col.description" },
  { field: "email", label: "users.col.email" },
  { field: null, label: "users.col.groups" },
  { field: "admin", label: "users.col.admin" },
  { field: "ssh", label: "users.col.ssh" },
] as const satisfies readonly {
  field: UsersSortField | null;
  label: `users.col.${string}`;
}[];

function None() {
  const { t } = useTranslation();
  return <span className="text-muted-foreground">{t("common.none")}</span>;
}

interface GroupsRead {
  data: readonly UserGroup[] | undefined;
  failed: boolean;
  error: unknown;
  retrying: boolean;
  retry: () => void;
}

function GroupsCell({
  user,
  groups,
}: {
  user: UserAccount;
  groups: GroupsRead;
}) {
  const { t } = useTranslation();
  if (groups.data === undefined) {
    return groups.failed ? (
      <span className="text-muted-foreground">{t("users.notKnown")}</span>
    ) : null;
  }
  const { shown, more } = groupsColumn(user, groups.data);
  if (shown.length === 0) {
    return <None />;
  }
  return (
    <span className="[overflow-wrap:anywhere]">
      {shown.map((g) => inertBidi(g)).join(", ")}
      {more > 0 ? ` ${t("users.more", { count: more })}` : null}
    </span>
  );
}

function UserRow({
  user,
  self,
  groups,
}: {
  user: UserAccount;
  /** The signed-in person's row. */
  self: boolean;
  groups: GroupsRead;
}) {
  const { t } = useTranslation();
  const comment = user.comment ?? "";
  const email = user.email ?? "";
  const ssh = sshAllowed(user) ? t("users.sshAllowed") : t("users.no");
  return (
    <TableRow>
      <TableCell narrow="title" className="@min-[40rem]:min-w-32">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <PersonLink name={user.name} className="font-medium" />
          {self ? (
            <span className="text-sm text-muted-foreground">
              {t("users.you")}
            </span>
          ) : null}
        </span>
      </TableCell>
      <TableCell
        label={t("users.col.description")}
        className="@min-[40rem]:min-w-40"
      >
        {comment === "" ? (
          <None />
        ) : (
          <ClampedText>{inertBidi(comment)}</ClampedText>
        )}
      </TableCell>
      <TableCell label={t("users.col.email")} className="@min-[40rem]:min-w-40">
        {email === "" ? (
          <None />
        ) : (
          <span className="font-mono text-sm [overflow-wrap:anywhere]">
            {inertBidi(email)}
          </span>
        )}
      </TableCell>
      <TableCell
        label={t("users.col.groups")}
        className="@min-[40rem]:min-w-32"
      >
        <GroupsCell user={user} groups={groups} />
      </TableCell>
      <TableCell label={t("users.col.admin")}>
        {isAdministrator(user) ? t("users.yes") : t("users.no")}
      </TableCell>
      <TableCell label={t("users.col.ssh")}>{ssh}</TableCell>
    </TableRow>
  );
}

export function UsersTable({
  users,
  groups,
  selfName,
  readAt,
  refreshing,
  onRefresh,
}: {
  users: readonly UserAccount[];
  groups: GroupsRead;
  /** The session's user name, for "(you)"; null when not known. */
  selfName: string | null;
  readAt: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<UsersShow>("all");
  const [sort, setSort] = useState<UsersSort>(DEFAULT_USERS_SORT);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(USERS_PAGE_SIZE);
  const [announcement, setAnnouncement] = useState("");

  const omvGroups = groups.data ?? [];
  const visible = visibleUsers(users, omvGroups, { search, show, sort });
  const shown = pageOf(visible, page, pageSize);
  const searching = search.trim() !== "";
  const noPeople = users.length === 0;

  const showItems = USERS_SHOW.map((value) => ({
    value,
    label: t(`users.show.${value}`),
  }));

  const sortBy = (field: UsersSortField, label: string) => {
    const next = nextUsersSort(sort, field);
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

  const clearSearch = () => {
    setSearch("");
    setPage(0);
    searchRef.current?.focus();
  };

  let body: ReactNode;
  if (noPeople) {
    body = (
      <TableStateRow colSpan={COLUMNS.length}>
        <EmptyState
          action={
            <Link to="/usermgmt/users/add" className={routerLinkClass}>
              {t("users.add")}
            </Link>
          }
        >
          {t("users.empty")}
        </EmptyState>
      </TableStateRow>
    );
  } else if (visible.length === 0) {
    body = (
      <TableStateRow colSpan={COLUMNS.length}>
        {searching ? (
          <EmptyState
            variant="filtered"
            action={
              <Button variant="neutral" onClick={clearSearch}>
                {t("users.clearSearch")}
              </Button>
            }
          >
            {t("users.filtered", { search: search.trim() })}
          </EmptyState>
        ) : (
          <EmptyState
            variant="filtered"
            action={
              <Button
                variant="neutral"
                onClick={() => {
                  setShow("all");
                  setPage(0);
                }}
              >
                {t("users.showAll")}
              </Button>
            }
          >
            {t("users.filteredShow")}
          </EmptyState>
        )}
      </TableStateRow>
    );
  } else {
    body = shown.rows.map((user) => (
      <UserRow
        key={user.name}
        user={user}
        self={selfName !== null && selfName === user.name}
        groups={groups}
      />
    ));
  }

  const from = visible.length === 0 ? 0 : shown.page * pageSize + 1;
  const to = Math.min(visible.length, shown.page * pageSize + pageSize);

  return (
    <PairStack>
      <TableToolbar className="items-end">
        {noPeople ? null : (
          <>
            <SearchField
              ref={searchRef}
              size="sm"
              label={t("users.search")}
              clearLabel={t("users.clearSearch")}
              value={search}
              onValueChange={(value) => {
                setSearch(value);
                setPage(0);
              }}
              className="max-w-md flex-1 basis-64"
            />
            <Select
              value={show}
              items={showItems}
              onValueChange={(next) => {
                if (next !== null) {
                  setShow(next);
                  setPage(0);
                }
              }}
            >
              <div className="flex flex-col gap-1">
                <SelectLabel>{t("users.show.label")}</SelectLabel>
                <SelectTrigger className="h-7 w-auto min-w-40 text-sm" />
              </div>
              <SelectContent>
                {showItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        <div className="ms-auto flex items-center gap-3 self-center">
          <Link
            to="/usermgmt/users/add"
            className={buttonClass({ variant: "primary" })}
          >
            {t("users.add")}
          </Link>
        </div>
      </TableToolbar>

      {groups.failed ? (
        <InlineAlert tone="critical" title={t("users.groupsFailed")}>
          {isRpcError(groups.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {groups.error.message}
            </ServerMessage>
          ) : null}
          <p>
            <Button
              variant="neutral"
              size="sm"
              loading={groups.retrying}
              onClick={groups.retry}
            >
              {t("common.tryAgain")}
            </Button>
          </p>
        </InlineAlert>
      ) : null}

      <Table
        aria-label={t("users.title")}
        busy={refreshing}
        busyLabel={t("users.loading")}
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

      {visible.length > USERS_PAGE_SIZE || shown.pageCount > 1 ? (
        <TablePagination
          aria-label={t("users.title")}
          page={shown.page}
          pageCount={shown.pageCount}
          onPageChange={setPage}
          range={t(searching ? "table.rangeMatching" : "table.range", {
            from,
            to,
            total: visible.length,
          })}
          pageSize={pageSize}
          pageSizeOptions={USERS_PAGE_SIZES}
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
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="text-xs text-muted-foreground tabular-nums">
          {refreshing ? "" : readAt}
        </p>
        <Button
          variant="ghost"
          size="sm"
          loading={refreshing}
          onClick={onRefresh}
        >
          {t("sharedFolders.refresh")}
        </Button>
      </div>
    </PairStack>
  );
}
