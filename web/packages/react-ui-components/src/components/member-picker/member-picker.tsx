// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { Checkbox } from "../checkbox/checkbox";
import { EmptyState } from "../empty-state/empty-state";
import { Field, FieldHint, FieldLabel } from "../field/field";
import { SearchField } from "../search-field/search-field";
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
import { Identifier } from "../text/identifier";

interface MemberPickerRow {
  /** Stable and unique across the picker: the group's or the person's name as stored. */
  id: string;
  /** From the backend: shown in the mono face, in its own direction, never cut short. Searched. */
  name: string;
  /** A second line under the name (a group's or a person's description). Searched. */
  description?: string;
  /**
   * Why this row cannot be changed now: "This is alex's main group, set outside this interface."
   * Shown as text under the name and given as the checkbox's description; the checkbox stays
   * focusable (`aria-disabled`) so the reason is heard when it is reached.
   */
  unavailableReason?: React.ReactNode;
}

type MemberPickerShow = "all" | "ticked";

interface MemberPickerProps extends Omit<
  React.ComponentProps<"div">,
  "children" | "onChange" | "defaultValue"
> {
  /**
   * The visible name of the list, above it. Leave it out when a heading of the page already names
   * it, and pass that heading's id as `aria-labelledby` (or an `aria-label`) instead.
   */
  legend?: React.ReactNode;
  /** What the list means in plain words, under the legend; it describes the list. */
  hint?: React.ReactNode;
  /** In the order the app gives (natural order of name). */
  rows: readonly MemberPickerRow[];
  /**
   * The ticked ids. Ids that are not among `rows` are kept as they are: the picker adds and removes
   * only the ids it shows.
   */
  value: readonly string[];
  /** The saved ids. A row is changed while its tick differs from them. */
  initialValue?: readonly string[];
  /** A box was ticked or cleared: the whole new list, and the one change. A change, not a save. */
  onChange: (value: string[], change: { id: string; checked: boolean }) => void;
  /** The neutral word beside a changed row's name: "Changed". */
  changedLabel: React.ReactNode;
  /** The search field: "Search groups", and its clear button, "Clear the search". */
  search: { label: React.ReactNode; clearLabel: string };
  /** The "Show" filter and its two choices: "All groups", "Groups alex is in". */
  show: {
    label: React.ReactNode;
    all: React.ReactNode;
    ticked: React.ReactNode;
  };
  /**
   * The count line, of ticked rows among all rows: (count, total) => "In 3 of 12 groups."
   * Announced politely. The count of changes not saved belongs to the caller.
   */
  countText: (count: number, total: number) => React.ReactNode;
  /** Nothing matches: (search) => "No groups match "zz".", and the button that clears it. */
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
  /** The list is being read: five skeleton lines, and this announced: "Loading groups…". */
  loading?: { label: string };
  /** The list could not be read: what failed, the server's words and a retry. */
  error?: {
    message: React.ReactNode;
    serverMessage?: { label: React.ReactNode; text: string };
    retryLabel: React.ReactNode;
    onRetry: () => void;
  };
  /** There are no rows at all: one sentence and, if any, the control that makes some. */
  empty: { message: React.ReactNode; action?: React.ReactNode };
  /**
   * A save is running: every checkbox is unavailable (still focusable) and this is shown and
   * announced once above the list, and given as every checkbox's description: "Saving…".
   */
  saving?: { label: React.ReactNode };
  /** The search the picker opens with; afterwards the picker holds it. */
  defaultSearch?: string;
  /** The filter the picker opens with: "all" unless given. */
  defaultShow?: MemberPickerShow;
}

/** Above this many rows the search and the filter are offered (phase 5 users design 4.1, 9.4). */
const TOOLS_THRESHOLD = 10;
/** Above this many rows the list pages in the browser. */
const PAGE_THRESHOLD = 50;
const PAGE_SIZES = [25, 50, 100] as const;

function hasReason(reason: React.ReactNode) {
  return reason !== undefined && reason !== null && reason !== false;
}

function matches(row: MemberPickerRow, query: string) {
  if (query === "") {
    return true;
  }
  return (
    row.name.toLocaleLowerCase().includes(query) ||
    (row.description?.toLocaleLowerCase().includes(query) ?? false)
  );
}

