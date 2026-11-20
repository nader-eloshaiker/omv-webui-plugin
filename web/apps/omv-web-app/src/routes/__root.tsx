// SPDX-License-Identifier: GPL-3.0-or-later
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { RouterContext } from "../router.ts";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});
