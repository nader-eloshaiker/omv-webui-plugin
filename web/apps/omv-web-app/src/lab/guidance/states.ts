// SPDX-License-Identifier: GPL-3.0-or-later
// The guidance prototype's screen (rethink spec 8 row 8, P.3) and the view the query string selects.
// Development only (UI-11). The query only selects what is shown and never acts (UI-4): it seeds the
// view and writes no preference until the person presses something.
export const GUIDANCE_SCREENS = ["guidance"] as const;

/** The page width the lab frames the page in, to show 900 and 390 without resizing the window. */
export const GUIDANCE_WIDTHS = ["full", "900", "390"] as const;
export type GuidanceWidth = (typeof GUIDANCE_WIDTHS)[number];

export interface GuidanceView {
  theme: "dark" | "light";
  density: "comfortable" | "compact";
  motion: "full" | "reduced";
  width: GuidanceWidth;
  /** `tips=on|off` seeds the view; null when the query says nothing, so the stored preference shows. */
  tips: boolean | null;
  menu: boolean;
  /** `toast=hide-tips`: show the "Hide tips too?" offer, for a screenshot. */
  offer: boolean;
  still: boolean;
  chrome: boolean;
}

function pick<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((a) => a === value) ?? fallback;
}

export function readGuidanceView(search: string): GuidanceView {
  const q = new URLSearchParams(search);
  const tips = q.get("tips");
  return {
    theme: pick(q.get("theme"), ["dark", "light"] as const, "dark"),
    density: pick(
      q.get("density"),
      ["comfortable", "compact"] as const,
      "comfortable",
    ),
    motion: pick(q.get("motion"), ["full", "reduced"] as const, "full"),
    width: pick(q.get("width"), GUIDANCE_WIDTHS, "full"),
    tips: tips === "on" ? true : tips === "off" ? false : null,
    menu: q.get("menu") === "open",
    offer: q.get("toast") === "hide-tips",
    still: q.get("still") === "1",
    chrome: q.get("chrome") !== "0",
  };
}

/**
 * The query string that reopens what is on screen. The offer is not part of it: it is a moment, and
 * reopening the page should not show it again.
 */
export function guidanceQuery(
  view: Omit<GuidanceView, "tips" | "offer">,
  tips: boolean,
): string {
  const q = new URLSearchParams({
    screen: "guidance",
    theme: view.theme,
    density: view.density,
    tips: tips ? "on" : "off",
    motion: view.motion,
    width: view.width,
  });
  if (view.menu) {
    q.set("menu", "open");
  }
  if (view.still) {
    q.set("still", "1");
  }
  if (!view.chrome) {
    q.set("chrome", "0");
  }
  return q.toString();
}
