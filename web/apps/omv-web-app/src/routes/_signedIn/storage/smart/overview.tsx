// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disk health, the Overview tab (design 4): a static route of its own (UI-4: no part of the address names a
// method). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { SmartOverviewPage } from "../../../../components/pages/SmartOverviewPage.tsx";

export const Route = createFileRoute("/_signedIn/storage/smart/overview")({
  component: SmartOverviewPage,
});
