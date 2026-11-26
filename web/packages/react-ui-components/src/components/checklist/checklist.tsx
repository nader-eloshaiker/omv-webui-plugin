// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";
import { Circle, CircleCheck, CircleHelp } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { useDrawPath } from "../motion/use-draw-path";
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

/**
 * `audit`, the default: the set-up checklist, each item's state word in a leading column and its
 * action under its sentences. `steps`: first steps (style guide 10, rule 9), a tick when done and an
 * empty circle when not, the title and one line, the step's button at the end of its row; no numbers
 * and no rail. The state word is read, not shown.
 */
type ChecklistVariant = "audit" | "steps";

const ChecklistVariantContext = React.createContext<ChecklistVariant>("audit");

// Told apart by shape and word, never by colour (phase 3 design 2.2): a configuration choice is not a
// monitored state, so no status hue appears and the mark stays in the neutral inks.
const MARKS = {
  done: { Icon: CircleCheck, name: "check" },
  notDone: { Icon: Circle, name: "circle" },
  notChecked: { Icon: CircleHelp, name: "question" },
} as const;

const listClass = cva("grid", {
  variants: {
    variant: {
      audit: "grid-cols-1 sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-4",
      // The list's own width decides: under 37.5rem the button moves under its words.
      steps:
        "@container/steps grid-cols-[1.375rem_minmax(0,1fr)_auto] gap-x-3.5",
    },
  },
  defaultVariants: { variant: "audit" },
});

type ChecklistProps = React.ComponentProps<"ul"> & {
  variant?: ChecklistVariant;
};

/**
 * A list of things to check (the set-up checklist). The state column is as wide as the longest state
 * word, so the titles line up; under 640px each item's state sits above its title. The order is the
 * caller's and should not change as states change: a list that jumps loses the reader.
 */
function Checklist({ variant = "audit", className, ...props }: ChecklistProps) {
  return (
    <ChecklistVariantContext value={variant}>
      <ul
        data-slot="checklist"
        data-variant={variant}
        className={cn(listClass({ variant }), className)}
        {...props}
      />
    </ChecklistVariantContext>
  );
}

interface ChecklistItemProps extends Omit<React.ComponentProps<"li">, "title"> {
  state: ChecklistState;
  /** The state word: "Done", "Not done", "Not checked", "Checking…". None for `value`. */
  stateLabel?: React.ReactNode;
  /** What to do or check, short: "Use a secure connection (HTTPS)". */
  title: React.ReactNode;
  /**
   * One or two sentences: what was found and why it matters. Values from the server as text. In a
   * `steps` list, the one line under the title, which compact density hides (owner decision 11).
   */
  children?: React.ReactNode;
  /** The one thing to do next, usually a link; in a `steps` list, the step's button. */
  action?: React.ReactNode;
  /** This item's read failed: a small retry for this item only; the others are unaffected. */
  retry?: { label: React.ReactNode; onRetry: () => void };
}

/**
 * One item: a mark and its state word on the leading side, then the title, the sentences and one
 * action. Read by assistive technology as one sentence, "{title}: {state}. {sentences}": the title
 * comes first in the document and carries the word, and the leading column is drawn for the eye.
 */
function ChecklistItem(props: ChecklistItemProps) {
  const variant = React.use(ChecklistVariantContext);
  return variant === "steps" ? (
    <StepItem {...props} />
  ) : (
    <AuditItem {...props} />
  );
}

function AuditItem({
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
        "grid grid-cols-subgrid gap-y-1 border-t border-border py-row first:border-t-0 first:pt-0 last:pb-0 sm:col-span-2",
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

/**
 * A first step's mark: an empty circle, or a tick in its circle when done. When a step is done after
 * the list was drawn, the tick draws its stroke (rethink 7.2, "A first step lands"); a step done when
 * the page opens is simply ticked. Under reduced motion the tick appears with a short fade.
 */
function StepMark({ done }: { done: boolean }) {
  const tick = useDrawPath<SVGPathElement>(done, {
    duration: "--duration-base",
    delay: 120,
  });
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      data-icon={done ? "check" : "circle"}
      className="size-5 fill-none [stroke-linecap:round] [stroke-linejoin:round]"
    >
      <circle
        cx="10"
        cy="10"
        r="8.25"
        strokeWidth={1.5}
        className={cn(
          "transition-[fill,stroke] duration-base",
          done ? "fill-ok-wash stroke-ok-stroke" : "stroke-border-control",
        )}
      />
      <path
        ref={tick}
        d="M6 10.4l2.7 2.7L14.2 7.6"
        strokeWidth={2}
        className="stroke-ok-label"
      />
    </svg>
  );
}

function StepItem({
  state,
  stateLabel,
  title,
  children,
  action,
  retry,
  className,
  ...props
}: ChecklistItemProps) {
  const done = state === "done";
  return (
    <li
      data-slot="checklist-item"
      data-state={state}
      aria-busy={state === "checking" || undefined}
      className={cn(
        "col-span-3 grid min-h-14 grid-cols-subgrid items-center gap-y-1 border-t border-border py-2 first:border-t-0 compact:min-h-9 compact:py-0.75",
        "@max-[37.5rem]/steps:items-start",
        className,
      )}
      {...props}
    >
      <span className="flex @max-[37.5rem]/steps:pt-0.5">
        <StepMark done={done} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "text-sm",
            done ? "text-muted-foreground" : "font-semibold text-foreground",
          )}
        >
          {title}
          {stateLabel ? (
            <span className="sr-only">
              {" ("}
              {stateLabel}
              {")"}
            </span>
          ) : null}
        </span>
        {children ? (
          <span className="text-sm text-muted-foreground compact:hidden">
            {children}
          </span>
        ) : null}
      </span>
      {action || retry ? (
        <span className="flex flex-wrap items-center justify-end gap-2 @max-[37.5rem]/steps:col-start-2 @max-[37.5rem]/steps:justify-start">
          {action}
          {retry ? (
            <Button variant="neutral" size="sm" onClick={retry.onRetry}>
              {retry.label}
            </Button>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

export { Checklist, ChecklistItem };
export type {
  ChecklistItemProps,
  ChecklistProps,
  ChecklistState,
  ChecklistVariant,
};
