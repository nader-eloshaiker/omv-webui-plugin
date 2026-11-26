// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard design's lab screen (journal 2026-11-27: the first visit must welcome, and read as
// professionally made; the owner then asked for one dashboard with the life of the Instrument view and
// the decisions of /ui) and the view the query string selects. Development only (UI-11). The query
// only selects what is shown and never acts (UI-4): it seeds the view and writes no preference.
//
//   screen=welcome
//   case=existing|new|later           the first visit on an existing NAS, a new NAS, a later visit
//   nas=ok|needs                      the mock's NAS fine, or with the Data drive almost full
//   check=before|after                disk health not yet checked, or checked
//   theme=dark|light (dark first), density=comfortable|compact, motion=full|reduced, tips=on|off
//   still=1                           no live readings and nothing assembling: the same every time
//   chrome=0                          hides the lab's controls and the notes on the design
export const WELCOME_SCREENS = ["welcome"] as const;

export const CASES = [
  { id: "existing", name: "First visit, existing NAS" },
  { id: "new", name: "First visit, new NAS" },
  { id: "later", name: "A later visit" },
] as const;
export type CaseId = (typeof CASES)[number]["id"];

export type CheckState = "before" | "checking" | "after";

export interface WelcomeView {
  case: CaseId;
  nas: "ok" | "needs";
  check: "before" | "after";
  theme: "dark" | "light";
  density: "comfortable" | "compact";
  motion: "full" | "reduced";
  tips: boolean;
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

export function readWelcomeView(search: string): WelcomeView {
  const q = new URLSearchParams(search);
  return {
    case: pick(
      q.get("case"),
      CASES.map((c) => c.id),
      "existing",
    ),
    nas: pick(q.get("nas"), ["ok", "needs"] as const, "ok"),
    check: pick(q.get("check"), ["before", "after"] as const, "before"),
    theme: pick(q.get("theme"), ["dark", "light"] as const, "dark"),
    density: pick(
      q.get("density"),
      ["comfortable", "compact"] as const,
      "comfortable",
    ),
    motion: pick(q.get("motion"), ["full", "reduced"] as const, "full"),
    tips: q.get("tips") !== "off",
    still: q.get("still") === "1",
    chrome: q.get("chrome") !== "0",
  };
}

/** The query string that reopens what is on screen. */
export function welcomeQuery(view: WelcomeView): string {
  const q = new URLSearchParams({
    screen: "welcome",
    case: view.case,
    theme: view.theme,
    density: view.density,
    motion: view.motion,
  });
  if (view.nas === "needs") {
    q.set("nas", "needs");
  }
  if (view.check === "after") {
    q.set("check", "after");
  }
  if (!view.tips) {
    q.set("tips", "off");
  }
  if (view.still) {
    q.set("still", "1");
  }
  if (!view.chrome) {
    q.set("chrome", "0");
  }
  return q.toString();
}
