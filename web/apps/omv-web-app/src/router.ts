// SPDX-License-Identifier: GPL-3.0-or-later
// The router: file routes under src/routes (the generated tree), served under /ui/. Routes are static
// and typed; a URL only selects a view (UI-4). The context carries what route guards read.
import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { NotFoundPage } from "./components/pages/NotFoundPage.tsx";
import { routeTree } from "./routeTree.gen.ts";
import type { SessionStore } from "./session/sessionStore.ts";

export interface RouterContext {
  queryClient: QueryClient;
  session: SessionStore;
}

export function createAppRouter(context: RouterContext) {
  return createRouter({
    routeTree,
    basepath: "/ui",
    context,
    // Nothing is read ahead of a deliberate navigation: in particular nothing may be sent while a
    // second-factor login is pending (A10).
    defaultPreload: false,
    defaultNotFoundComponent: NotFoundPage,
    // Off: the router would keep visited paths and scroll positions in sessionStorage, and storage
    // holds preferences only (UI-13). A path can carry an object's identifier.
    scrollRestoration: false,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
