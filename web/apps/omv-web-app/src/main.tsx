// SPDX-License-Identifier: GPL-3.0-or-later
// The entry module. In order: the stylesheet, the stored theme on <html> before anything renders,
// the catalogue, then (dev:mock only) the mock, then the session, then the app.
import { UiProvider } from "@omv-webui/react-ui-components";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AppRoot } from "./AppRoot.tsx";
import { bootApp } from "./app.ts";
import { BootScreen } from "./components/atoms/BootScreen.tsx";
import "./index.css";
import "./services/i18n/index.ts";
import { installTheme } from "./services/theme/index.ts";

installTheme();

// `import.meta.env.DEV` first: a production build replaces it with false and drops every branch
// below that loads mock code, so no mock module is emitted at all (UI-11).
const MOCK = import.meta.env.DEV && import.meta.env.VITE_MOCK_API === "true";

// The design lab at /ui/lab (src/lab): development only, behind the same compile-time switch, so a
// production build emits none of it (UI-11). It does not boot the app or the mock. The one other
// way in is `pnpm build:lab` (mode "lab", output dist-lab/), a test-only build that proves the lab
// under the snippet's real headers (pnpm test:browser:lab); a production build replaces MODE with
// "production", so the comparison is false at compile time and the branch is dropped.
const LAB =
  (import.meta.env.DEV || import.meta.env.MODE === "lab") &&
  window.location.pathname.startsWith(`${import.meta.env.BASE_URL}lab`);

const ScenarioPicker = MOCK
  ? lazy(() => import("./mocks/ScenarioPicker.tsx"))
  : null;

async function start() {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("index.html has no #root.");
  }
  const root = createRoot(container);
  if (LAB) {
    const { default: LabRoot } = await import("./lab/LabRoot.tsx");
    root.render(
      <StrictMode>
        <LabRoot />
      </StrictMode>,
    );
    return;
  }
  root.render(
    <UiProvider>
      <BootScreen />
    </UiProvider>,
  );
  if (MOCK) {
    const { startMockWorker } = await import("./mocks/browser.ts");
    await startMockWorker();
  }
  const app = await bootApp();
  root.render(
    <StrictMode>
      <AppRoot app={app}>
        {ScenarioPicker ? (
          <Suspense fallback={null}>
            <ScenarioPicker />
          </Suspense>
        ) : null}
      </AppRoot>
    </StrictMode>,
  );
}

void start();
