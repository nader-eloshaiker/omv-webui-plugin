// SPDX-License-Identifier: GPL-3.0-or-later
import { cva, type VariantProps } from "class-variance-authority";
import { Lightbulb } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { LeavingItem } from "../leaving-item/leaving-item";
import { useReducedMotion } from "../motion/reduced-motion";
import { useTipTurn, useTips } from "./tips-context";

const tipClass = cva(
  "flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 " +
    // A tip that appears because of something the person did rises in; one there when the page
    // opens is simply there. Under reduced motion the rise is a short fade (7.1 rule 5).
    "data-[arrive=rise]:animate-rise data-[arrive=fade]:animate-[fade-in_var(--duration-fast)_var(--ease-standard)_both]",
  {
    variants: {
      size: {
        // One plain line beside the thing it explains.
        default: "text-sm text-muted-foreground",
        // The one tip that speaks at body size: the welcome, the first thing on the dashboard.
        lead: "text-body text-foreground",
      },
    },
    defaultVariants: { size: "default" },
  },
);

const iconClass = cva("inline-flex flex-none", {
  variants: {
    size: {
      default: "text-tertiary-foreground [&>svg]:size-4",
      lead: "text-muted-foreground [&>svg]:size-5",
    },
  },
  defaultVariants: { size: "default" },
});

type TipProps = Omit<React.ComponentProps<"div">, "children" | "id"> &
  VariantProps<typeof tipClass> & {
    /** Its first-time flag, as the app's `TipsProvider` knows it. */
    id: string;
    /** Whether it has something to explain yet: after a first save, say. On by default. */
    when?: boolean;
    /** The dismiss button's words: "Got it". */
    dismissLabel: string;
    /**
     * The dismiss button's accessible name, which says which tip it hides: "Got it, hide the tip
     * about the yellow bar".
     */
    dismissName: string;
    /** In place of the lightbulb: the welcome leads with the NAS. Decorative. */
    icon?: React.ReactNode;
    /** Links that belong to the line, before the dismiss button. */
    actions?: React.ReactNode;
    /** The line itself: a whole sentence. */
    children: React.ReactNode;
  };

/**
 * A first-time tip (rethink P.3, layer G2): one plain line beside the thing it explains, with a
 * lightbulb and a dismiss button. No box: no border, tint, card, left edge or shadow, and never on top
 * of anything (no popover, coach mark or spotlight).
 *
 * A tip shows while all of these hold: "Show tips" is on, this browser has not seen it, it has
 * something to explain (`when`), and it has the turn (one tip at a time, in reading order). It ends
 * on its dismiss button or on its first success, which the page reports through the app's flags;
 * either way it folds up (`LeavingItem`) and the next tip in reading order may show. Needs a
 * `TipsProvider` round it.
 */
function Tip({
  id,
  when = true,
  dismissLabel,
  dismissName,
  icon,
  actions,
  size,
  className,
  children,
  ...props
}: TipProps) {
  const { show, isSeen, endTip } = useTips();
  const reduced = useReducedMotion();
  const seen = isSeen(id);
  const [prevSeen, setPrevSeen] = React.useState(seen);
  const [prevTurn, setPrevTurn] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [arrive, setArrive] = React.useState(false);

  // A tip on screen whose flag has just been set folds up; it holds its turn while it does, so the
  // next tip waits until it has gone.
  const justSeen = seen && !prevSeen;
  const leavingNow = show && (leaving || (justSeen && prevTurn));
  const { turn, settled, anchor } = useTipTurn(
    id,
    (when && !seen) || leavingNow,
  );
  // Adjusting state while rendering: what changed is known in the render that shows it.
  if (seen !== prevSeen) {
    setPrevSeen(seen);
    if (justSeen && prevTurn) {
      setLeaving(true);
    }
  }
  if (leaving && !show) {
    setLeaving(false);
  }
  if (turn !== prevTurn) {
    setPrevTurn(turn);
    setArrive(turn && settled);
  }

  return (
    <div ref={anchor} data-slot="tip-slot" data-tip={id} className="contents">
      {turn ? (
        <LeavingItem
          render={<div />}
          leaving={leavingNow}
          onLeft={() => {
            setLeaving(false);
          }}
        >
          <div
            data-slot="tip"
            data-arrive={arrive ? (reduced ? "fade" : "rise") : undefined}
            className={cn(tipClass({ size }), className)}
            {...props}
          >
            <span aria-hidden="true" className={iconClass({ size })}>
              {icon ?? <Lightbulb />}
            </span>
            <p className="m-0 min-w-0 flex-[0_1_auto]">{children}</p>
            {actions}
            <Button
              variant="plain"
              size="sm"
              className="flex-none"
              aria-label={dismissName}
              onClick={() => {
                endTip(id);
              }}
            >
              {dismissLabel}
            </Button>
          </div>
        </LeavingItem>
      ) : null}
    </div>
  );
}

export { Tip };
export type { TipProps };
