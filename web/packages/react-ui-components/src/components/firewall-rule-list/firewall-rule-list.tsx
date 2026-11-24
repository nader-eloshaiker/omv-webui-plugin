// SPDX-License-Identifier: GPL-3.0-or-later
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Ban,
  EyeOff,
  Hash,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../table/table";
import { Tooltip } from "../tooltip/tooltip";

/**
 * What a rule does with the traffic it fits (phase 5 network design 0.1): Allow, Refuse, Ignore,
 * Note in the log, Count only.
 */
type FirewallAction = "allow" | "refuse" | "ignore" | "log" | "count";

// Neutral icons of different shapes (design 11.3): a rule is a setting, not a state the NAS
// monitors, so Allow is not green and Refuse is not red (style guide 2).
const FIREWALL_ACTION_ICONS: Readonly<Record<FirewallAction, LucideIcon>> = {
  allow: ArrowRight,
  refuse: Ban,
  ignore: EyeOff,
  log: NotebookPen,
  count: Hash,
};

/** One rule as the list shows it. Every cell is the caller's words (`network/ruleWords.ts`). */
interface FirewallRuleRow {
  /** Stable across moves, so the moved row keeps its focus: the rule's identifier. */
  id: string;
  action: FirewallAction;
  /** "Coming in, TCP to port 22 (SSH)". */
  traffic: React.ReactNode;
  /** "Any computer", "Computers on 192.0.2.0/24 (256 addresses)", "Every computer except …". */
  peer: React.ReactNode;
  /** The rule's note; "This NAS talking to itself"; "Other options: … (set in the classic interface)". */
  note?: React.ReactNode;
}

interface FirewallRuleListLabels {
  /** Names the table and its scrolling region: "Firewall rules". */
  name: string;
  columns: {
    /** "#". */
    position: string;
    /** "Then". */
    then: string;
    /** "Traffic". */
    traffic: string;
    /** "From / To". */
    peer: string;
    /** "Note". */
    note: string;
    /** The actions column's header for assistive technology: "Actions". */
    actions: string;
  };
  /** Each action's word: "Allow", "Refuse", "Ignore", "Note in the log", "Count only". */
  actions: Readonly<Record<FirewallAction, string>>;
  /** "Move rule 3 up", "Move rule 3 down": each button's name and tooltip, with the rule's position. */
  moveUp: (position: number) => string;
  moveDown: (position: number) => string;
  /** The tooltip and description of the first row's Move up and the last row's Move down. */
  alreadyFirst: string;
  alreadyLast: string;
  /** "Change…", and its full name with the position: "Change rule 3". */
  change: string;
  changeName: (position: number) => string;
  /** "Delete…", and its full name: "Delete rule 3". */
  delete: string;
  deleteName: (position: number) => string;
  /** Said politely after a move: "Rule 3 is now rule 2." */
  moved: (from: number, to: number) => string;
  /** The unsaved-order bar's line: "The new order is not saved." */
  orderUnsaved: React.ReactNode;
  /** "Discard". */
  discard: React.ReactNode;
}

interface FirewallRuleListProps<Row extends FirewallRuleRow> {
  /** The rules in the order the page shows them, the first rule first. */
  rules: readonly Row[];
  labels: FirewallRuleListLabels;
  /** A move: the rules in their new order. The caller holds it and marks the order unsaved. */
  onOrderChange: (rules: Row[]) => void;
  /** "Change…" on a rule, with its position (1 first). */
  onChange?: (rule: Row, position: number) => void;
  /** "Delete…" on a rule. */
  onDelete?: (rule: Row, position: number) => void;
  /** The order was changed on the page and not saved: shows the bar above the table. */
  unsaved?: boolean;
  /** The bar's filled button, which the caller words: "Save the new order" or "Review the change…". */
  saveLabel?: React.ReactNode;
  onSave?: () => void;
  onDiscard?: () => void;
  /** The order is being saved: Save is busy, and nothing in the list can be moved or changed. */
  saving?: boolean;
  /** A line in the bar after its sentence, such as the check's `ImpactLine`. */
  saveNote?: React.ReactNode;
  /** Shown instead of the table when there are no rules: the page's `EmptyState`. */
  empty?: React.ReactNode;
  className?: string;
}

