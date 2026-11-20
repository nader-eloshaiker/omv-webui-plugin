// SPDX-License-Identifier: GPL-3.0-or-later
// The theme on <html> (docs/02, "Theme"). With no class the stylesheet follows the operating system
// through prefers-color-scheme, with no script at all. A class records only an explicit choice.
import type { ThemePreference } from "../../stores/useThemeStore.ts";

export function applyTheme(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
): void {
  root.classList.toggle("light", preference === "light");
  root.classList.toggle("dark", preference === "dark");
}
