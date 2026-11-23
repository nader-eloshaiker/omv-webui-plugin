// SPDX-License-Identifier: GPL-3.0-or-later
// The lab's keyboard shortcuts: development only (UI-11). "/" or Ctrl+K (Cmd+K) opens the palette;
// "g" then "o", "s" or "f" jumps to Overview, Storage or Photos. Ignored while typing in a field.
import { useEffect } from "react";
import type { Screen } from "./state.ts";
import { useLab } from "./state.ts";

export function usePaletteShortcuts(open: () => void) {
  const lab = useLab();
  useEffect(() => {
    let leader = 0;
    const jumps: Record<string, Screen> = {
      o: "dashboard",
      s: "storage",
      f: "folder",
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest(
        "input, textarea, select, [contenteditable='true']",
      );
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        open();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        open();
        return;
      }
      if (e.key === "g") {
        leader = Date.now();
        return;
      }
      const screen = jumps[e.key];
      if (screen && Date.now() - leader < 1200) {
        leader = 0;
        lab.go(screen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [lab, open]);
}
