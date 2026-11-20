// SPDX-License-Identifier: GPL-3.0-or-later
import { CircleHelp } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";

interface Referrer {
  id: string;
  /** What kind of thing refers to the object, in words: "SMB share", "Rsync job", "Home folders". */
  kind: React.ReactNode;
  /** Its name, from the backend, rendered as text. */
  name: string;
  /** A control that opens it, such as a router link. */
  action?: React.ReactNode;
}

interface UsedByPanelProps {
  /** "Used by". */
  title: React.ReactNode;
  referrers: readonly Referrer[];
  /** Shown when nothing refers to the object: "Nothing uses this shared folder." */
  emptyText: React.ReactNode;
  /**
   * The backend says the object is in use but no known referrer was found (UX audit 4.8): a message
   * such as "Used by an add-on or setting this interface does not show yet" and a link to the classic
   * interface (a fixed link from the app, UI-3).
   */
  unknownUse?: { message: React.ReactNode; classicLink: React.ReactNode };
  /**
   * The act that is blocked while the object is in use, shown unavailable with the blocker named in
   * words beside it (never only in a tooltip): "Delete" with "Remove the 2 shares that use it first."
   */
  blockedAction?: { label: React.ReactNode; reason: React.ReactNode };
  className?: string;
}

/**
 * Pattern G, "Used by" (UX audit 4.8): on a file system, shared folder, user or certificate, what
 * refers to it, so a delete, unmount or wipe that is unavailable says why.
 */
function UsedByPanel({
  title,
  referrers,
  emptyText,
  unknownUse,
  blockedAction,
  className,
}: UsedByPanelProps) {
  const reasonId = React.useId();
  return (
    <section
      data-slot="used-by-panel"
      className={cn(
        "flex flex-col gap-3 rounded-card border border-border bg-surface p-4",
        className,
      )}
    >
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {referrers.length > 0 ? (
        <ul className="flex flex-col">
          {referrers.map((referrer) => (
            <li
              key={referrer.id}
              className="flex items-center gap-3 border-t border-border py-2 first:border-t-0"
            >
              <span className="w-32 shrink-0 text-sm text-muted-foreground">
                {referrer.kind}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {referrer.name}
              </span>
              {referrer.action}
            </li>
          ))}
        </ul>
      ) : unknownUse ? (
        <div className="flex items-start gap-2 text-base text-foreground">
          <CircleHelp
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="flex flex-col gap-1">
            <p>{unknownUse.message}</p>
            <div>{unknownUse.classicLink}</div>
          </div>
        </div>
      ) : (
        <p className="text-base text-muted-foreground">{emptyText}</p>
      )}
      {blockedAction ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          {/* Neutral, not red: it would open a confirmation, and only that dialog's button is red. */}
          <Button
            variant="neutral"
            disabled
            focusableWhenDisabled
            aria-describedby={reasonId}
          >
            {blockedAction.label}
          </Button>
          <p id={reasonId} className="text-sm text-muted-foreground">
            {blockedAction.reason}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export { UsedByPanel };
export type { Referrer, UsedByPanelProps };
