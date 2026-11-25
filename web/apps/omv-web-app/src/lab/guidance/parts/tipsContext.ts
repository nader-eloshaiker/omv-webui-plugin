// SPDX-License-Identifier: GPL-3.0-or-later
// What every first-time tip reads from TipsProvider (rethink P.3, layer G2): whether tips show, and
// whose turn it is. Development only (UI-11) until the owner has seen it.
import { createContext, use, useLayoutEffect, useState } from "react";
import type { SeenKey } from "../../../stores/useSeenStore.ts";
import { useSeenStore } from "../../../stores/useSeenStore.ts";
import { useTipsStore } from "../../../stores/useTipsStore.ts";

export interface TipsContextValue {
  show: boolean;
  setShow: (show: boolean) => void;
  turn: string | null;
  /** False until the page has been drawn once: a tip that appears later answers a cause. */
  settled: boolean;
  want: (id: string, el: Element) => void;
  release: (id: string) => void;
}

export const TipsContext = createContext<TipsContextValue | null>(null);

/** A tip's first success: it ends in this browser, whether or not it was on screen. */
export function endTip(id: SeenKey): void {
  useSeenStore.getState().markSeen(id);
}

/**
 * "Show tips", as a value and its setter. Inside a `TipsProvider` it is the provider's; outside
 * one, the stored preference.
 */
export function useShowTips(): [boolean, (show: boolean) => void] {
  const ctx = use(TipsContext);
  const stored = useTipsStore((s) => s.show);
  const setStored = useTipsStore((s) => s.setShow);
  return ctx ? [ctx.show, ctx.setShow] : [stored, setStored];
}

/** The id of the tip whose turn it is (on screen, or leaving), or null. */
export function useCurrentTip(): string | null {
  return use(TipsContext)?.turn ?? null;
}

/**
 * Whether the tip `id` may show now. Give `anchor` to the element that stands where the tip sits,
 * and keep that element the same while the tip waits, shows and leaves: its place in the document
 * is the tip's place in reading order. With tips off a tip never wants a turn. Outside a
 * `TipsProvider` there is no queue, and a wanted tip always has its turn.
 */
export function useTipTurn(
  id: string,
  wants: boolean,
): {
  turn: boolean;
  /** Whether the tip came after the page was first drawn, so it answers a cause (it rises in). */
  settled: boolean;
  anchor: (el: Element | null) => void;
} {
  const ctx = use(TipsContext);
  const stored = useTipsStore((s) => s.show);
  const [el, setEl] = useState<Element | null>(null);
  const active = wants && (ctx ? ctx.show : stored);
  const want = ctx?.want;
  const release = ctx?.release;
  useLayoutEffect(() => {
    if (!active || !el || !want || !release) {
      return;
    }
    want(id, el);
    return () => {
      release(id);
    };
  }, [active, el, id, want, release]);
  return {
    turn: active && (ctx ? ctx.turn === id : true),
    settled: ctx?.settled ?? true,
    anchor: setEl,
  };
}
