// SPDX-License-Identifier: GPL-3.0-or-later
// An entry of the motion reel (rethink spec 8 row 7): a motion, the causes that run it, and a stage
// drawn twice, once in the Full pane and once in the Reduced one. The entry holds the stage's state,
// so a cause changes both panes in one render. Development only (UI-11).
import type { ComponentType } from "react";

export const SECTIONS = [
  { id: "welcome", title: "Welcome and first visit" },
  { id: "empty", title: "Empty states" },
  { id: "forms", title: "Forms" },
  { id: "tables", title: "Tables" },
  { id: "dashboard", title: "Dashboard" },
  { id: "icons", title: "Icons" },
  { id: "diagrams", title: "Diagrams" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

export interface Cause<S> {
  id: string;
  /** The button's words, as the catalogue gives them. */
  label: string;
  apply: (state: S) => S;
}

export type Pane = "full" | "reduced";

export interface StageProps<S> {
  state: S;
  /** A change made from inside a stage (typing, a stage's own button): both panes follow. */
  update: (change: (state: S) => S) => void;
  pane: Pane;
}

export interface EntryDef<S> {
  /** Stable, for `entry=` in the query string. */
  id: string;
  section: SectionId;
  /** Its plain name: "The NAS assembles". */
  title: string;
  initial: S;
  causes: readonly Cause<S>[];
  /** The timing in words, one or two sentences. */
  timing: string;
  /** The reduced form in words. */
  reducedTiming: string;
  /** Why something is excluded from the opacity check, or another plain sentence. */
  note?: string;
  /**
   * Runs a cause's state change: `commit` dispatches it and resolves once React has committed it to
   * the DOM, so an entry that needs a View Transition can wait for it. `root` is the entry's element.
   */
  wrap?: (commit: () => Promise<void>, root: HTMLElement) => void;
  Stage: ComponentType<StageProps<S>>;
}

/** An entry with its state type erased, so entries of different states sit in one list. */
export type AnyEntry = EntryDef<unknown>;

export function defineEntry<S>(def: EntryDef<S>): AnyEntry {
  return def as unknown as AnyEntry;
}
