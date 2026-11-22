// SPDX-License-Identifier: GPL-3.0-or-later
// A dialog whose designed Tab order is not its reading order (phase 5 shares design 8.6: Cancel, the
// typed field, the confirm button, then "Remove and keep the files instead"). The page keeps its
// reading order for the eye and the screen reader's virtual cursor; Tab and Shift+Tab follow the
// sequence instead, wrapping at its ends. A stop that is not itself reachable by Tab stands for the
// controls inside it, in document order (a group of fields). Focus on anything outside the sequence
// moves as the browser moves it.
import type { KeyboardEvent } from "react";

const CANDIDATES =
  'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable]:not([contenteditable="false"])';

const reachable = (element: HTMLElement): boolean =>
  element.isConnected &&
  element.tabIndex >= 0 &&
  !element.matches(":disabled") &&
  !(element instanceof HTMLInputElement && element.type === "hidden") &&
  element.closest("[inert],[hidden]") === null &&
  (typeof element.checkVisibility !== "function" ||
    element.checkVisibility({ visibilityProperty: true }));

/** The controls Tab visits, in order: each stop itself, or the reachable controls inside it. */
export function tabStops(
  stops: readonly (HTMLElement | null | undefined)[],
): HTMLElement[] {
  return stops.flatMap((stop) => {
    if (stop === null || stop === undefined || !stop.isConnected) {
      return [];
    }
    if (stop.matches(CANDIDATES) && reachable(stop)) {
      return [stop];
    }
    return Array.from(stop.querySelectorAll<HTMLElement>(CANDIDATES)).filter(
      reachable,
    );
  });
}

/** Where Tab (or Shift+Tab) goes from `active`; null when `active` is not in the sequence. */
export function nextStop(
  order: readonly HTMLElement[],
  active: Element | null,
  backwards: boolean,
): HTMLElement | null {
  const at = order.findIndex((element) => element === active);
  if (at < 0 || order.length < 2) {
    return null;
  }
  const step = backwards ? -1 : 1;
  return order[(at + step + order.length) % order.length] ?? null;
}

/** A dialog's `onKeyDown`: Tab and Shift+Tab follow `stops`, before the dialog's own wrapping. */
export function followTabSequence(
  event: KeyboardEvent<HTMLElement>,
  stops: readonly (HTMLElement | null | undefined)[],
): void {
  if (
    event.key !== "Tab" ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return;
  }
  const next = nextStop(
    tabStops(stops),
    event.currentTarget.ownerDocument.activeElement,
    event.shiftKey,
  );
  if (next !== null) {
    event.preventDefault();
    next.focus();
  }
}
