// SPDX-License-Identifier: GPL-3.0-or-later
// The providers every screen sits in: Base UI inside CSPProvider disableStyleElements (UI-1, D7),
// the query client, the session, the router.
import { UiProvider } from "@omv-webui/react-ui-components";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { App } from "./app.ts";
import { SessionProvider } from "./session/SessionProvider.tsx";

export function AppRoot({ app, children }: { app: App; children?: ReactNode }) {
  return (
    <UiProvider>
      <QueryClientProvider client={app.queryClient}>
        <SessionProvider store={app.session} activity={app.activity}>
          <RouterProvider router={app.router} />
          {children}
        </SessionProvider>
      </QueryClientProvider>
    </UiProvider>
  );
}
