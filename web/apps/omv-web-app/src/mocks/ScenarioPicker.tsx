// SPDX-License-Identifier: GPL-3.0-or-later
// `pnpm dev:mock` only: a small panel in the corner to choose the mock scenario. Choosing reloads the
// page so the app boots against it. Development words, not the interface's: this never ships.
import { useMockScenarioStore } from "../stores/useMockScenarioStore.ts";
import {
  isScenarioName,
  SCENARIO_GROUPS,
  SCENARIO_LABELS,
} from "./scenarios.ts";

export default function ScenarioPicker() {
  const scenario = useMockScenarioStore((s) => s.scenario);
  const setScenario = useMockScenarioStore((s) => s.setScenario);
  return (
    <div className="fixed start-2 bottom-2 z-40 flex items-center gap-2 rounded-control border border-border bg-surface px-2 py-1 text-sm shadow-md">
      <label htmlFor="mock-scenario" className="text-muted-foreground">
        Mock
      </label>
      <select
        id="mock-scenario"
        value={scenario}
        className="rounded-control border border-input bg-surface px-1 py-0.5 text-foreground"
        onChange={(event) => {
          if (isScenarioName(event.target.value)) {
            setScenario(event.target.value);
            window.location.reload();
          }
        }}
      >
        {SCENARIO_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.names.map((name) => (
              <option key={name} value={name}>
                {SCENARIO_LABELS[name]}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
