// SPDX-License-Identifier: GPL-3.0-or-later
import { Check, LoaderCircle, OctagonX } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { durationToken } from "../motion/motion";
import { useShrinkOnScroll } from "./use-shrink-on-scroll";

type PendingBandState = "idle" | "applying" | "applied" | "failed";

interface PendingBandProps extends Omit<
  React.ComponentProps<"section">,
  "children" | "aria-label"
> {
  /** The landmark's name: "Pending changes". */
  label: string;
  /**
   * Whether the band is shown. It slides open on the soft spring and, when this turns false, closes
   * the same way and leaves the page (nothing of it stays in the document).
   */
  open: boolean;
  /**
   * `idle`: what waits, with Apply and Undo. `applying`: the band says so, a progress line runs along
   * its foot, and Apply and Undo are unavailable. `applied`: "Applied" with the line full; the caller
   * closes the band after a moment (1.6s, foundation 7.2). `failed`: the band says so, offers to try
   * again first (R7) and never shrinks while scrolling. Apply and Undo stay in place, unavailable,
   * while applying and once applied.
   */
  state?: PendingBandState;
  /** What waits, in words: "3 changes waiting to be applied: SMB, SSH, Network". */
  message: React.ReactNode;
  applyingMessage?: React.ReactNode;
  appliedMessage?: React.ReactNode;
  failedMessage?: React.ReactNode;
  /** With the count: "Apply 3 changes". */
  applyLabel: React.ReactNode;
  /** The one verb for discarding pending changes, with the count: "Undo 3 changes" (5.8). */
  undoLabel: React.ReactNode;
  /** After a failed apply, replaces Apply: "Try applying again". */
  retryLabel?: React.ReactNode;
  onApply: () => void;
  /** Open the Undo confirmation here (a `ConfirmDialog` naming what is lost); the band never undoes directly. */
  onUndo: () => void;
  /** Opens the apply task's output, while applying and after a failure: "Show progress". */
  showProgress?: { label: React.ReactNode; onShow: () => void };
  /**
   * While the page scrolls the band shrinks into the top bar's pending pill and comes back near the
   * top (foundation 10). Off for a band that is not under a sticky top bar (a story, a test).
   */
  shrinkOnScroll?: boolean;
  /** Told when the band shrinks into the pill or comes back. */
  onShrunkChange?: (shrunk: boolean) => void;
}

/** Keeps the band in the document for the length of its closing motion, then lets it go. */
function usePresence(open: boolean): boolean {
  const [present, setPresent] = React.useState(open);
  if (open && !present) {
    setPresent(true);
  }
  React.useEffect(() => {
    if (open || !present) {
      return;
    }
    const timer = window.setTimeout(
      () => setPresent(false),
      Math.max(0, durationToken("--duration-slow")),
    );
    return () => window.clearTimeout(timer);
  }, [open, present]);
  return present;
}

/**
 * The pending-changes band (style guide 5.8, foundation 10): a slim band in the pending gold with
 * navy ink directly under the top bar, the only place the gold appears at size. It says what is waiting,
 * with Apply and Undo; while applying a progress line runs along its foot; on success it reads
 * "Applied" and the caller closes it. It sticks under the top bar, and while the page scrolls it
 * shrinks into the bar's pending pill, coming back near the top. Its words sit in a polite live
 * region, so a change in what is pending, the start of applying, success and failure are announced.
 */
