// SPDX-License-Identifier: GPL-3.0-or-later
// `pnpm dev:mock`: MSW in a service worker answers rpc.php with the contract's examples, as the
// chosen scenario picks them. Loaded by main.tsx only behind `import.meta.env.DEV`, so a production
// build contains none of it (UI-11). Everything else (the app's own files) passes through.
import { createRpcHandlers } from "@omv-webui/react-api-omv/mocks";
import { setupWorker } from "msw/browser";
import { setApparentPageLocation } from "../network/pageLocation.ts";
import { useMockScenarioStore } from "../stores/useMockScenarioStore.ts";
import { dashboardDelayHandlers } from "./dashboardScenarios.ts";
import { networkPageAddress } from "./networkScenarios.ts";
import {
  newMockSession,
  scenarioAnswers,
  startsDirty,
  startsSignedIn,
} from "./scenarios.ts";
import { sharesDelayHandlers } from "./sharesScenarios.ts";
import { usersDelayHandlers } from "./usersScenarios.ts";

export async function startMockWorker(): Promise<void> {
  const { scenario } = useMockScenarioStore.getState();
  // The address the page appears to be opened at in a network story (D17); none in the others.
  setApparentPageLocation(networkPageAddress(scenario));
  // "Session ends after loading" and usersSelfUnknown start signed in; every other scenario starts
  // at sign-in.
  const session = newMockSession(
    startsSignedIn(scenario),
    startsDirty(scenario),
  );
  // A story's pass-through handlers (a slow deletion, slow home folders) run first, then hand the
  // call on.
  const worker = setupWorker(
    ...dashboardDelayHandlers(scenario),
    ...sharesDelayHandlers(scenario),
    ...usersDelayHandlers(scenario),
    ...createRpcHandlers(scenarioAnswers(scenario, session)),
  );
  await worker.start({
    serviceWorker: {
      url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
      options: { scope: import.meta.env.BASE_URL },
    },
    onUnhandledFrame: "bypass",
    quiet: true,
  });
}
