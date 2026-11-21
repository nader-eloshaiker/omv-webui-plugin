// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnostics > System logs, built in this interface; more specific than /$group/$item, so it wins.
// The chosen log is held in memory, never in the address (UI-4): opening this route reads nothing.
// Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { SystemLogsPage } from "../../../components/pages/SystemLogsPage.tsx";

export const Route = createFileRoute("/_signedIn/diagnostics/system-logs")({
  component: SystemLogsPage,
});
