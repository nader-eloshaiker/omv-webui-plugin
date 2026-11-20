// SPDX-License-Identifier: GPL-3.0-or-later
// `pnpm dev:mock` only: which mock scenario answers, kept for this tab so a reload keeps it. A
// development preference (UI-13); imported only from src/mocks, which a production build never
// contains, so neither this store nor its storage key exists there (UI-11). Never set from a URL.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isScenarioName, type ScenarioName } from "../mocks/scenarios.ts";

interface MockScenarioState {
  scenario: ScenarioName;
  setScenario: (scenario: ScenarioName) => void;
}

export const useMockScenarioStore = create<MockScenarioState>()(
  persist(
    (set) => ({
      scenario: "admin",
      setScenario: (scenario) => set({ scenario }),
    }),
    {
      name: "omv-webui.dev-mock-scenario",
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ scenario: state.scenario }),
      merge: (stored, current) => {
        const scenario = (stored as { scenario?: unknown } | undefined)
          ?.scenario;
        return isScenarioName(scenario) ? { ...current, scenario } : current;
      },
    },
  ),
);
