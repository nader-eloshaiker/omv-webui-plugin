// SPDX-License-Identifier: GPL-3.0-or-later
// Services > Rsync, the Copy jobs tab (phase 5 services design 3, D1): the Rsync page with its first
// tab. A static route with no parameter; opening it only reads (UI-4). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { CopyJobsPage } from "../../../../components/pages/CopyJobsPage.tsx";

export const Route = createFileRoute("/_signedIn/services/rsync/")({
  component: CopyJobsPage,
});
