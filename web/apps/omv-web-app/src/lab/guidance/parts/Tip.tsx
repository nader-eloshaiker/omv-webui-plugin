// SPDX-License-Identifier: GPL-3.0-or-later
// A first-time tip (rethink P.3, layer G2): one plain line beside the thing it explains, with a
// lightbulb and "Got it". No box: no border, tint, card, left edge or shadow, and never on top of
// anything (no popover, coach mark or spotlight; R1). Development only (UI-11) until the owner has
// seen it; written to move into the library.
//
// A tip shows while all of these hold: "Show tips" is on, this browser has not seen it
// (useSeenStore), it has something to explain (`when`), and it has the turn (one tip at a time,
// TipsProvider). It ends on "Got it" or on its first success, which the page reports with
// `endTip(id)`; either way the flag is set, the tip folds up (`animate-leave`) and the next tip in
// reading order may show. A tip that appears after the page was drawn, because of something the
// person did, rises in (`animate-rise`); one that is there when the page opens is simply there.
import { Button, LeavingItem } from "@omv-webui/react-ui-components";
import { Lightbulb } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { SeenKey } from "../../../stores/useSeenStore.ts";
import { hasSeen, useSeenStore } from "../../../stores/useSeenStore.ts";
import { endTip, useShowTips, useTipTurn } from "./tipsContext.ts";

export interface TipProps {
  /** Its first-time flag. */
  id: SeenKey;
  /** Whether it has something to explain yet: after a first save, say. On by default. */
  when?: boolean;
  /**
   * What the tip is about, for the accessible name of "Got it": "the yellow bar" gives "Got it,
   * hide the tip about the yellow bar".
   */
  about: string;
  /** In place of the lightbulb: the welcome leads with the NAS. */
  icon?: ReactNode;
  /** Links that belong to the line, before "Got it". */
  actions?: ReactNode;
  /** The line itself: a whole sentence. */
  children: ReactNode;
  className?: string;
}

export function Tip({
  id,
  when = true,
  about,
  icon,
  actions,
  children,
  className,
}: TipProps) {
  const seen = useSeenStore(hasSeen(id));
  const [show] = useShowTips();
  const [prevSeen, setPrevSeen] = useState(seen);
  const [prevTurn, setPrevTurn] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [arrive, setArrive] = useState(false);

  // A tip on screen whose flag has just been set folds up; it holds its turn while it does, so the
  // next tip waits until it has gone.
  const justSeen = seen && !prevSeen;
  const leavingNow = show && (leaving || (justSeen && prevTurn));
  const { turn, settled, anchor } = useTipTurn(
    id,
    (when && !seen) || leavingNow,
  );
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
    <div ref={anchor} className="g-tip-slot" data-tip={id}>
      {turn ? (
        <LeavingItem
          render={<div />}
          leaving={leavingNow}
          onLeft={() => {
            setLeaving(false);
          }}
          className="g-tip-leave"
        >
          <div
            className={className ? `g-tip ${className}` : "g-tip"}
            data-arrive={arrive || undefined}
          >
            <span className="g-tip-icon" aria-hidden="true">
              {icon ?? <Lightbulb />}
            </span>
            <p className="g-tip-line">{children}</p>
            {actions}
            <Button
              variant="plain"
              size="sm"
              className="g-tip-done"
              aria-label={`Got it, hide the tip about ${about}`}
              onClick={() => {
                endTip(id);
              }}
            >
              Got it
            </Button>
          </div>
        </LeavingItem>
      ) : null}
    </div>
  );
}
