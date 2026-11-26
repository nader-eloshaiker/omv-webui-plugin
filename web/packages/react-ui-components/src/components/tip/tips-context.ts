// SPDX-License-Identifier: GPL-3.0-or-later
// What every first-time tip reads from `TipsProvider` (rethink P.3, layer G2): whether tips show,
// which tips this browser has seen, how to end one, and whose turn it is. The library keeps none of
// it: the app passes its stored "Show tips" preference and first-time flags to the provider (UI-13).
import { createContext, use, useLayoutEffect, useState } from "react";

export interface TipsContextValue {
  /** "Show tips" is on. */
  show: boolean;
  /** Change "Show tips". */
  setShow: (show: boolean) => void;
  /** Whether the tip `id` has ended in this browser ("Got it", or its first success). */
  isSeen: (id: string) => boolean;
  /** End the tip `id` for good: "Got it", or its first success. */
  endTip: (id: string) => void;
  /** The tip whose turn it is (on screen, or leaving), or null. */
  turn: string | null;
  /** False until the page has been drawn once: a tip that appears later answers a cause. */
  settled: boolean;
  want: (id: string, el: Element) => void;
  release: (id: string) => void;
}

export const TipsContext = createContext<TipsContextValue | null>(null);

const noop = () => undefined;

/**
 * The tips state of the enclosing `TipsProvider`. Throws outside one: a tip cannot know whether it
 * was seen without the app's flags.
 */
export function useTips(): TipsContextValue {
  const ctx = use(TipsContext);
  if (!ctx) {
    throw new Error("A tip needs a TipsProvider round it.");
  }
  return ctx;
}

/**
 * "Show tips", as a value and its setter. Outside a `TipsProvider` tips count as on and the setter
 * does nothing, so help that folds with tips off (`HelpDisclosure`) works on any page.
 */
export function useShowTips(): [boolean, (show: boolean) => void] {
  const ctx = use(TipsContext);
  return ctx ? [ctx.show, ctx.setShow] : [true, noop];
}

/** The id of the tip whose turn it is (on screen, or leaving), or null. */
export function useCurrentTip(): string | null {
  return use(TipsContext)?.turn ?? null;
}

/**
 * Whether the tip `id` may show now. Give `anchor` to the element that stands where the tip sits,
 * and keep that element the same while the tip waits, shows and leaves: its place in the document
 * is the tip's place in reading order. With tips off a tip never wants a turn.
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
  const { show, turn, settled, want, release } = useTips();
  const [el, setEl] = useState<Element | null>(null);
  const active = wants && show;
  useLayoutEffect(() => {
    if (!active || !el) {
      return;
    }
    want(id, el);
    return () => {
      release(id);
    };
  }, [active, el, id, want, release]);
  return { turn: active && turn === id, settled, anchor: setEl };
}
