// SPDX-License-Identifier: GPL-3.0-or-later
// The welcome prototype's screen (journal 2026-11-27: the first visit must welcome, and read as
// professionally made) and the view the query string selects. Development only (UI-11). The query
// only selects what is shown and never acts (UI-4): it seeds the view and writes no preference.
//
//   screen=welcome
//   candidate=drawn|annotated|start   the three candidates
//   case=existing|new|later           the new interface on an existing NAS, a new NAS, a later visit
//   check=before|after                disk health not yet checked, or checked (the later visit)
//   theme=dark|light, density=comfortable|compact, motion=full|reduced, tips=on|off
//   still=1                           nothing assembles on open (for screenshots of the end state)
//   chrome=0                          hides the lab's controls and the candidate's notes
export const WELCOME_SCREENS = ["welcome"] as const;

export const CANDIDATES = [
  { id: "drawn", name: "A. Your NAS, drawn" },
  { id: "annotated", name: "B. Pointed out in place" },
  { id: "start", name: "C. Start the work" },
] as const;
export type CandidateId = (typeof CANDIDATES)[number]["id"];

export const CASES = [
  { id: "existing", name: "Existing NAS, first visit" },
  { id: "new", name: "New NAS, first visit" },
  { id: "later", name: "A later visit" },
] as const;
export type CaseId = (typeof CASES)[number]["id"];

export type CheckState = "before" | "checking" | "after";

export interface WelcomeView {
  candidate: CandidateId;
  case: CaseId;
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
    candidate: pick(
      q.get("candidate"),
      CANDIDATES.map((c) => c.id),
      "drawn",
    ),
    case: pick(
      q.get("case"),
      CASES.map((c) => c.id),
      "existing",
    ),
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
    candidate: view.candidate,
    case: view.case,
    theme: view.theme,
    density: view.density,
    motion: view.motion,
  });
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
