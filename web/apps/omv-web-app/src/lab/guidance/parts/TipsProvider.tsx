// SPDX-License-Identifier: GPL-3.0-or-later
// The tips preference and the one-at-a-time rule for first-time tips (rethink P.3, layer G2).
// Development only (UI-11) until the owner has seen it; written to move into the library as it is.
//
// `TipsProvider` holds two things every tip needs: whether tips are shown ("Show tips"), the stored
// preference by default or a value the caller passes (the lab seeds it from the query string
// without writing the store, UI-4); and whose turn it is (tipQueue.ts).
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTipsStore } from "../../../stores/useTipsStore.ts";
import type { TipQueue } from "./tipQueue.ts";
import { EMPTY_QUEUE, releaseTurn, wantTurn } from "./tipQueue.ts";
import { TipsContext } from "./tipsContext.ts";

export function TipsProvider({
  show,
  onShowChange,
  children,
}: {
  /** Whether tips show. Leave it out to follow the stored "Show tips" preference. */
  show?: boolean;
  /** Called when a control here changes "Show tips". Leave it out to write the stored preference. */
  onShowChange?: (show: boolean) => void;
  children: ReactNode;
}) {
  const stored = useTipsStore((s) => s.show);
  const setStored = useTipsStore((s) => s.setShow);
  const [queue, setQueue] = useState<TipQueue>(EMPTY_QUEUE);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSettled(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  const want = useCallback((id: string, el: Element) => {
    setQueue((q) => wantTurn(q, id, el));
  }, []);
  const release = useCallback((id: string) => {
    setQueue((q) => releaseTurn(q, id));
  }, []);
  const shown = show ?? stored;
  const setShow = onShowChange ?? setStored;
  const value = useMemo(
    () => ({ show: shown, setShow, turn: queue.turn, settled, want, release }),
    [shown, setShow, queue.turn, settled, want, release],
  );
  return <TipsContext value={value}>{children}</TipsContext>;
}
