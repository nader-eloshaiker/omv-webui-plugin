// SPDX-License-Identifier: GPL-3.0-or-later
// The table pattern's pieces (rethink spec 4.1 to 4.8), lab-local until the owner has seen them:
// development only (UI-11). Each is a candidate for the library (spec 8 row 4: TableSummary,
// FilterChips, StatusCell, NumberCell, RowActions, RowDetail, SelectionBar). Styling is tables.css;
// geometry reaches the CSS as custom properties through the CSSOM (UI-1).
import type { IconName } from "@omv-webui/react-ui-components";
import {
  Button,
  Checkbox,
  IconPlate,
  Menu,
  MenuContent,
  MenuTrigger,
  StatusIcon,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { ChevronDown, Ellipsis } from "lucide-react";
import type { ReactNode } from "react";
import type { Health } from "./model.ts";
import { bytes } from "./model.ts";

const HEALTH_WORD: Record<Health, string> = {
  ok: "OK",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
};

// ─── Page and summary ─────────────────────────────────────────────────────────────────────────

/** The page's title with its object's plate, and the "What is …?" help beside it. */
export function PageHead({
  icon,
  title,
  help,
}: {
  icon: IconName;
  title: string;
  help?: ReactNode;
}) {
  return (
    <header className="lt-head">
      <IconPlate name={icon} className="lt-head-plate" />
      <h1 className="lt-title">{title}</h1>
      {help ? <div className="lt-head-help">{help}</div> : null}
    </header>
  );
}

/**
 * The summary line (4.1): the table's question answered in words, counts worst first, and the one
 * accent action of the region at its end (A1). A polite live region, so a change is heard once.
 */
/** A sentence part of the summary; a problem count carries its status, drawn with its shape. */
export type SummaryPart = string | { text: string; status: Health };

export function TableSummary({
  parts,
  action,
}: {
  parts: readonly SummaryPart[];
  action?: ReactNode;
}) {
  return (
    <div className="lt-summary">
      <p className="lt-summary-words" role="status">
        {parts.map((part, i) => (
          <span
            key={typeof part === "string" ? part : part.text}
            className="lt-summary-part"
          >
            {i > 0 ? (
              <span className="lt-dot" aria-hidden="true">
                ·
              </span>
            ) : null}
            {typeof part === "string" ? (
              part
            ) : (
              <SummaryProblem status={part.status}>{part.text}</SummaryProblem>
            )}
          </span>
        ))}
      </p>
      {action ? <div className="lt-summary-action">{action}</div> : null}
    </div>
  );
}

/** A count in the summary that is a problem: its status shape beside the words, never colour alone. */
export function SummaryProblem({
  status,
  children,
}: {
  status: Health;
  children: ReactNode;
}) {
  return (
    <span className="lt-summary-problem" data-tone={status}>
      <StatusIcon status={status} />
      {children}
    </span>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────────────────────

export interface Chip<V extends string> {
  value: V;
  label: string;
  count: number;
  /** A chip for a problem state carries its shape. */
  status?: Health;
}

/**
 * Filter chips (4.6): the two to five states people filter by, with counts. Toggle buttons in a
 * named group, so the current filter is announced and always visible.
 */
export function FilterChips<V extends string>({
  label,
  value,
  chips,
  onChange,
}: {
  label: string;
  value: V;
  chips: readonly Chip<V>[];
  onChange: (value: V) => void;
}) {
  return (
    <div className="lt-chips" role="group" aria-label={label}>
      {chips.map((chip) => (
        <button
          key={chip.value}
          type="button"
          className="lt-chip"
          aria-pressed={chip.value === value}
          onClick={() => {
            onChange(chip.value);
          }}
        >
          {chip.status && chip.count > 0 ? (
            <StatusIcon status={chip.status} />
          ) : null}
          {chip.label}
          <span className="lt-chip-count">{chip.count}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The selection bar (4.7, 7.5): replaces the toolbar while rows are selected, dropping into place as
 * the toolbar fades. "2 selected · Check health · Clear". Escape in the table clears it too.
 */
export function SelectionBar({
  count,
  children,
  onClear,
}: {
  count: number;
  children: ReactNode;
  onClear: () => void;
}) {
  return (
    <div
      className="lt-selbar"
      role="toolbar"
      aria-label="Actions for the selected rows"
    >
      <p className="lt-selbar-count" role="status">
        <span key={count} className="lt-count">
          {count}
        </span>{" "}
        selected
      </p>
      <div className="lt-selbar-actions">{children}</div>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

// ─── Cells ────────────────────────────────────────────────────────────────────────────────────

/** The select checkbox of a row. Not a tab stop: Space on the row selects (4.7). */
export function SelectCell({
  name,
  checked,
  onChange,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <Checkbox
      aria-label={`Select ${name}`}
      checked={checked}
      tabIndex={-1}
      onCheckedChange={onChange}
    />
  );
}

/**
 * Status first (4.4): OK is the check and the word in the OK label without a wash, so a healthy list
 * is quiet; anything else is the full pill. A reason goes on the second line ("Not checked yet").
 * The pill is keyed by its status, so a change crossfades the new one in (7.5).
 */
export function StatusCell({
  status,
  word,
  reason,
}: {
  status: Health;
  /** The word when it is not the status's own: "Not reachable". */
  word?: string;
  reason?: string;
}) {
  const words = word ?? HEALTH_WORD[status];
  return (
    <span className="lt-status">
      <span key={status} className="lt-status-mark" data-status={status}>
        {status === "ok" ? (
          <span className="lt-status-ok">
            <StatusIcon status="ok" />
            {words}
          </span>
        ) : (
          <StatusPill status={status}>{words}</StatusPill>
        )}
      </span>
      {reason ? <span className="lt-line2 lt-reason">{reason}</span> : null}
    </span>
  );
}

/** A size with its unit quieter (4.5): "3.6 TiB", tabular figures, a non-breaking space. */
export function Bytes({ n }: { n: number }) {
  const { value, unit } = bytes(n);
  return (
    <span className="lt-num">
      {value}
      {" "}
      <span className="lt-unit">{unit}</span>
    </span>
  );
}

/** A dash for an empty cell, named for assistive technology (4.8): never "None" repeated. */
export function Missing({ label }: { label: string }) {
  return (
    <span className="lt-missing" role="img" aria-label={label}>
      —
    </span>
  );
}

// ─── Row actions ──────────────────────────────────────────────────────────────────────────────

/**
 * The row's end (4.7): one or two quick verbs that fade in on hover and focus within the row (after
 * an 80ms intent delay, 7.5), the always-visible quiet More button with the row's menu, and the
 * chevron that opens the row's detail inline. Everything in the quick verbs is also in the menu, so
 * nothing is hover-only. Controls are tab stops only while their row is active.
 */
export function RowActions({
  name,
  quick,
  menu,
  menuOpen,
  onMenuOpenChange,
  expanded,
  onExpandedChange,
  detailId,
  tabbable,
}: {
  name: string;
  quick?: ReactNode;
  menu: ReactNode;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  /** Left out in the list form, where the item opens the page instead (4.8). */
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
  detailId?: string;
  tabbable: boolean;
}) {
  const tab = tabbable ? 0 : -1;
  return (
    <div className="lt-actions">
      {quick ? <div className="lt-quick">{quick}</div> : null}
      <Menu open={menuOpen} onOpenChange={onMenuOpenChange}>
        <MenuTrigger
          render={
            <Button
              variant="quiet"
              size="icon-sm"
              aria-label={`Actions for ${name}`}
              tabIndex={tab}
              className="lt-more"
            />
          }
        >
          <Ellipsis aria-hidden="true" />
        </MenuTrigger>
        <MenuContent align="end">{menu}</MenuContent>
      </Menu>
      {onExpandedChange ? (
        <Button
          variant="quiet"
          size="icon-sm"
          aria-label={`Details of ${name}`}
          aria-expanded={expanded}
          aria-controls={expanded ? detailId : undefined}
          tabIndex={tab}
          className="lt-expand"
          onClick={() => {
            onExpandedChange(!expanded);
          }}
        >
          <ChevronDown aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

/** A quiet icon-and-word quick action (4.7). The icon acts out its action on hover (7.7). */
export function Quick({
  icon,
  children,
  onClick,
  tabbable,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  tabbable: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      tabIndex={tabbable ? 0 : -1}
      onClick={onClick}
      className="lt-quick-button"
    >
      {icon}
      {children}
    </Button>
  );
}

/** The row's identity cell (4.3): the object's plate, the name, and what it is on a second line. */
export function Identity({
  icon,
  name,
  line,
  tag,
  onOpen,
  tabbable,
  mono,
}: {
  icon: ReactNode;
  name: string;
  line?: ReactNode;
  tag?: ReactNode;
  onOpen: () => void;
  tabbable: boolean;
  /** The technical identity, on line one in compact density (R3). */
  mono?: string;
}) {
  return (
    <div className="lt-identity">
      <span className="lt-plate" aria-hidden="true">
        {icon}
      </span>
      <span className="lt-identity-words">
        <span className="lt-name-row">
          <button
            type="button"
            className="lt-name"
            tabIndex={tabbable ? 0 : -1}
            onClick={onOpen}
          >
            <bdi>{name}</bdi>
          </button>
          {mono ? (
            <code className="lt-chip-mono lt-compact-only">{mono}</code>
          ) : null}
          {tag}
        </span>
        {line ? <span className="lt-line2">{line}</span> : null}
      </span>
    </div>
  );
}
