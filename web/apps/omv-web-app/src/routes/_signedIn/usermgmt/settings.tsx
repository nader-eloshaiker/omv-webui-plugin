// SPDX-License-Identifier: GPL-3.0-or-later
// Users > Settings, "Home folders" (phase 5 users design 12, D15). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { HomeFoldersPage } from "../../../components/pages/HomeFoldersPage.tsx";

export const Route = createFileRoute("/_signedIn/usermgmt/settings")({
  component: HomeFoldersPage,
});
