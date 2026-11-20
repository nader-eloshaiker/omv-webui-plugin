// SPDX-License-Identifier: GPL-3.0-or-later
import { CircleAlert, Inbox, SearchX } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";

const DEFAULT_ICONS = {
  empty: Inbox,
  filtered: SearchX,
  error: CircleAlert,
} as const;

interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  /**
   * `empty`: nothing here yet, with the action that creates it. `filtered`: a filter hides everything,
   * with the action that clears it. `error`: the list could not be read, with a retry. "No disks found"
   * and "could not read disks" are different states and look different (style guide 5.9).
   */
  variant?: "empty" | "filtered" | "error";
  /** A short heading. For `error`, says what could not be read. */
  title?: React.ReactNode;
  /** One sentence. For `error`, the backend's message, as text. */
  children: React.ReactNode;
  /** One control: create, clear the filter, or try again. */
  action?: React.ReactNode;
  /** Replaces the default neutral icon. */
  icon?: React.ReactElement;
}

/** What a list shows when it has nothing to show, or could not be read. */
function EmptyState({
  variant = "empty",
  title,
  children,
  action,
  icon,
  className,
  ...props
}: EmptyStateProps) {
  const Icon = DEFAULT_ICONS[variant];
  const error = variant === "error";
  return (
    <div
      data-slot="empty-state"
      data-variant={variant}
      role={error ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center gap-2 px-6 py-10 text-center",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex [&_svg]:size-6",
          error ? "text-critical-stroke" : "text-muted-foreground",
        )}
      >
        {icon ?? <Icon />}
      </span>
      {title ? (
        <p
          className={cn(
            "text-base font-semibold",
            error ? "text-critical-label" : "text-foreground",
          )}
        >
          {title}
        </p>
      ) : null}
      <p className="max-w-prose text-base whitespace-pre-wrap text-muted-foreground">
        {children}
      </p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
