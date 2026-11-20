// SPDX-License-Identifier: GPL-3.0-or-later
import { useThemeStore } from "../../stores/useThemeStore.ts";
import { applyTheme } from "./applyTheme.ts";

/**
 * Put the stored choice on <html> now, and keep it there as it changes. The entry module calls this
 * before the first render, so a stored choice that differs from the OS shows from the first frame
 * the app draws. Returns an unsubscribe.
 */
export function installTheme(): () => void {
  applyTheme(useThemeStore.getState().preference);
  return useThemeStore.subscribe((state) => applyTheme(state.preference));
}

export { applyTheme };
