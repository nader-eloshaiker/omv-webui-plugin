// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Shared folders, built in this interface; more specific than /$group/$item, so it wins. The
// table's page, sort and search are held in memory, never in the address (UI-4). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { SharedFoldersPage } from "../../../components/pages/SharedFoldersPage.tsx";

export const Route = createFileRoute("/_signedIn/storage/shared-folders")({
  component: SharedFoldersPage,
});
