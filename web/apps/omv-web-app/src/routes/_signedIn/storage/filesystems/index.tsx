// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > File systems (phase 5 file-systems design 1), built in this interface; more specific than
// /$group/$item, so it wins. Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { FileSystemsPage } from "../../../../components/pages/FileSystemsPage.tsx";

export const Route = createFileRoute("/_signedIn/storage/filesystems/")({
  component: FileSystemsPage,
});