type MoveButton = "up" | "down";

interface MoveControlProps {
  direction: MoveButton;
  label: string;
  unavailableReason?: string;
  disabled: boolean;
  onMove: () => void;
  buttonRef: (node: HTMLButtonElement | null) => void;
}

/**
 * A move button. At the end of the list it stays focusable with its name and says why it does
 * nothing ("Already first"), in its tooltip and its description, so a keyboard that has just moved a
 * rule to the top keeps its place (design 19.2).
 */
function MoveControl({
  direction,
  label,
  unavailableReason,
  disabled,
  onMove,
  buttonRef,
}: MoveControlProps) {
  const reasonId = React.useId();
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  const unavailable = unavailableReason !== undefined;
  return (
    <>
      <Tooltip content={unavailableReason ?? label}>
        <Button
          ref={buttonRef}
          data-move={direction}
          aria-label={label}
          aria-describedby={unavailable ? reasonId : undefined}
          variant="ghost"
          size="icon-sm"
          disabled={unavailable || disabled}
          focusableWhenDisabled
          onClick={onMove}
        >
          <Icon aria-hidden="true" />
        </Button>
      </Tooltip>
      {unavailable ? (
        <span id={reasonId} hidden>
          {unavailableReason}
        </span>
      ) : null}
    </>
  );
}

/**
 * The firewall's rules in order (phase 5 network design 11.3, 11.7): position, what the rule does
 * with a neutral icon per action, the traffic, the other computer, the note, and per row "Move rule n
 * up", "Move rule n down", "Change…" and "Delete…". Moves need no pointer: they change the order on
 * the page only, through `onOrderChange`; focus stays on the same button of the moved row at its new
 * position and a polite message says where it went. While `unsaved`, a bar above the table says so
 * with the caller's save button and Discard.
 *
 * The table scrolls sideways in its own named region with the position column held at the start, so
 * the page never scrolls sideways at 320px or 200% zoom.
 */
