// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";

interface CommandKeysOptions {
  /** Opens the command palette: `/`, or Ctrl+K (Cmd+K on a Mac). */
  onOpenPalette: () => void;
  /** Jump keys: `g` then the letter (foundation 13). Each letter runs its function. */
  jumps: Readonly<Record<string, () => void>>;
  /** How long after `g` the letter still counts, in milliseconds. */
  window?: number;
  /** Off while something else owns the keyboard (the palette itself is open). */
  enabled?: boolean;
}

/** A field, an editable region or anything that takes typed text: shortcuts never fire there. */
const TYPING =
  "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox'], [role='searchbox']";

/** A dialog or menu is in front: single-key shortcuts would act on the page behind it. */
const IN_FRONT =
  "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']";

/**
 * The keyboard paths to the palette and the jump keys, on the window. `/` and `g` then a letter are
 * ignored while typing (in any field), with a modifier held, and while a dialog or menu is in front;
 * Ctrl+K or Cmd+K opens the palette from anywhere, a field included.
 */
export function useCommandKeys({
  onOpenPalette,
  jumps,
  window: leaderWindow = 1200,
  enabled = true,
}: CommandKeysOptions): void {
  const latestRef = React.useRef({ onOpenPalette, jumps });
  React.useEffect(() => {
    latestRef.current = { onOpenPalette, jumps };
  });
  React.useEffect(() => {
    if (!enabled) {
      return;
    }
    let leaderAt = 0;
    const onKey = (event: KeyboardEvent) => {
      // Not `defaultPrevented`: a focused button that is unavailable (Base UI's focusable disabled
      // button, a Save after saving) prevents every key, and the jump keys must still work there.
      // Widgets that take letters themselves are excluded by role below.
      if (event.isComposing) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (
        (event.key === "k" || event.key === "K") &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        leaderAt = 0;
        latestRef.current.onOpenPalette();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (target?.closest(TYPING) || target?.closest(IN_FRONT)) {
        leaderAt = 0;
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        leaderAt = 0;
        latestRef.current.onOpenPalette();
        return;
      }
      if (event.key === "g" && !event.shiftKey) {
        leaderAt = performance.now();
        return;
      }
      const now = performance.now();
      const jump = latestRef.current.jumps[event.key];
      const led = leaderAt !== 0 && now - leaderAt <= leaderWindow;
      leaderAt = 0;
      if (jump && led) {
        event.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, leaderWindow]);
}
