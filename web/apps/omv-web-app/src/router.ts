// SPDX-License-Identifier: GPL-3.0-or-later
// The router: file routes under src/routes (the generated tree), served under /ui/. Routes are static
// and typed; a URL only selects a view (UI-4). The context carries what route guards read.
import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { NotFoundPage } from "./components/pages/NotFoundPage.tsx";
import { RouteErrorPage } from "./components/pages/RouteErrorPage.tsx";
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
    defaultErrorComponent: RouteErrorPage,
    // Off: the router would keep visited paths and scroll positions in sessionStorage, and storage
    // holds preferences only (UI-13). A path can carry an object's identifier.
    scrollRestoration: false,
    // Page changes run in a view transition where the browser has one (foundation 7.2): the shell is
    // named and stays still while the page fades and scales up (css-ui-style's shell.css). Only for a
    // change of page; under reduced motion the stylesheet cuts it.
    defaultViewTransition: {
      types: ({ pathChanged }) => (pathChanged ? ["page"] : false),
    },
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
