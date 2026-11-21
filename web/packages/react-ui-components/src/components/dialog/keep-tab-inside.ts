// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";

// What the browser can reach with Tab. Elements with a positive tabindex are not ordered first: the
// library never sets one.
const candidates =
  'a[href],area[href],button,input,select,textarea,summary,iframe,[tabindex],[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';

function tabbableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(candidates)).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !(element instanceof HTMLInputElement && element.type === "hidden") &&
      element.closest("[inert],[hidden]") === null &&
      (typeof element.checkVisibility !== "function" ||
        element.checkVisibility({ visibilityProperty: true })),
  );
}

/**
 * The popup's `onKeyDown` for a modal: Tab on the last control moves to the first, Shift+Tab on the
 * first (or on the popup itself) moves to the last, in the same keystroke.
 *
 * Base UI's modal trap (1.9) wraps with focus guards beside the popup whose handler moves focus on the
 * next animation frame, and leaves the page behind only `aria-hidden`, not `inert`. Until that frame
 * runs focus sits on a guard outside the popup, and a second Tab (key repeat, a fast typist, a
 * throttled background tab) walks on to the body and the page's own links. Wrapping here, before the
 * browser moves focus, means focus never reaches the guards; they stay as Base UI's fallback for the
 * cases this does not handle (no control inside, a screen reader's virtual cursor).
 */
function keepTabInside(event: React.KeyboardEvent<HTMLElement>): void {
  if (
    event.key !== "Tab" ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return;
  }
  const popup = event.currentTarget;
  const tabbable = tabbableIn(popup);
  const first = tabbable[0];
  const last = tabbable[tabbable.length - 1];
  if (first === undefined || last === undefined) {
    // Nothing to move to: Base UI stops Tab itself.
    return;
  }
  const active = popup.ownerDocument.activeElement;
  if (event.shiftKey && (active === first || active === popup)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export { keepTabInside };
