// SPDX-License-Identifier: GPL-3.0-or-later
// The design lab's state: development only (UI-11). The view, the direction and theme being shown,
// the mock NAS, and the save-then-apply loop with its pending list, held in memory only.
import { createContext, useContext } from "react";
import type { Metric } from "./chartModel.ts";
import type { NasState, Scenario } from "./data.ts";

export type Dir = "instrument" | "sky" | "atlas";
export type Theme = "dark" | "light";
export type Screen = "dashboard" | "storage" | "folder" | "activity";
export type ApplyPhase = "idle" | "applying" | "applied";

export const SCREENS: Screen[] = ["dashboard", "storage", "folder", "activity"];

export interface Toast {
  id: number;
  text: string;
}

export interface Lab {
  dir: Dir;
  theme: Theme;
  scenario: Scenario;
  screen: Screen;
  nas: NasState;
  pending: string[];
  phase: ApplyPhase;
  loading: boolean;
  toasts: Toast[];
  focusDisk: string | null;
  /** The metric the Performance page opens at, when a dashboard chart was opened. */
  focusMetric: Metric | null;
  density: "comfortable" | "compact";
  setDensity: (d: "comfortable" | "compact") => void;
  go: (screen: Screen, options?: { disk?: string; metric?: Metric }) => void;
  addPending: (what: string, from?: Element | null) => void;
  apply: () => void;
  undo: () => void;
  toast: (text: string) => void;
  dismiss: (id: number) => void;
  notInLab: (what: string) => void;
}

export const LabContext = createContext<Lab | null>(null);

export function useLab(): Lab {
  const lab = useContext(LabContext);
  if (!lab) {
    throw new Error("useLab outside the lab");
  }
  return lab;
}
