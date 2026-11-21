// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disk health, set up disk monitoring, UX-audit Flow D (design 7); no menu item: a static route of its own (UI-4: no part of the address names a
// method). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { SmartSetUpPage } from "../../../../components/pages/SmartSetUpPage.tsx";

export const Route = createFileRoute("/_signedIn/storage/smart/set-up")({
  component: SmartSetUpPage,
});
