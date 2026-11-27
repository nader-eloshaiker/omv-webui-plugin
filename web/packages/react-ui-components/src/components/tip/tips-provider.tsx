// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import type { TipQueue } from "./tip-queue";
import { EMPTY_TIP_QUEUE, releaseTurn, wantTurn } from "./tip-queue";
import type { TipsContextValue } from "./tips-context";
import { TipsContext } from "./tips-context";

interface TipsProviderProps {
  /** "Show tips" is on: the app's stored preference, or a value a view seeds without writing it. */
  show: boolean;
  /** A control here changed "Show tips" (the switch, the palette's entry). */
  onShowChange?: (show: boolean) => void;
  /** The ids of the tips that have ended in this browser: the app's first-time flags. */
  seen: readonly string[];
  /** A tip ended ("Got it", or its first success): the app remembers it. */
  onSeen: (id: string) => void;
  children: React.ReactNode;
}

const noop = () => undefined;

/**
 * The tips preference and the one-at-a-time rule for first-time tips (rethink P.3, layer G2). It
 * holds what every `Tip` needs: whether tips are shown, which have been seen (both from the app), and
 * whose turn it is: several tips may want to show at once, and only the first in reading order does
 * (tip-queue.ts). Renders no element.
 */
function TipsProvider({
  show,
  onShowChange = noop,
  seen,
  onSeen,
  children,
}: TipsProviderProps) {
  const [queue, setQueue] = React.useState<TipQueue>(EMPTY_TIP_QUEUE);
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSettled(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  const want = React.useCallback((id: string, el: Element) => {
    setQueue((q) => wantTurn(q, id, el));
  }, []);
  const release = React.useCallback((id: string) => {
    setQueue((q) => releaseTurn(q, id));
  }, []);
  const seenSet = React.useMemo(() => new Set(seen), [seen]);
  const isSeen = React.useCallback((id: string) => seenSet.has(id), [seenSet]);
  const value = React.useMemo<TipsContextValue>(
    () => ({
      show,
      setShow: onShowChange,
      isSeen,
      endTip: onSeen,
      turn: queue.turn,
      settled,
      want,
      release,
    }),
    [show, onShowChange, isSeen, onSeen, queue.turn, settled, want, release],
  );
  return <TipsContext value={value}>{children}</TipsContext>;
}

export { TipsProvider };
export type { TipsProviderProps };
