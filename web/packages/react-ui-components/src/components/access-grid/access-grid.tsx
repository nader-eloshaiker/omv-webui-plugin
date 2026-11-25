// SPDX-License-Identifier: GPL-3.0-or-later
import { CircleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { EmptyState } from "../empty-state/empty-state";
import { SearchField } from "../search-field/search-field";
import {
  SegmentedChoice,
  type SegmentedChoiceOption,
} from "../segmented-choice/segmented-choice";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "../select/select";
import { Skeleton } from "../skeleton/skeleton";
import {
  TablePagination,
  type PageStep,
} from "../table-pagination/table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "../table/table";
import { Identifier } from "../text/identifier";

/** What the grid hands the app's link: spread it onto the router's link element. */
interface AccessGridNameLinkProps {
  /** The link's accessible name, from the row's `nameLink`. */
  "aria-label": string;
  /** The link's look; pass it on. */
  className: string;
  /** The name, in the mono face and its own direction. */
  children: React.ReactNode;
}

/**
 * Makes a row's name a link to its own page. The library knows no router: the app renders its own
 * link with the props it is given, for example
 * `render: (props) => <Link to="/storage/shared-folders/$uuid" params={{ uuid }} {...props} />`.
 */
interface AccessGridNameLink {
  /**
   * The link's accessible name, which contains the name as shown (WCAG 2.5.3): "Open shared folder
   * Photos".
   */
  "aria-label": string;
  render: (props: AccessGridNameLinkProps) => React.ReactElement;
}

interface AccessGridRow<V extends string = string> {
  /** Stable and unique across the grid: "group:family", "user:alex". */
  id: string;
  /** From the backend: shown in the mono face, in its own direction, never cut short. Searched. */
  name: string;
  /** A second line under the name (a person's description). Searched. */
  description?: string;
  /** Lines under the name: "Also gets Read and write as a member of family." */
  notes?: readonly React.ReactNode[];
  /** The name as a link to the row's own page (a shared folder's, a person's). */
  nameLink?: AccessGridNameLink;
  /**
   * What the row is, in words: "Group", "User", "Windows and Mac", or a `StatusPill` with its word
   * for a folder that is not OK. It wraps inside its column, at 320px too.
   */
  kind: React.ReactNode;
  /** The value shown now, saved or changed in the grid. */
  value: V;
  /** The saved value. The row is changed while `value` differs from it, unless `changed` is given. */
  initialValue?: V;
  /** Whether the row is changed, when the app decides it rather than `initialValue`. */
  changed?: boolean;
  /**
   * The values this row offers, in the order of `options`, when not the grid's `normalValues`: a
   * value that can be kept but not chosen anew (Blocked) is offered only on a row that holds it.
   */
  allowedValues?: readonly V[];
  /** Why this row cannot be changed now, shown as text in the row and given as its description. */
  unavailableReason?: React.ReactNode;
  /**
   * Why the last save did not write this row, while the row keeps its change and stays editable:
   * "alex is the only one with access to Photos, which is shared with Windows and Mac computers. Give
   * someone else access on its page, or stop sharing it, first." Shown in the row with the error
   * mark, given as the choice's description, and announced when it appears. Clear it when the row
   * is changed again or saved.
   */
  refusal?: React.ReactNode;
}

type AccessGridShow = "all" | "withAccess" | "changed";

interface AccessGridProps<V extends string = string> {
  /** The table's name: "Who can use media". */
  "aria-label": string;
  /** The column headers: Name, Kind, Access. */
  columns: {
    name: React.ReactNode;
    kind: React.ReactNode;
    access: React.ReactNode;
  };
  /** Every value the grid knows, with its words, in the order they are drawn. */
  options: readonly SegmentedChoiceOption<V>[];
  /**
   * The values offered on every row and in "Set all shown to". Defaults to every value of `options`.
   * A row whose value is outside this set is never changed by "Set all shown to".
   */
  normalValues?: readonly V[];
  /** The values that count as having access, for the "With access" filter. */
  accessValues: readonly V[];
  /** In the order the app gives (groups first, then people, each by name). */
  rows: readonly AccessGridRow<V>[];
  /** One row's choice changed. A change in the grid, not a save. */
  onChange: (id: string, value: V) => void;
  /**
   * "Apply to N shown" was pressed: the rows to set, which are the rows shown after search and
   * filter (on every page) that can take `value`: never an unavailable row, never one whose value is
   * outside `normalValues`. A change in the grid, not a save.
   */
  onSetAll: (ids: readonly string[], value: V) => void;
  /** Each row's choice is named by this: (name) => "Access for alex". */
  rowLabel: (name: string) => string;
  /** The neutral word after a changed row's choice: "Changed". */
  changedLabel: React.ReactNode;
  /** The search field: "Search people and groups", and its clear button, "Clear the search". */
  search: { label: React.ReactNode; clearLabel: string };
  /** The "Show" filter and its three choices: "Everyone", "With access", "Changed". */
  show: {
    label: React.ReactNode;
    all: React.ReactNode;
    withAccess: React.ReactNode;
    changed: React.ReactNode;
  };
  /** "Set all shown to" and its button: (count) => "Apply to 12 shown". */
  setAll: {
    label: React.ReactNode;
    applyLabel: (count: number) => React.ReactNode;
  };
  /** The count line: (shown, total) => "12 of 40 people and groups." Announced politely. */
  countText: (shown: number, total: number) => React.ReactNode;
  /** Nothing matches: (search) => "No people or groups match "zz".", and the button that clears it. */
  filteredEmpty: {
    message: (search: string) => React.ReactNode;
    clearLabel: React.ReactNode;
  };
  /**
   * Paging in the browser, used at more than 50 rows: the region's name, the rows-per-page label, the
   * step buttons, and (first, last, shown) => "1–50 of 132".
   */
  pagination: {
    "aria-label": string;
    pageSizeLabel: React.ReactNode;
    previous: PageStep;
    next: PageStep;
    range: (first: number, last: number, shown: number) => React.ReactNode;
  };
  /** The lists are being read: five skeleton rows, and this announced: "Loading people and groups…". */
  loading?: { label: string };
  /** The lists could not be read: what failed, the server's words and a retry. */
  error?: {
    message: React.ReactNode;
    serverMessage?: { label: React.ReactNode; text: string };
    retryLabel: React.ReactNode;
    onRetry: () => void;
  };
  /** There are no rows at all: one sentence and, if any, the control that makes some. */
  empty: { message: React.ReactNode; action?: React.ReactNode };
  /** A save is running: every row is unavailable and says this: "Saving…". */
  saving?: { label: React.ReactNode };
  /** The search the grid opens with; afterwards the grid holds it. */
  defaultSearch?: string;
  /** The filter the grid opens with: "all" unless given. */
  defaultShow?: AccessGridShow;
  className?: string;
}

/** Above this many rows the grid pages in the browser (phase 5 shares design 3.2). */
const PAGE_THRESHOLD = 50;
const PAGE_SIZES = [25, 50, 100] as const;

// One CSS grid for the whole table, so the rows line up through subgrid while each row can still
// change shape: from 42rem a row is Name | Kind | Access; below it, Name and Kind share a line and the
// choice moves under them at the full width (320px, 200% zoom), so nothing scrolls sideways. A table
// whose display changes keeps its semantics only through explicit roles, so each part states its own.
const tableClass =
  "grid grid-cols-1 @2xl:grid-cols-[minmax(0,1fr)_auto_max-content]";
const rowGroupClass = "grid @2xl:col-span-3 @2xl:grid-cols-subgrid";
// The name as a link: Sky's link ink, underlined so it is not colour alone (style guide 6).
const nameLinkClass =
  "rounded-sm text-link underline underline-offset-2 hover:no-underline";
const rowClass =
  "relative grid grid-cols-[minmax(0,1fr)_auto] @2xl:col-span-3 @2xl:grid-cols-subgrid";

function matches(row: AccessGridRow, query: string) {
  if (query === "") {
    return true;
  }
  return (
    row.name.toLocaleLowerCase().includes(query) ||
    (row.description?.toLocaleLowerCase().includes(query) ?? false)
  );
}

function hasReason(reason: React.ReactNode) {
  return reason !== undefined && reason !== null && reason !== false;
}

function isChanged<V extends string>(row: AccessGridRow<V>) {
  return (
    row.changed ??
    (row.initialValue !== undefined && row.initialValue !== row.value)
  );
}

interface GridRowProps<V extends string> {
  row: AccessGridRow<V>;
  options: readonly SegmentedChoiceOption<V>[];
  allowed: readonly V[];
  rowLabel: (name: string) => string;
  changedLabel: React.ReactNode;
  reason: React.ReactNode;
  onChange: (id: string, value: V) => void;
}

function GridRow<V extends string>({
  row,
  options,
  allowed,
  rowLabel,
  changedLabel,
  reason,
  onChange,
}: GridRowProps<V>) {
  const id = React.useId();
  const reasonId = `${id}-reason`;
  const changedId = `${id}-changed`;
  const refusalId = `${id}-refusal`;
  const changed = isChanged(row);
  const unavailable = hasReason(reason);
  const refused = hasReason(row.refusal);
  const rowOptions = options.filter((option) => allowed.includes(option.value));
  const describedBy =
    [
      unavailable ? reasonId : null,
      refused ? refusalId : null,
      changed ? changedId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const nameClass = "max-w-full self-start font-medium";
  return (
    <TableRow
      role="row"
      data-changed={changed || undefined}
      data-unavailable={unavailable || undefined}
      data-refused={refused || undefined}
      className={cn(
        rowClass,
        // The changed mark: the row's leading edge in the control ink, beside the word "Changed".
        changed &&
          "before:absolute before:inset-y-0 before:start-0 before:w-1 before:bg-input",
      )}
    >
      <th
        scope="row"
        role="rowheader"
        className="flex min-w-0 flex-col gap-0.5 px-3 py-2 text-start font-regular"
      >
        {/* In its own direction, but at the column's start: a right-to-left name keeps its order
            without jumping to the far edge of a left-to-right table. */}
        {row.nameLink ? (
          row.nameLink.render({
            "aria-label": row.nameLink["aria-label"],
            className: cn(nameClass, nameLinkClass),
            children: <Identifier dir="auto">{row.name}</Identifier>,
          })
        ) : (
          <Identifier dir="auto" className={cn(nameClass, "text-foreground")}>
            {row.name}
          </Identifier>
        )}
        {row.description ? (
          <span
            dir="auto"
            className="max-w-full self-start text-sm [overflow-wrap:anywhere] text-muted-foreground"
          >
            {row.description}
          </span>
        ) : null}
        {row.notes?.map((note, position) => (
          <span
            key={`note-${String(position)}`}
            className="text-sm [overflow-wrap:anywhere] text-muted-foreground"
          >
            {note}
          </span>
        ))}
        {unavailable ? (
          <span id={reasonId} className="text-sm text-foreground">
            {reason}
          </span>
        ) : null}
        {/* Always in the row, so a refusal that appears after a save is announced. */}
        <span role="alert" className="empty:hidden">
          {refused ? (
            <span
              id={refusalId}
              data-slot="access-grid-refusal"
              className="flex items-start gap-1.5 text-sm [overflow-wrap:anywhere] text-critical-label"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-critical-stroke"
              />
              <span className="min-w-0">{row.refusal}</span>
            </span>
          ) : null}
        </span>
      </th>
      <TableCell
        role="cell"
        // Status words and a pill wrap inside the cell, which never takes more than its share of a
        // narrow row from the name beside it.
        className="flex h-auto max-w-40 min-w-0 flex-wrap content-start items-start gap-x-2 gap-y-1 py-2 [overflow-wrap:anywhere] text-foreground @2xl:max-w-56 @2xl:content-center @2xl:items-center"
      >
        {row.kind}
      </TableCell>
      <TableCell
        role="cell"
        className="col-span-2 flex h-auto flex-wrap items-center gap-x-3 gap-y-1 pb-2 @2xl:col-span-1 @2xl:py-1.5"
      >
        <SegmentedChoice<V>
          size="sm"
          options={rowOptions}
          value={row.value}
          onValueChange={(value) => onChange(row.id, value)}
          aria-label={rowLabel(row.name)}
          aria-describedby={describedBy}
          disabled={unavailable}
          className="min-w-0 flex-1"
        />
        {changed ? (
          <span
            id={changedId}
            data-slot="access-grid-changed"
            className="text-sm font-medium text-muted-foreground"
          >
            {changedLabel}
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }, (_, row) => (
        <tr
          key={`skeleton-${String(row)}`}
          aria-hidden="true"
          data-slot="table-skeleton-row"
          className={cn(rowClass, "border-t border-border first:border-t-0")}
        >
          <td className="px-3 py-2">
            <Skeleton className="w-2/3" />
          </td>
          <td className="px-3 py-2">
            <Skeleton className="w-12" />
          </td>
          <td className="col-span-2 px-3 pb-2 @2xl:col-span-1 @2xl:py-1.5">
            <Skeleton shape="block" className="h-control-sm w-72 max-w-full" />
          </td>
        </tr>
      ))}
    </>
  );
}

function StateRow({ children }: { children: React.ReactNode }) {
  return (
    <tr role="row" data-slot="table-state-row" className="@2xl:col-span-3">
      <td role="cell" className="block">
        {children}
      </td>
    </tr>
  );
}

/**
 * Who can use something (phase 5 shares design 3.2): one row per group or person, each a choice of
 * access, with search, a filter, "Set all shown to", paging in the browser past 50 rows, changed
 * marks and unavailable rows with their reason. Controlled: the app holds every row's value and
 * saves; the grid holds only the search, the filter and the page. Every word comes in through props.
 *
 * One tab stop per row (its choice), the arrow keys inside it. A row changed since the search or the
 * filter last changed stays shown until they change again, so a row never vanishes under the focus.
 */
function AccessGrid<V extends string = string>({
  "aria-label": ariaLabel,
  columns,
  options,
  normalValues,
  accessValues,
  rows,
  onChange,
  onSetAll,
  rowLabel,
  changedLabel,
  search: searchLabels,
  show: showLabels,
  setAll,
  countText,
  filteredEmpty,
  pagination,
  loading,
  error,
  empty,
  saving,
  defaultSearch = "",
  defaultShow = "all",
  className,
}: AccessGridProps<V>) {
  const [search, setSearch] = React.useState(defaultSearch);
  const [show, setShow] = React.useState<AccessGridShow>(defaultShow);
  const [kept, setKept] = React.useState<ReadonlySet<string>>(() => new Set());
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState<number>(PAGE_THRESHOLD);
  const normal = normalValues ?? options.map((option) => option.value);
  const [target, setTarget] = React.useState<V | null>(normal[0] ?? null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const query = search.trim().toLocaleLowerCase();
  const filtered = rows.filter(
    (row) =>
      kept.has(row.id) ||
      (matches(row, query) &&
        (show === "all" ||
          (show === "changed" && isChanged(row)) ||
          (show === "withAccess" && accessValues.includes(row.value)))),
  );
  const paged = rows.length > PAGE_THRESHOLD;
  const size = paged ? pageSize : Math.max(filtered.length, 1);
  const pageCount = Math.ceil(filtered.length / size);
  const current = Math.min(page, Math.max(pageCount - 1, 0));
  const visible = filtered.slice(current * size, current * size + size);

  const allowedOf = (row: AccessGridRow<V>) => row.allowedValues ?? normal;
  const eligible =
    target === null || saving
      ? []
      : filtered.filter(
          (row) =>
            !hasReason(row.unavailableReason) &&
            normal.includes(row.value) &&
            allowedOf(row).includes(target),
        );

  // A new search or filter starts again from the first page, with nothing held in view.
  const refilter = () => {
    setKept(new Set());
    setPage(0);
  };

  const change = (id: string, value: V) => {
    if (!kept.has(id)) {
      setKept(new Set(kept).add(id));
    }
    onChange(id, value);
  };

  const showItems = [
    { value: "all", label: showLabels.all },
    { value: "withAccess", label: showLabels.withAccess },
    { value: "changed", label: showLabels.changed },
  ] as const;
  const targetItems = options
    .filter((option) => normal.includes(option.value))
    .map((option) => ({ value: option.value, label: option.label }));

  let body: React.ReactNode;
  if (loading) {
    body = <SkeletonRows />;
  } else if (error) {
    body = (
      <StateRow>
        <EmptyState
          variant="error"
          serverMessage={error.serverMessage}
          action={
            <Button variant="neutral" onClick={error.onRetry}>
              {error.retryLabel}
            </Button>
          }
        >
          {error.message}
        </EmptyState>
      </StateRow>
    );
  } else if (rows.length === 0) {
    body = (
      <StateRow>
        <EmptyState action={empty.action}>{empty.message}</EmptyState>
      </StateRow>
    );
  } else if (filtered.length === 0) {
    body = (
      <StateRow>
        <EmptyState
          variant="filtered"
          action={
            <Button
              variant="neutral"
              onClick={() => {
                setSearch("");
                setShow("all");
                refilter();
                searchRef.current?.focus();
              }}
            >
              {filteredEmpty.clearLabel}
            </Button>
          }
        >
          {filteredEmpty.message(search.trim())}
        </EmptyState>
      </StateRow>
    );
  } else {
    body = visible.map((row) => (
      <GridRow<V>
        key={row.id}
        row={row}
        options={options}
        allowed={allowedOf(row)}
        rowLabel={rowLabel}
        changedLabel={changedLabel}
        reason={saving ? saving.label : row.unavailableReason}
        onChange={change}
      />
    ));
  }

  const populated = !loading && !error && rows.length > 0;

  return (
    <div
      data-slot="access-grid"
      className={cn("flex min-w-0 flex-col", className)}
    >
      {populated ? (
        <>
          <TableToolbar className="items-end gap-x-3 gap-y-2">
            <SearchField
              ref={searchRef}
              size="sm"
              label={searchLabels.label}
              clearLabel={searchLabels.clearLabel}
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                refilter();
              }}
              className="w-full sm:w-64"
            />
            <Select
              value={show}
              items={showItems}
              onValueChange={(next) => {
                if (next !== null) {
                  setShow(next);
                  refilter();
                }
              }}
            >
              <div className="flex flex-col gap-1">
                <SelectLabel>{showLabels.label}</SelectLabel>
                <SelectTrigger className="h-control-sm w-auto min-w-32 text-sm" />
              </div>
              <SelectContent>
                {showItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-end gap-2">
              <Select
                value={target}
                items={targetItems}
                disabled={saving !== undefined}
                onValueChange={(next) => {
                  if (next !== null) {
                    setTarget(next);
                  }
                }}
              >
                <div className="flex flex-col gap-1">
                  <SelectLabel>{setAll.label}</SelectLabel>
                  <SelectTrigger className="h-control-sm w-auto min-w-36 text-sm" />
                </div>
                <SelectContent>
                  {targetItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="neutral"
                size="sm"
                disabled={eligible.length === 0}
                focusableWhenDisabled
                onClick={() => {
                  if (target !== null && eligible.length > 0) {
                    const ids = eligible.map((row) => row.id);
                    setKept(new Set([...kept, ...ids]));
                    onSetAll(ids, target);
                  }
                }}
              >
                {setAll.applyLabel(eligible.length)}
              </Button>
            </div>
          </TableToolbar>
          <p
            role="status"
            data-slot="access-grid-count"
            className="pb-2 text-sm text-muted-foreground tabular-nums"
          >
            {countText(filtered.length, rows.length)}
          </p>
        </>
      ) : null}
      <Table
        role="table"
        aria-label={ariaLabel}
        busy={loading !== undefined}
        busyLabel={loading?.label}
        className={tableClass}
      >
        <TableHeader
          role="rowgroup"
          // Below 42rem every row says its kind in words and its choice is named, so the header row
          // is kept for assistive technology only.
          className="sr-only @2xl:not-sr-only @2xl:col-span-3 @2xl:grid @2xl:grid-cols-subgrid"
        >
          <TableRow
            role="row"
            className="@2xl:col-span-3 @2xl:grid @2xl:grid-cols-subgrid"
          >
            <TableHead role="columnheader" className="flex items-center">
              {columns.name}
            </TableHead>
            <TableHead role="columnheader" className="flex items-center">
              {columns.kind}
            </TableHead>
            <TableHead role="columnheader" className="flex items-center">
              {columns.access}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody role="rowgroup" className={rowGroupClass}>
          {body}
        </TableBody>
      </Table>
      {populated && paged ? (
        <TablePagination
          aria-label={pagination["aria-label"]}
          page={current}
          pageCount={pageCount}
          onPageChange={setPage}
          range={
            filtered.length === 0
              ? pagination.range(0, 0, 0)
              : pagination.range(
                  current * size + 1,
                  current * size + visible.length,
                  filtered.length,
                )
          }
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZES}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(0);
          }}
          pageSizeLabel={pagination.pageSizeLabel}
          previous={pagination.previous}
          next={pagination.next}
        />
      ) : null}
    </div>
  );
}

export { AccessGrid };
export type {
  AccessGridNameLink,
  AccessGridNameLinkProps,
  AccessGridProps,
  AccessGridRow,
  AccessGridShow,
};
