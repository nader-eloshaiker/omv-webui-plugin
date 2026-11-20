// SPDX-License-Identifier: GPL-3.0-or-later
// Boots the whole interface, as main.tsx does, against MSW answering with the contract's examples.
// Nothing is mocked above the network: the generated hooks and the transport run for real.
import type { Answers } from "@omv-webui/react-api-omv/mocks";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { AppRoot } from "../AppRoot.tsx";
import { bootApp, type App } from "../app.ts";
import {
  newMockSession,
  scenarioAnswers,
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
  const mock: MockSession = newMockSession(signedIn);
  answer({ ...scenarioAnswers(scenario, mock), ...answers });
  window.history.replaceState(null, "", `/ui${path}`);
  const app = await bootApp();
  running.push(app);
  const user = userEvent.setup(advanceTimers ? { advanceTimers } : {});
  const view = render(<AppRoot app={app} />);
  return { app, mock, user, ...view };
}