function FirewallRuleList<Row extends FirewallRuleRow>({
  rules,
  labels,
  onOrderChange,
  onChange,
  onDelete,
  unsaved = false,
  saveLabel,
  onSave,
  onDiscard,
  saving = false,
  saveNote,
  empty,
  className,
}: FirewallRuleListProps<Row>) {
  const [announcement, setAnnouncement] = React.useState("");
  const buttonsRef = React.useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusRef = React.useRef<string | null>(null);

  // After a move the parent re-renders the rows in their new order; the moved row's button may have
  // been taken out of the document and put back, which loses focus, so it is focused again here.
  React.useLayoutEffect(() => {
    const key = pendingFocusRef.current;
    if (key === null) {
      return;
    }
    pendingFocusRef.current = null;
    const button = buttonsRef.current.get(key);
    if (button && document.activeElement !== button) {
      button.focus();
    }
  }, [rules]);

  const move = (index: number, direction: MoveButton) => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= rules.length) {
      return;
    }
    const next = [...rules];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) {
      return;
    }
    next.splice(target, 0, moved);
    pendingFocusRef.current = `${moved.id}:${direction}`;
    setAnnouncement(labels.moved(index + 1, target + 1));
    onOrderChange(next);
  };

  const setButton = (key: string) => (node: HTMLButtonElement | null) => {
    if (node) {
      buttonsRef.current.set(key, node);
    } else {
      buttonsRef.current.delete(key);
    }
  };

  // The position column stays in view while the table scrolls sideways (design 19.2).
  const stickyCell = "sticky start-0 z-[1] bg-surface [tr:hover>&]:bg-muted";

  return (
    <div
      data-slot="firewall-rule-list"
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      <p
        role="status"
        data-slot="firewall-rule-list-announcer"
        className="sr-only"
      >
        {announcement}
      </p>
      {unsaved ? (
        <div
          data-slot="firewall-order-bar"
          className="flex flex-col gap-2 rounded-card border border-border bg-muted px-3 py-2.5"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="me-auto text-base font-medium text-foreground">
              {labels.orderUnsaved}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="md"
                loading={saving}
                onClick={onSave}
              >
                {saveLabel}
              </Button>
              <Button
                variant="neutral"
                size="md"
                disabled={saving}
                onClick={onDiscard}
              >
                {labels.discard}
              </Button>
            </div>
          </div>
          {saveNote}
        </div>
      ) : null}
      {rules.length === 0 && empty !== undefined ? (
        empty
      ) : (
        <Table aria-label={labels.name} frameLabel={labels.name}>
          <TableHeader>
            <TableRow>
              <TableHead numeric className={cn(stickyCell, "bg-muted w-12")}>
                {labels.columns.position}
              </TableHead>
              <TableHead>{labels.columns.then}</TableHead>
              <TableHead>{labels.columns.traffic}</TableHead>
              <TableHead>{labels.columns.peer}</TableHead>
              <TableHead>{labels.columns.note}</TableHead>
              <TableHead>
                <span className="sr-only">{labels.columns.actions}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule, index) => {
              const position = index + 1;
              const Icon = FIREWALL_ACTION_ICONS[rule.action];
              return (
                <TableRow
                  key={rule.id}
                  data-slot="firewall-rule-row"
                  data-action={rule.action}
                  className="align-top"
                >
                  <th
                    scope="row"
                    className={cn(
                      stickyCell,
                      "px-cell-x py-cell-y text-end font-regular tabular-nums text-foreground",
                    )}
                  >
                    {position}
                  </th>
                  <TableCell className="py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground",
                          rule.action === "allow" && "rtl:-scale-x-100",
                        )}
                      />
                      {labels.actions[rule.action]}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-48 [overflow-wrap:anywhere]">
                    {rule.traffic}
                  </TableCell>
                  <TableCell className="min-w-48 [overflow-wrap:anywhere]">
                    {rule.peer}
                  </TableCell>
                  <TableCell className="min-w-40 text-muted-foreground [overflow-wrap:anywhere]">
                    {rule.note}
                  </TableCell>
                  <TableCell className="py-1">
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <MoveControl
                        direction="up"
                        label={labels.moveUp(position)}
                        unavailableReason={
                          index === 0 ? labels.alreadyFirst : undefined
                        }
                        disabled={saving}
                        onMove={() => move(index, "up")}
                        buttonRef={setButton(`${rule.id}:up`)}
                      />
                      <MoveControl
                        direction="down"
                        label={labels.moveDown(position)}
                        unavailableReason={
                          index === rules.length - 1
                            ? labels.alreadyLast
                            : undefined
                        }
                        disabled={saving}
                        onMove={() => move(index, "down")}
                        buttonRef={setButton(`${rule.id}:down`)}
                      />
                      {onChange ? (
                        <Button
                          variant="neutral"
                          size="sm"
                          aria-label={labels.changeName(position)}
                          disabled={saving}
                          onClick={() => onChange(rule, position)}
                          className="ms-1"
                        >
                          {labels.change}
                        </Button>
                      ) : null}
                      {onDelete ? (
                        <Button
                          variant="neutral"
                          size="sm"
                          aria-label={labels.deleteName(position)}
                          disabled={saving}
                          onClick={() => onDelete(rule, position)}
                        >
                          {labels.delete}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export { FIREWALL_ACTION_ICONS, FirewallRuleList };
export type {
  FirewallAction,
  FirewallRuleListLabels,
  FirewallRuleListProps,
  FirewallRuleRow,
};
