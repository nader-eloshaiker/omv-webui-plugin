// SPDX-License-Identifier: GPL-3.0-or-later
// Boots the whole interface, as main.tsx does, against MSW answering with the contract's examples.
// Nothing is mocked above the network: the generated hooks and the transport run for real.
import type { Answers } from "@omv-webui/react-api-omv/mocks";
import { taskRegistry } from "@omv-webui/react-api-omv/tasks";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach } from "vitest";
import { AppRoot } from "../AppRoot.tsx";
import { bootApp, type App } from "../app.ts";
import {
  newMockSession,
  scenarioAnswers,
  startsDirty,
  type MockSession,
  type ScenarioName,
} from "../mocks/scenarios.ts";
import "../services/i18n/index.ts";
import { answer } from "./server.ts";

const running: App[] = [];

afterEach(() => {
  for (const app of running.splice(0)) {
    app.dispose();
  }
  // The registry is the application's one instance: forget this test's tasks.
  taskRegistry.clear();
});

interface RenderAppOptions {
  /** Which examples answer; "admin" by default. */
  scenario?: ScenarioName;
  /** Start with a session (the probe on load succeeds). */
  signedIn?: boolean;
  /** Answers that replace the scenario's, operation by operation. */
  answers?: Answers;
  /** The in-app path the page is loaded at. */
  path?: string;
  /** Passed to userEvent.setup (fake timers). */
  advanceTimers?: (ms: number) => unknown;
}

export async function renderApp({
  scenario = "admin",
  signedIn = false,
  answers = {},
  path = "/",
  advanceTimers,
}: RenderAppOptions = {}) {
  const mock: MockSession = newMockSession(signedIn, startsDirty(scenario));
  answer({ ...scenarioAnswers(scenario, mock), ...answers });
  window.history.replaceState(null, "", `/ui${path}`);
  const app = await bootApp();
  running.push(app);
  const user = userEvent.setup(advanceTimers ? { advanceTimers } : {});
  // StrictMode, as main.tsx renders: effects run twice, so a subscription torn down by its own
  // clean-up shows here as it would in the browser.
  const view = render(
    <StrictMode>
      <AppRoot app={app} />
    </StrictMode>,
  );
  return { app, mock, user, ...view };
}
