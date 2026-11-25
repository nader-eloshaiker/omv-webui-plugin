// SPDX-License-Identifier: GPL-3.0-or-later
// What the reel's page gives each entry: how the Full pane is labelled and whether it follows a
// Reduced setting, and where an entry registers the run that "Check every motion" calls.
// Development only (UI-11).
import { createContext } from "react";

export interface CheckResult {
  entry: string;
  title: string;
  cause: string;
  passed: boolean;
  sentence: string;
}

export interface ReelSettings {
  /** The Full pane follows the person's setting when it says Reduced. */
  fullReduced: boolean;
  fullLabel: string;
  register: (id: string, run: (() => Promise<CheckResult[]>) | null) => void;
}

export const ReelContext = createContext<ReelSettings>({
  fullReduced: false,
  fullLabel: "Full",
  register: () => undefined,
});
