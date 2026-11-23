// SPDX-License-Identifier: GPL-3.0-or-later
// Services > NFS, "Linux and Unix sharing" (phase 5 services design 1), built in this interface; more
// specific than /$group/$item, so it wins. Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { NfsPage } from "../../../components/pages/NfsPage.tsx";

export const Route = createFileRoute("/_signedIn/services/nfs")({
  component: NfsPage,
});