interface PickerRowProps {
  row: MemberPickerRow;
  checked: boolean;
  changed: boolean;
  changedLabel: React.ReactNode;
  /** The saving line's id while a save runs (every row is then unavailable and described by it). */
  savingId: string | null;
  onToggle: (id: string, checked: boolean) => void;
}

function PickerRow({
  row,
  checked,
  changed,
  changedLabel,
  savingId,
  onToggle,
}: PickerRowProps) {
  const id = React.useId();
  const changedId = `${id}-changed`;
  const ownReason = hasReason(row.unavailableReason);
  const unavailable = ownReason || savingId !== null;
  const describedBy =
    [changed ? changedId : null, savingId].filter(Boolean).join(" ") ||
    undefined;
  return (
    <li
      data-slot="member-picker-row"
      data-changed={changed || undefined}
      data-unavailable={unavailable || undefined}
      className={cn(
        "relative ps-3",
        // The changed mark: the row's leading edge in the control ink, beside the word "Changed".
        changed &&
          "before:absolute before:inset-y-0 before:start-0 before:w-1 before:bg-input",
      )}
    >
      <Field className="gap-0.5">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
          <FieldLabel
            className={cn(
              "flex min-w-0 items-start gap-2 font-regular",
              unavailable && "cursor-not-allowed text-muted-foreground",
            )}
          >
            {/* The box sits on the first line of a wrapping name; its 24px target overhangs it. */}
            <span className="flex h-[1lh] shrink-0 items-center">
              <Checkbox
                checked={checked}
                onCheckedChange={(next) => onToggle(row.id, next)}
                disabled={unavailable}
                focusableWhenDisabled
                aria-describedby={describedBy}
              />
            </span>
            {/* In its own direction, at the list's start: a right-to-left name keeps its order. */}
            <Identifier dir="auto" className="min-w-0">
              {row.name}
            </Identifier>
          </FieldLabel>
          {changed ? (
            <span
              id={changedId}
              data-slot="member-picker-changed"
              className="text-sm font-medium text-muted-foreground"
            >
              {changedLabel}
            </span>
          ) : null}
        </div>
        {row.description ? (
          <FieldHint dir="auto" className="ps-6 [overflow-wrap:anywhere]">
            {row.description}
          </FieldHint>
        ) : null}
        {ownReason ? (
          <FieldHint
            data-slot="member-picker-reason"
            className="ps-6 [overflow-wrap:anywhere] text-foreground"
          >
            {row.unavailableReason}
          </FieldHint>
        ) : null}
      </Field>
    </li>
  );
}

