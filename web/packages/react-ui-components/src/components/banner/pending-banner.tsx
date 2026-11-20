// SPDX-License-Identifier: GPL-3.0-or-later
import { History, LoaderCircle, OctagonX } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";

interface PendingBannerProps {
  /** What is pending, in words: "3 pending changes: SMB, SSH, Network". */
  message: React.ReactNode;
  /** The landmark's name: "Pending changes". */
  label: string;
  /** With the count: "Apply 3 changes". */
  applyLabel: React.ReactNode;
  /** The one verb for discarding pending changes, with the count: "Undo 3 changes" (5.8). */
  undoLabel: React.ReactNode;
  onApply: () => void;
  /** Open the Undo confirmation here (a `ConfirmDialog` naming what is lost); the band never undoes directly. */
  onUndo: () => void;
  /**
   * `applying`: the band says so, Apply and Undo are unavailable, and "Show progress" opens the task.
   * `failed`: the band says so and its first offer is to try again (R7); Undo stays available.
   */
  state?: "idle" | "applying" | "failed";
  /** While applying: "Applying changes to SMB, SSH, Network…". */
  applyingMessage?: React.ReactNode;
  /** After a failed apply: "Applying the changes failed. SMB could not be restarted." */
  failedMessage?: React.ReactNode;
  /** After a failed apply, replaces Apply: "Try applying again". */
  retryLabel?: React.ReactNode;
  /** Opens the apply task's output, while applying and after a failure: "Show progress". */
  showProgress?: { label: React.ReactNode; onShow: () => void };
  className?: string;
}

/**
 * The pending-changes band (style guide 5.8): the only place the yellow appears at size. It stays
 * while anything is pending and cannot be dismissed. Its words sit in a polite live region, so a change
 * in what is pending, the start of applying and a failure are announced.
 */
function PendingBanner({
  message,
  label,
  applyLabel,
  undoLabel,
  onApply,
  onUndo,
  state = "idle",
  applyingMessage,
  failedMessage,
  retryLabel,
  showProgress,
  className,
}: PendingBannerProps) {
  const applying = state === "applying";
  const failed = state === "failed";
  const Icon = applying ? LoaderCircle : failed ? OctagonX : History;
  const text =
    applying && applyingMessage
      ? applyingMessage
      : failed && failedMessage
        ? failedMessage
        : message;
  return (
    <section
      data-slot="pending-banner"
      data-state={state}
      aria-label={label}
      aria-busy={applying || undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 bg-pending px-4 py-2 font-medium text-pending-foreground sm:px-6",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0",
          applying && "motion-safe:animate-spin",
        )}
      />
      <p role="status" className="min-w-0 flex-1 basis-48">
        {text}
      </p>
      <div className="flex flex-wrap gap-2">
        {showProgress && (applying || failed) ? (
          <Button variant="onPending" size="sm" onClick={showProgress.onShow}>
            {showProgress.label}
          </Button>
        ) : null}
        <Button
          variant="onPending"
          size="sm"
          disabled={applying}
          focusableWhenDisabled
          onClick={onUndo}
        >
          {undoLabel}
        </Button>
        <Button
          variant="onPending"
          size="sm"
          disabled={applying}
          focusableWhenDisabled
          onClick={onApply}
        >
          {failed && retryLabel ? retryLabel : applyLabel}
        </Button>
      </div>
    </section>
  );
}

export { PendingBanner };
export type { PendingBannerProps };
