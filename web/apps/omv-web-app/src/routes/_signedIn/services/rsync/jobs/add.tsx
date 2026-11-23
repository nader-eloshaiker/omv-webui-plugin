// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a copy job" (phase 5 services design 5). No parameter: a source chosen on a shared folder's page
// is handed over in the session store, never in the address (13.2, UI-4), and opening it only reads
// (R9). A static route, matched before $job (and "add" fails the UUID pattern anyway). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { AddCopyJobPage } from "../../../../../components/pages/AddCopyJobPage.tsx";

export const Route = createFileRoute("/_signedIn/services/rsync/jobs/add")({
  component: AddCopyJobPage,
});
