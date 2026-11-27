// SPDX-License-Identifier: GPL-3.0-or-later
// The form prototypes' screens and the states the lab's switcher can show (rethink spec 8 rows 2
// and 3). Development only (UI-11). `?state=` picks one; it only seeds what is shown (UI-4).
import type { RefObject } from "react";
import { useEffect, useLayoutEffect, useState } from "react";

export const FORM_SCREENS = ["add-folder", "add-person"] as const;
export type FormScreen = (typeof FORM_SCREENS)[number];

export const FOLDER_STATES = [
  { id: "empty", name: "Just opened" },
  { id: "filled", name: "Named Photos" },
  { id: "options", name: "More options: guest on" },
  { id: "chosen", name: "Only the people I choose" },
  { id: "nfs", name: "Linux sharing on" },
  { id: "errors", name: "Pressed Create, no name" },
  { id: "run", name: "Running" },
  { id: "done", name: "Done" },
  { id: "failed", name: "A step failed" },
] as const;
export type FolderState = (typeof FOLDER_STATES)[number]["id"];

export const PERSON_STATES = [
  { id: "empty", name: "Just opened" },
  { id: "filled", name: "alex, in family" },
  { id: "groups", name: "In two groups" },
  { id: "weak", name: "A weak password" },
  { id: "suggested", name: "Suggested password" },
  { id: "admin", name: "Administrator, SSH" },
  { id: "errors", name: "Pressed Add, empty" },
  { id: "run", name: "Running" },
  { id: "done", name: "Done" },
] as const;
export type PersonState = (typeof PERSON_STATES)[number]["id"];

/** Whether the layout's own width holds the questions and the rail side by side (3.1). */
export function useWide(ref: RefObject<HTMLElement | null>, min = 900) {
  const [wide, setWide] = useState(true);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWide(entry.contentRect.width >= min);
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [ref, min]);
  return wide;
}

/**
 * When the questions become read-only (the run, its end), focus moves to the rail's heading, so a
 * keyboard or screen reader user is taken to what is happening instead of left on an inert field.
 */
export function useFocusOnPhase(phase: string, headingId: string) {
  useEffect(() => {
    if (phase !== "edit") {
      document.getElementById(headingId)?.focus();
    }
  }, [phase, headingId]);
}
