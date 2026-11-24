// SPDX-License-Identifier: GPL-3.0-or-later
import { Button as BaseButton } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { popElement, whenLanded } from "../flight/flight";

const pillClass = cva(
  "relative inline-flex h-control-sm shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-sm font-semibold select-none " +
    "transition-[background-color,border-color,color] duration-base [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        // Nothing waits: a quiet chip on the bar, so the place where changes land is known.
        quiet:
          "border-border bg-transparent text-tertiary-foreground hover:bg-muted-strong hover:text-foreground " +
          "data-disabled:cursor-default data-disabled:hover:bg-transparent data-disabled:hover:text-tertiary-foreground",
        // Something waits: OMV's yellow and its coffee ink (style guide 5.8), its only other place.
        pending:
          "border-pending bg-pending text-pending-foreground hover:border-pending-foreground",
      },
    },
    defaultVariants: { tone: "quiet" },
  },
);

interface PendingPillProps extends Omit<
  React.ComponentProps<typeof BaseButton>,
  "children" | "aria-label"
> {
  /**
   * How many changes wait to be applied; 0 for none, null when something is pending but the count
   * is not known (the backend reports dirty with no module list).
   */
  count: number | null;
  /** The accessible name, with the count: "3 pending changes", "No pending changes". */
  label: string;
  /** The short word beside the count from 768px: "pending". */
  word: React.ReactNode;
  /** Applying is running: a spinner in place of the mark. */
  applying?: boolean;
}

/** The pending mark: a yellow disc with its ink, the same shape the band and the flight use. */
function PendingDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2.5 shrink-0 rounded-full",
        on
          ? "bg-pending-foreground"
          : "border-[1.5px] border-current opacity-60",
      )}
    />
  );
}

/**
 * The top bar's pending pill (foundation 10): a count chip that turns pending yellow when saved
 * settings wait to be applied, and pops on the settle spring as the count rises. A pending flight on
 * its way to the pill lands first (`whenLanded`). It is a button: the app moves the reader to the
 * band with it.
 */
function PendingPill({
  count,
  label,
  word,
  applying = false,
  className,
  ref,
  ...props
}: PendingPillProps) {
  const ownRef = React.useRef<HTMLElement | null>(null);
  const on = count === null || count > 0;
  const previousRef = React.useRef(count);
  React.useEffect(() => {
    const before = previousRef.current;
    previousRef.current = count;
    const rose =
      (count === null && before === 0) ||
      (count !== null &&
        count > 0 &&
        (before === null ? false : count > before));
    if (!rose) {
      return;
    }
    let live = true;
    void whenLanded(ownRef.current).then(() => {
      if (live) {
        popElement(ownRef.current);
      }
    });
    return () => {
      live = false;
    };
  }, [count]);

  const setRef = React.useCallback(
    (element: HTMLElement | null) => {
      ownRef.current = element;
      if (typeof ref === "function") {
        ref(element);
      } else if (ref) {
        ref.current = element;
      }
    },
    [ref],
  );

  return (
    <BaseButton
      ref={setRef}
      data-slot="pending-pill"
      data-pending={on || undefined}
      aria-label={label}
      className={cn(pillClass({ tone: on ? "pending" : "quiet" }), className)}
      {...props}
    >
      {applying ? (
        <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
      ) : (
        <PendingDot on={on} />
      )}
      {count === null ? null : (
        <span aria-hidden="true" className="tabular-nums">
          {count}
        </span>
      )}
      <span aria-hidden="true" className="hidden md:inline">
        {word}
      </span>
    </BaseButton>
  );
}

export { PendingPill };
export type { PendingPillProps };
