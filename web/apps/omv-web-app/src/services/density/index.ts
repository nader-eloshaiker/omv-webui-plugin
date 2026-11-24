// SPDX-License-Identifier: GPL-3.0-or-later
// The density on <html> (foundation 5): `data-density="compact"` for compact rows, no attribute for
// comfortable, which the tokens give by default. Set through the DOM, never from markup, so it needs
// no inline script (UI-1).
import {
  useDensityStore,
  type DensityPreference,
} from "../../stores/useDensityStore.ts";

export function applyDensity(
  density: DensityPreference,
  root: HTMLElement = document.documentElement,
): void {
  if (density === "compact") {
    root.dataset.density = "compact";
  } else {
    delete root.dataset.density;
  }
}

/**
 * Put the stored choice on <html> now, and keep it there as it changes. The entry module calls this
 * before the first render, beside the theme. Returns an unsubscribe.
 */
export function installDensity(): () => void {
  applyDensity(useDensityStore.getState().density);
  return useDensityStore.subscribe((state) => applyDensity(state.density));
}
