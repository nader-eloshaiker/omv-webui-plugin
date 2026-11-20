// SPDX-License-Identifier: GPL-3.0-or-later
import { History, LoaderCircle } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";

interface PendingBannerProps {
  /** What is pending, in words: "3 pending changes: SMB, SSH, Network". */
  message: React.ReactNode;
  /** The landmark's name: "Pending changes". */
  label: string;
  applyLabel: React.ReactNode;
  revertLabel: React.ReactNode;
  onApply: () => void;
  onRevert: () => void;
  /** Changes are being applied: the band says so and both controls are unavailable (5.8). */
  applying?: boolean;
  /** Shown while applying: "Applying changes to SMB, SSH, Network...". */
  applyingMessage?: React.ReactNode;
  className?: string;
}

/**
 * The pending-changes band (style guide 5.8): the only place the yellow appears at size. It stays
 * while anything is pending and cannot be dismissed. Its words sit in a polite live region, so a change
 * in what is pending, and the start of applying, are announced.
 */
function PendingBanner({
  message,
  label,
  applyLabel,
  revertLabel,
  onApply,
  onRevert,
  applying = false,
  applyingMessage,
  className,
}: PendingBannerProps) {
  return (
    <section
      data-slot="pending-banner"
      aria-label={label}
      aria-busy={applying || undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 bg-pending px-4 py-2 font-medium text-pending-foreground sm:px-6",
        className,
      )}
    >
      {applying ? (
        <LoaderCircle
          aria-hidden="true"
          className="size-4 shrink-0 motion-safe:animate-spin"
        />
      ) : (
        <History aria-hidden="true" className="size-4 shrink-0" />
      )}
      <p role="status" className="min-w-0 flex-1">
        {applying && applyingMessage ? applyingMessage : message}
      </p>
      <div className="flex gap-2">
        <Button
          variant="onPending"
          size="sm"
          disabled={applying}
          focusableWhenDisabled
          onClick={onRevert}
        >
          {revertLabel}
        </Button>
        <Button
          variant="onPending"
          size="sm"
          disabled={applying}
          focusableWhenDisabled
          onClick={onApply}
        >
          {applyLabel}
        </Button>
      </div>
    </section>
  );
}

export { PendingBanner };
export type { PendingBannerProps };