function PendingBand({
  label,
  open,
  state = "idle",
  message,
  applyingMessage,
  appliedMessage,
  failedMessage,
  applyLabel,
  undoLabel,
  retryLabel,
  onApply,
  onUndo,
  showProgress,
  shrinkOnScroll = true,
  onShrunkChange,
  className,
  ref,
  ...props
}: PendingBandProps) {
  const ownRef = React.useRef<HTMLElement | null>(null);
  const present = usePresence(open);
  const shrunk = useShrinkOnScroll(
    shrinkOnScroll && open && state !== "failed",
    { keepWhileFocused: ownRef },
  );
  const reportedRef = React.useRef(false);
  React.useEffect(() => {
    if (reportedRef.current !== shrunk) {
      reportedRef.current = shrunk;
      onShrunkChange?.(shrunk);
    }
  }, [shrunk, onShrunkChange]);

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

  if (!present) {
    return null;
  }

  const applying = state === "applying";
  const applied = state === "applied";
  const failed = state === "failed";
  const shown = open && !shrunk;
  const text =
    applying && applyingMessage
      ? applyingMessage
      : applied && appliedMessage
        ? appliedMessage
        : failed && failedMessage
          ? failedMessage
          : message;

  return (
    <section
      ref={setRef}
      data-slot="pending-band"
      data-state={state}
      data-open={open || undefined}
      data-shrunk={shrunk || undefined}
      aria-label={label}
      aria-busy={applying || undefined}
      className={cn(
        "sticky top-15 z-30 grid grid-rows-[1fr] transition-[grid-template-rows] duration-slow ease-soft compact:top-13",
        "starting:grid-rows-[0fr] [view-transition-name:shell-pending]",
        // Closing gives its room back; shrinking while scrolling does not, so the page never changes
        // height under the reader (which, on a page just taller than the window, would scroll it back
        // to the top and bring the band out again, over and over). Shrunk, it rises under the top
        // bar into the pill and lets every click through.
        !open && "grid-rows-[0fr]",
        shrunk && "pointer-events-none",
        className,
      )}
      {...props}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          inert={!shown}
          className={cn(
            "relative flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-pending px-4 py-2 text-pending-foreground sm:px-6 compact:py-1.5",
            "transition-[opacity,translate] duration-base ease-standard",
            !open && "-translate-y-2 opacity-0",
            shrunk && "-translate-y-full opacity-0",
          )}
        >
          {applying ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 shrink-0 motion-safe:animate-spin"
            />
          ) : applied ? (
            <Check aria-hidden="true" className="size-4 shrink-0" />
          ) : failed ? (
            <OctagonX aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full bg-pending-foreground"
            />
          )}
          <p role="status" className="min-w-0 flex-1 basis-48 font-medium">
            {text}
          </p>
          <div className="flex flex-wrap gap-2">
            {showProgress && (applying || failed) ? (
              <Button
                variant="onPending"
                size="sm"
                onClick={showProgress.onShow}
              >
                {showProgress.label}
              </Button>
            ) : null}
            {/* Kept while applying and once applied, unavailable but focusable, so focus is never
                dropped from under a keyboard user while the band finishes. Unavailable, both are
                dashed outlines in the ink: Apply gives up its fill rather than fading. */}
            <Button
              variant="onPending"
              size="sm"
              disabled={applying || applied}
              focusableWhenDisabled
              onClick={onUndo}
            >
              {undoLabel}
            </Button>
            <Button
              variant="onPending"
              size="sm"
              disabled={applying || applied}
              focusableWhenDisabled
              onClick={onApply}
              className="bg-pending-foreground text-pending hover:bg-transparent hover:text-pending-foreground data-disabled:bg-transparent data-disabled:text-pending-foreground"
            >
              {failed && retryLabel ? retryLabel : applyLabel}
            </Button>
          </div>
          {/* The apply progress line (foundation 7.2): it runs while applying and is full once
              applied; under reduced motion it is a static line beside the words. */}
          <span
            aria-hidden="true"
            data-slot="pending-band-progress"
            className={cn(
              "absolute inset-x-0 bottom-0 h-0.75 origin-left scale-x-0 bg-pending-foreground transition-transform duration-slow ease-standard rtl:origin-right",
              applying && "animate-pending-apply",
              applied && "scale-x-100",
            )}
          />
        </div>
      </div>
    </section>
  );
}

export { PendingBand };
export type { PendingBandProps, PendingBandState };
