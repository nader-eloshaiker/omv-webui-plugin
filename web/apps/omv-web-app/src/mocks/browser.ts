// SPDX-License-Identifier: GPL-3.0-or-later
// `pnpm dev:mock`: MSW in a service worker answers rpc.php with the contract's examples, as the
// chosen scenario picks them. Loaded by main.tsx only behind `import.meta.env.DEV`, so a production
// build contains none of it (UI-11). Everything else (the app's own files) passes through.
import { createRpcHandlers } from "@omv-webui/react-api-omv/mocks";
import { setupWorker } from "msw/browser";
import { useMockScenarioStore } from "../stores/useMockScenarioStore.ts";
import { newMockSession, scenarioAnswers, startsDirty } from "./scenarios.ts";

export async function startMockWorker(): Promise<void> {
  const { scenario } = useMockScenarioStore.getState();
  // "Session ends after loading" starts signed in; every other scenario starts at sign-in.
  const session = newMockSession(
    scenario === "sessionExpired",
    startsDirty(scenario),
  );
  const worker = setupWorker(
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
