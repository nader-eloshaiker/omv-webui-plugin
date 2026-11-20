// SPDX-License-Identifier: GPL-3.0-or-later
import { Circle, CircleCheck, CircleHelp } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { Skeleton } from "../skeleton/skeleton";

/**
 * What the interface found for one item:
 * - `done`: it read the setting and it is in place.
 * - `notDone`: it read the setting and it is not in place.
 * - `notChecked`: it cannot tell, or the read failed; the sentence says which.
 * - `value`: only the reader can judge; the item shows the current value and has no word.
 * - `checking`: the item's read is in flight.
 */
type ChecklistState = "done" | "notDone" | "notChecked" | "value" | "checking";

// Told apart by shape and word, never by colour (phase 3 design 2.2): a configuration choice is not a
// monitored state, so no status hue appears and the mark stays in the neutral inks.
const MARKS = {
  done: { Icon: CircleCheck, name: "check" },
  notDone: { Icon: Circle, name: "circle" },
  notChecked: { Icon: CircleHelp, name: "question" },
} as const;

/**
 * A list of things to check (the set-up checklist). The state column is as wide as the longest state
 * word, so the titles line up; under 640px each item's state sits above its title. The order is the
 * caller's and should not change as states change: a list that jumps loses the reader.
 */
function Checklist({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="checklist"
      className={cn(
        "grid grid-cols-1 sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-4",
        className,
      )}
      {...props}
    />
  );
}

interface ChecklistItemProps extends Omit<React.ComponentProps<"li">, "title"> {
  state: ChecklistState;
  /** The state word: "Done", "Not done", "Not checked", "Checking…". None for `value`. */
  stateLabel?: React.ReactNode;
  /** What to do or check, short: "Use a secure connection (HTTPS)". */
  title: React.ReactNode;
  /** One or two sentences: what was found and why it matters. Values from the server as text. */
  children?: React.ReactNode;
  /** The one thing to do next, usually a link. */
  action?: React.ReactNode;
  /** This item's read failed: a small retry for this item only; the others are unaffected. */
  retry?: { label: React.ReactNode; onRetry: () => void };
}

/**
 * One item: a mark and its state word on the leading side, then the title, the sentences and one
 * action. Read by assistive technology as one sentence, "{title}: {state}. {sentences}": the title
 * comes first in the document and carries the word, and the leading column is drawn for the eye.
 */
function ChecklistItem({
  state,
  stateLabel,
  title,
  children,
  action,
  retry,
  className,
  ...props
}: ChecklistItemProps) {
  const checking = state === "checking";
  const mark = state === "value" || checking ? undefined : MARKS[state];
  const spoken = state !== "value" && stateLabel;
  return (
    <li
      data-slot="checklist-item"
      data-state={state}
      aria-busy={checking || undefined}
      className={cn(
        "grid grid-cols-subgrid gap-y-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0 sm:col-span-2",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-foreground">
          {title}
          {spoken ? (
            <span className="sr-only">
              {": "}
              {stateLabel}
              {"."}
            </span>
          ) : null}
        </p>
        {children ? (
          <div className="flex flex-col gap-1 text-base text-muted-foreground">
            {children}
          </div>
        ) : null}
        {action || retry ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
            {action}
            {retry ? (
              <Button variant="neutral" size="sm" onClick={retry.onRetry}>
                {retry.label}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {/* Drawn first by the grid, read second: its word is already in the title for assistive technology. */}
      <div
        aria-hidden="true"
        data-slot="checklist-item-state"
        className={cn(
          "order-first flex min-h-[1lh] items-center gap-1.5 self-start text-sm text-muted-foreground",
          // A value has no mark or word: its empty column keeps the titles aligned from 640px, and is
          // dropped below, where it would only leave a blank line above the title.
          state === "value" && "max-sm:hidden",
        )}
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {mark ? (
            <mark.Icon
              data-icon={mark.name}
              className="size-4 text-foreground"
            />
          ) : checking ? (
            <Skeleton shape="block" className="size-4 rounded-full" />
          ) : null}
        </span>
        {state === "value" ? null : <span>{stateLabel}</span>}
      </div>
    </li>
  );
}

export { Checklist, ChecklistItem };
export type { ChecklistItemProps, ChecklistState };
