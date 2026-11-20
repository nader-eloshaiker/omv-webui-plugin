// SPDX-License-Identifier: GPL-3.0-or-later
import { CircleAlert, Inbox, SearchX } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { ServerMessage } from "../text/server-message";

const DEFAULT_ICONS = {
  empty: Inbox,
  filtered: SearchX,
  error: CircleAlert,
} as const;

interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  /**
   * `empty`: nothing here yet, with the action that creates it. `filtered`: a filter hides everything,
   * with the action that clears it. `error`: the list could not be read, with a retry. "No disks found"
   * and "could not read disks" are different states and look different (style guide 5.9): their own
   * icon, their own words, and for `error` a retry and the server's message.
   */
  variant?: "empty" | "filtered" | "error";
  /** A short heading. For `error`, says what could not be read: "Could not read the disks". */
  title?: React.ReactNode;
  /** One plain sentence: what belongs here, or what went wrong and what to do. */
  children: React.ReactNode;
  /** For `error`: the backend's own words, shown second and labelled as from the server (UI-9). */
  serverMessage?: { label: React.ReactNode; text: string };
  /** One control: create, clear the filter, or try again. */
  action?: React.ReactNode;
  /** Replaces the default neutral icon. */
  icon?: React.ReactElement;
}

/**
 * What a list shows when it has nothing to show, or could not be read. Neutral in every variant: a
 * read that failed is not a monitored thing in a failed state, so it takes no status red (2.1).
 */
function EmptyState({
  variant = "empty",
  title,
  children,
  serverMessage,
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
          error ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {icon ?? <Icon />}
      </span>
      {title ? (
        <p className="text-base font-semibold text-foreground">{title}</p>
      ) : null}
      <p
        className={cn(
          "max-w-prose text-base",
          error ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
      </p>
      {serverMessage ? (
        <ServerMessage
          label={serverMessage.label}
          className="w-full max-w-prose text-start"
        >
          {serverMessage.text}
        </ServerMessage>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
