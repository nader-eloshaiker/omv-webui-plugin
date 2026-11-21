// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disk health, the Self-tests tab (design 6): a static route of its own (UI-4: no part of the address names a
// method). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { SmartSelfTestsPage } from "../../../../components/pages/SmartSelfTestsPage.tsx";

export const Route = createFileRoute("/_signedIn/storage/smart/self-tests")({
  component: SmartSelfTestsPage,
});
