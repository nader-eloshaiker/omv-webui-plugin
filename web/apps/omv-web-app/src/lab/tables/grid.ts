// SPDX-License-Identifier: GPL-3.0-or-later
// The table pattern's keyboard and motion (rethink spec 4.7, 7.5), lab-local until the owner has
// seen them: development only (UI-11). Candidates for the library's DataTable (roving row focus) and
// its motion helpers (`useFlip`). Nothing here writes a style attribute: focus moves through the
// DOM, and rows travel through the Web Animations API (UI-1).
import type { KeyboardEvent, RefObject } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** The tab an arrow, Home or End key moves to from `index`, or null for any other key. */
export function filterKeyTarget(
  key: string,
  index: number,
  length: number,
  rtl = false,
): number | null {
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
  switch (key) {
    case forward:
    case "ArrowDown":
      return (index + 1) % length;
    case back:
    case "ArrowUp":
      return (index - 1 + length) % length;
    case "Home":
      return 0;
    case "End":
      return length - 1;
    default:
      return null;
  }
}

/** Reduced motion: the system setting, or the lab's "Animations: Reduced" (spec decision 3). */
export function reducedMotion(): boolean {
  return (
    document.documentElement.dataset.motion === "reduced" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function token(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const match = /^([\d.]+)(ms|s)$/u.exec(raw);
  if (!match) {
    return fallback;
  }
  const n = Number(match[1]);
  return match[2] === "s" ? n * 1000 : n;
}

/** A curve token as the page resolves it (a `linear()` spring), for the Web Animations API. */
export function easing(name: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value === "" ? "ease-out" : value;
}

export interface GridHandlers {
  /** Enter: open the row's page. */
  onOpen: (key: string) => void;
  /** Space: select or deselect the row. Left out where the table has no bulk actions. */
  onToggleSelect?: (key: string) => void;
  /** Right and Left: expand or collapse the row's detail. */
  onExpand: (key: string, open: boolean) => void;
  /** "." or Shift F10: open the row's menu. */
  onMenu: (key: string) => void;
  /** Escape: clear the selection. */
  onEscape: () => void;
  /** "/": the search field, when the table has one. */
  searchRef?: RefObject<HTMLInputElement | null>;
}

/**
 * One tab stop for the whole table (4.7): the active row holds `tabIndex=0`, every other row -1.
 * Arrows, Home and End move between rows; the row's own controls are in the tab order only while
 * their row is active, so Tab from a row reaches its actions and then leaves the table. Keys typed
 * inside a control (a button's Space) are left to the control.
 */
export function useRowGrid(keys: readonly string[], handlers: GridHandlers) {
  const [active, setActive] = useState<string | null>(null);
  const rowsRef = useRef(new Map<string, HTMLElement>());
  // The active row, or the first one when it is gone (filtered away, removed).
  const current =
    active !== null && keys.includes(active) ? active : (keys[0] ?? null);

  const focusRow = useCallback((key: string) => {
    setActive(key);
    const el = rowsRef.current.get(key);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  const register = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) {
        rowsRef.current.set(key, el);
      } else {
        rowsRef.current.delete(key);
      }
    },
    [],
  );

  const onKeyDown = (key: string) => (event: KeyboardEvent<HTMLElement>) => {
    const onRow = event.target === event.currentTarget;
    const i = keys.indexOf(key);
    if (event.key === "/" && handlers.searchRef?.current) {
      event.preventDefault();
      handlers.searchRef.current.focus();
      return;
    }
    if (event.key === "Escape") {
      handlers.onEscape();
      return;
    }
    if (!onRow) {
      return;
    }
    const go = (next: string | undefined) => {
      if (next !== undefined) {
        event.preventDefault();
        focusRow(next);
      }
    };
    switch (event.key) {
      case "ArrowDown":
        go(keys[i + 1]);
        return;
      case "ArrowUp":
        go(keys[i - 1]);
        return;
      case "Home":
        go(keys[0]);
        return;
      case "End":
        go(keys.at(-1));
        return;
      case "ArrowRight":
        event.preventDefault();
        handlers.onExpand(key, true);
        return;
      case "ArrowLeft":
        event.preventDefault();
        handlers.onExpand(key, false);
        return;
      case "Enter":
        event.preventDefault();
        handlers.onOpen(key);
        return;
      case " ":
        if (handlers.onToggleSelect) {
          event.preventDefault();
          handlers.onToggleSelect(key);
        }
        return;
      case ".":
        event.preventDefault();
        handlers.onMenu(key);
        return;
      case "F10":
        if (event.shiftKey) {
          event.preventDefault();
          handlers.onMenu(key);
        }
        return;
      default:
    }
  };

  /** Props for a row: its tab stop, its keys, and becoming active when anything in it is focused. */
  const rowProps = (key: string) => ({
    ref: register(key),
    tabIndex: key === current ? 0 : -1,
    onKeyDown: onKeyDown(key),
    onFocus: () => {
      if (active !== key) {
        setActive(key);
      }
    },
  });

  /** Makes a row the tab stop without moving focus (focus already arrived inside it). */
  const activate = (key: string) => {
    if (active !== key) {
      setActive(key);
    }
  };

  return { current, rowProps, focusRow, activate };
}

/**
 * Rows that change place glide there (7.5 "A row moves to its group", "Sort"): after each render the
 * elements under `container` marked `data-flip` (rows, and a group's body) are measured, and a row whose place changed animates from
 * the old place to the new (FLIP), on `duration-slow` and `ease-soft`. Above 50 rows it is a cut.
 * Reduced motion: a row that moved crossfades in instead of travelling (7.1 rule 5).
 */
export function useFlip(container: RefObject<HTMLElement | null>) {
  const lastRef = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) {
      return;
    }
    const els = [...root.querySelectorAll<HTMLElement>("[data-flip]")];
    const next = new Map<string, number>();
    for (const el of els) {
      // Measured against the nearest flipping ancestor (a group's body), so a row that travels with
      // its group is not moved twice.
      const scope = el.parentElement?.closest("[data-flip]") ?? root;
      next.set(
        el.dataset.flip ?? "",
        el.getBoundingClientRect().top - scope.getBoundingClientRect().top,
      );
    }
    const previous = lastRef.current;
    lastRef.current = next;
    if (previous.size === 0 || els.length > 50) {
      return;
    }
    const reduced = reducedMotion();
    const duration = token("--duration-slow", 360);
    for (const el of els) {
      const before = previous.get(el.dataset.flip ?? "");
      const after = next.get(el.dataset.flip ?? "");
      // A shift of a pixel or two is a neighbour growing a line, not a move.
      if (
        before === undefined ||
        after === undefined ||
        Math.abs(before - after) < 2
      ) {
        continue;
      }
      if (reduced) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: token("--duration-fast", 160),
          easing: "ease-out",
        });
      } else {
        el.animate(
          [
            { translate: `0 ${String(before - after)}px` },
            { translate: "0 0" },
          ],
          { duration, easing: easing("--ease-soft") },
        );
      }
    }
  });
}
