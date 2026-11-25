// SPDX-License-Identifier: GPL-3.0-or-later
// Reordering that travels (rethink 7.5 "A row moves to its group", "Sort"; 7.1 rules 3 and 5): FLIP
// on the Web Animations API. Every element under the container marked `data-flip-id` is measured
// before and after a change of order, and each one that moved animates from its old place to its
// new one on the given duration and curve tokens. Under reduced motion it crossfades instead (or
// cuts, when asked). Above `limit` elements it is a cut.
//
// Nothing a reader is reading moves (7.1 rule 3): while the pointer or keyboard focus is inside the
// container the order is held, the items' new data still shows in place, and `waiting` says a move
// is waiting, so the caller can offer it ("1 row changed. Show it"). `release()` runs it; so does the
// pointer and focus leaving. A second change interrupts the first, which jumps to its end. Written
// for the library (spec 8 row 7).
import type { FocusEvent, RefCallback } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { CurveToken, DurationToken } from "./tokens.ts";
import { animate, curveAt, durationAt } from "./tokens.ts";
import { useReducedMotion } from "./useReducedMotion.ts";

export interface FlipOptions {
  /** How long a move takes: `--duration-slow` by default. */
  duration?: DurationToken;
  /** Its curve: `--ease-soft` by default. */
  curve?: CurveToken;
  /** The reduced form: a crossfade of what moved (the default) or a cut. */
  reduced?: "crossfade" | "cut";
  /** Above this many elements a change of order is a cut (7.5 "Sort"). 50 by default. */
  limit?: number;
  /** Hold the order while the pointer or focus is inside. True by default. */
  hold?: boolean;
}

export interface FlipContainerProps {
  ref: RefCallback<HTMLElement>;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
}

export interface Flip<T> {
  /** The items in the order to render now: the held order while a move waits. */
  items: readonly T[];
  /** A change of order is waiting for the pointer or focus to leave, or for `release()`. */
  waiting: boolean;
  /** Run the waiting move now. */
  release: () => void;
  /** Spread on the container whose `data-flip-id` descendants move. */
  containerProps: FlipContainerProps;
}

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key, i) => key === b[i]);

/** The held order: what is still there in its old place, anything new after it. */
export function heldOrder(
  shown: readonly string[],
  wanted: readonly string[],
): string[] {
  const now = new Set(wanted);
  const before = new Set(shown);
  return [
    ...shown.filter((key) => now.has(key)),
    ...wanted.filter((key) => !before.has(key)),
  ];
}

interface Place {
  x: number;
  y: number;
}

function measure(root: HTMLElement): Map<string, Place> {
  const box = root.getBoundingClientRect();
  const places = new Map<string, Place>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-flip-id]")) {
    const rect = el.getBoundingClientRect();
    places.set(el.dataset.flipId ?? "", {
      x: rect.left - box.left,
      y: rect.top - box.top,
    });
  }
  return places;
}

export function useFlip<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  options: FlipOptions = {},
): Flip<T> {
  const {
    duration = "--duration-slow",
    curve = "--ease-soft",
    reduced: reducedForm = "crossfade",
    limit = 50,
    hold = true,
  } = options;
  const reduced = useReducedMotion();
  const wanted = items.map(keyOf);
  const [order, setOrder] = useState<readonly string[]>(wanted);
  const [pointerIn, setPointerIn] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const inside = hold && (pointerIn || focusIn);

  // Adjusting state while rendering (react.dev, "storing information from previous renders"): the
  // order to show is known in the same render that changes it, so nothing jumps and back.
  const next = inside ? heldOrder(order, wanted) : wanted;
  let shown = order;
  if (!same(next, order)) {
    shown = next;
    setOrder(next);
  }
  const waiting = !same(shown, wanted);

  const rootRef = useRef<HTMLElement | null>(null);
  const placesRef = useRef<Map<string, Place>>(new Map());
  const measuredRef = useRef<readonly string[]>(shown);
  const runningRef = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const moved = !same(measuredRef.current, shown);
    const busy = runningRef.current.some((a) => a.playState === "running");
    if (!moved && busy) {
      // Mid-move and nothing new: the stored places are the move's ends, which stand.
      return;
    }
    // A second change interrupts the first, which jumps to its end before anything is measured.
    for (const animation of runningRef.current) {
      animation.finish();
    }
    runningRef.current = [];
    const before = placesRef.current;
    const after = measure(root);
    placesRef.current = after;
    measuredRef.current = shown;
    if (!moved || before.size === 0 || after.size > limit) {
      return;
    }
    if (reduced && reducedForm === "cut") {
      return;
    }
    for (const el of root.querySelectorAll<HTMLElement>("[data-flip-id]")) {
      const key = el.dataset.flipId ?? "";
      const from = before.get(key);
      const to = after.get(key);
      // A shift of a pixel or two is a neighbour growing a line, not a move.
      if (
        !from ||
        !to ||
        (Math.abs(from.y - to.y) < 2 && Math.abs(from.x - to.x) < 2)
      ) {
        continue;
      }
      const animation = reduced
        ? animate(el, [{ opacity: 0 }, { opacity: 1 }], {
            duration: durationAt(el, "--duration-fast"),
            easing: curveAt(el, "--ease-standard"),
          })
        : animate(
            el,
            [
              {
                translate: `${String(from.x - to.x)}px ${String(from.y - to.y)}px`,
              },
              { translate: "0 0" },
            ],
            { duration: durationAt(el, duration), easing: curveAt(el, curve) },
          );
      if (animation) {
        runningRef.current.push(animation);
      }
    }
  });

  const release = useCallback(() => {
    setOrder(items.map(keyOf));
  }, [items, keyOf]);

  const ref = useCallback((el: HTMLElement | null) => {
    rootRef.current = el;
  }, []);

  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const ordered = shown.flatMap((key) => {
    const item = byKey.get(key);
    return item === undefined ? [] : [item];
  });

  return {
    items: ordered,
    waiting,
    release,
    containerProps: {
      ref,
      onPointerEnter: () => {
        setPointerIn(true);
      },
      onPointerLeave: () => {
        setPointerIn(false);
      },
      onFocus: () => {
        setFocusIn(true);
      },
      onBlur: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusIn(false);
        }
      },
    },
  };
}
