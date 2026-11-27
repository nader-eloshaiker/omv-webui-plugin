// SPDX-License-Identifier: GPL-3.0-or-later
// The chart prototype's screen and the view the query string selects. Development only (UI-11). The
// query only selects what is shown and never acts (UI-4): theme, density, width, motion, still and
// chrome, as the guidance prototype reads them, and the lab's own disks (6 or 24).
export const CHARTS_SCREENS = ["charts"] as const;

export const CHARTS_WIDTHS = ["full", "900", "390"] as const;
export type ChartsWidth = (typeof CHARTS_WIDTHS)[number];

export const CHARTS_DISKS = ["6", "24"] as const;
export type ChartsDisks = (typeof CHARTS_DISKS)[number];

export interface ChartsView {
  theme: "dark" | "light";
  density: "comfortable" | "compact";
  motion: "full" | "reduced";
  width: ChartsWidth;
  /** `still=1`: the fixed set of 40 readings, paused, for screenshots. */
  still: boolean;
  /** `copy=1`: the Data drive read again after 1 TiB was copied to it. */
  copy: boolean;
  chrome: boolean;
  /** `disks=24`: the 24 disks in three arrays, a pool and none, instead of the dashboard lab's six. */
  disks: ChartsDisks;
}

function pick<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((a) => a === value) ?? fallback;
}

export function readChartsView(search: string): ChartsView {
  const q = new URLSearchParams(search);
  return {
    theme: pick(q.get("theme"), ["dark", "light"] as const, "dark"),
    density: pick(
      q.get("density"),
      ["comfortable", "compact"] as const,
      "comfortable",
    ),
    motion: pick(q.get("motion"), ["full", "reduced"] as const, "full"),
    width: pick(q.get("width"), CHARTS_WIDTHS, "full"),
    still: q.get("still") === "1",
    copy: q.get("copy") === "1",
    chrome: q.get("chrome") !== "0",
    disks: pick(q.get("disks"), CHARTS_DISKS, "6"),
  };
}

/** The query string that reopens what is on screen. */
export function chartsQuery(view: ChartsView): string {
  const q = new URLSearchParams({
    screen: "charts",
    theme: view.theme,
    density: view.density,
    motion: view.motion,
    width: view.width,
  });
  if (view.still) {
    q.set("still", "1");
  }
  if (view.copy) {
    q.set("copy", "1");
  }
  if (!view.chrome) {
    q.set("chrome", "0");
  }
  if (view.disks !== "6") {
    q.set("disks", view.disks);
  }
  return q.toString();
}
