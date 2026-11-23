// SPDX-License-Identifier: GPL-3.0-or-later
// Services > Rsync > Rsync server (phase 5 services design 9), the second tab of the Rsync page; more
// specific than /$group/$item, so it wins. A static route with no parameter; opening it only reads
// (UI-4). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { RsyncServerPage } from "../../../../components/pages/RsyncServerPage.tsx";

export const Route = createFileRoute("/_signedIn/services/rsync/server")({
  component: RsyncServerPage,
});
