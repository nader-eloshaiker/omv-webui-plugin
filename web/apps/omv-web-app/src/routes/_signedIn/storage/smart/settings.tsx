// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disk health, the Settings tab (design 5): a static route of its own (UI-4: no part of the address names a
// method). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { SmartSettingsPage } from "../../../../components/pages/SmartSettingsPage.tsx";

export const Route = createFileRoute("/_signedIn/storage/smart/settings")({
  component: SmartSettingsPage,
});