function SkeletonLines() {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-3 ps-3">
      {Array.from({ length: 5 }, (_, line) => (
        <li
          key={`skeleton-${String(line)}`}
          data-slot="member-picker-skeleton"
          className="flex items-center gap-2"
        >
          <Skeleton shape="block" className="size-4 shrink-0 rounded-sm" />
          <Skeleton className={line % 2 === 0 ? "w-40" : "w-28"} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Who is in what (phase 5 users design 4.1, 9.4): one checkbox per group or person, each with its
 * description under the name, and, past ten rows, a search field and a "Show: all / ticked" filter;
 * past 50 rows, paging in the browser. A count line says how many are ticked, unavailable rows say
 * why, and changed rows carry a word and an edge, as the access grid's do. Controlled: the app holds
 * the ticked ids and saves; the picker holds only the search, the filter and the page. Every word
 * comes in through props.
 *
 * The search and the filter come first, then one tab stop per checkbox; Space toggles. A row changed
 * since the search or the filter last changed stays shown until they change again, so a row never
 * vanishes under the focus.
 *
 * Not `CheckboxListField` grown up in place: that list takes its options as children, so it cannot
 * search or page them without changing its callers. This picker takes rows as data instead and
 * draws each one as that list's options are drawn.
 */
function MemberPicker({
  legend,
  hint,
  rows,
  value,
  initialValue,
  onChange,
  changedLabel,
  search: searchLabels,
  show: showLabels,
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
  "aria-labelledby": labelledByProp,
  "aria-describedby": describedByProp,
  ...props
}: MemberPickerProps) {
  const id = React.useId();
  const legendId = `${id}-legend`;
  const hintId = `${id}-hint`;
  const savingId = `${id}-saving`;
  const [search, setSearch] = React.useState(defaultSearch);
  const [show, setShow] = React.useState<MemberPickerShow>(defaultShow);
  const [kept, setKept] = React.useState<ReadonlySet<string>>(() => new Set());
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState<number>(PAGE_THRESHOLD);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const ticked = new Set(value);
  const saved = initialValue === undefined ? undefined : new Set(initialValue);
  const tools = rows.length > TOOLS_THRESHOLD;
  // Without the tools there is no search or filter to apply, whatever was typed before.
  const query = tools ? search.trim().toLocaleLowerCase() : "";
  const showing = tools ? show : "all";
  const filtered = rows.filter(
    (row) =>
      kept.has(row.id) ||
      (matches(row, query) && (showing === "all" || ticked.has(row.id))),
  );
  const paged = rows.length > PAGE_THRESHOLD;
  const size = paged ? pageSize : Math.max(filtered.length, 1);
  const pageCount = Math.ceil(filtered.length / size);
  const current = Math.min(page, Math.max(pageCount - 1, 0));
  const visible = filtered.slice(current * size, current * size + size);
  const tickedCount = rows.filter((row) => ticked.has(row.id)).length;

  // A new search or filter starts again from the first page, with nothing held in view.
  const refilter = () => {
    setKept(new Set());
    setPage(0);
  };

  const toggle = (rowId: string, checked: boolean) => {
    if (checked === ticked.has(rowId)) {
      return;
    }
    if (!kept.has(rowId)) {
      setKept(new Set(kept).add(rowId));
    }
    onChange(
      checked ? [...value, rowId] : value.filter((item) => item !== rowId),
      { id: rowId, checked },
    );
  };

  const showItems = [
    { value: "all", label: showLabels.all },
    { value: "ticked", label: showLabels.ticked },
  ] as const;

  let body: React.ReactNode;
  if (loading) {
    body = <SkeletonLines />;
  } else if (error) {
    body = (
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
    );
  } else if (rows.length === 0) {
    body = <EmptyState action={empty.action}>{empty.message}</EmptyState>;
  } else if (filtered.length === 0) {
    body = (
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
    );
  } else {
    body = (
      <ul data-slot="member-picker-list" className="flex flex-col gap-3">
        {visible.map((row) => (
          <PickerRow
            key={row.id}
            row={row}
            checked={ticked.has(row.id)}
            changed={
              saved !== undefined && saved.has(row.id) !== ticked.has(row.id)
            }
            changedLabel={changedLabel}
            savingId={saving ? savingId : null}
            onToggle={toggle}
          />
        ))}
      </ul>
    );
  }

  const populated = !loading && !error && rows.length > 0;
  const labelledBy = legend ? legendId : labelledByProp;
  const describedBy =
    [describedByProp, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div
      role="group"
      data-slot="member-picker"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-busy={loading ? true : undefined}
      className={cn("flex min-w-0 flex-col gap-2", className)}
      {...props}
    >
      {legend ? (
        <div
          id={legendId}
          className="text-base font-medium [overflow-wrap:anywhere] text-foreground"
        >
          {legend}
        </div>
      ) : null}
      {hint ? (
        <p id={hintId} className="-mt-1 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {populated && tools ? (
        <div
          data-slot="member-picker-tools"
          className="flex flex-wrap items-end gap-x-3 gap-y-2"
        >
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
            <div className="flex min-w-0 flex-col gap-1">
              <SelectLabel>{showLabels.label}</SelectLabel>
              <SelectTrigger className="h-control-sm w-auto max-w-full min-w-32 text-sm" />
            </div>
            <SelectContent>
              {showItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {/* Live regions stay in the page, so what appears in them is heard. */}
      <span role="status" className="sr-only">
        {loading ? loading.label : null}
      </span>
      {populated ? (
        <p
          role="status"
          data-slot="member-picker-count"
          className="text-sm text-muted-foreground tabular-nums"
        >
          {countText(tickedCount, rows.length)}
        </p>
      ) : null}
      <p
        id={savingId}
        role="status"
        data-slot="member-picker-saving"
        className="text-sm font-medium text-foreground empty:hidden"
      >
        {saving && populated ? saving.label : null}
      </p>
      {body}
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

export { MemberPicker };
export type { MemberPickerProps, MemberPickerRow, MemberPickerShow };
