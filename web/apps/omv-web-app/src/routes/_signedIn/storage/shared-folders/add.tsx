// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a shared folder" (phase 5 shares design 6). No parameter: the file system Flow A hands over is
// in the session store, never in the address (6.7, UI-4), and opening it only reads (R9). A static
// route, matched before $folder (and "add" fails the UUID pattern anyway). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { AddSharedFolderPage } from "../../../../components/pages/AddSharedFolderPage.tsx";

export const Route = createFileRoute("/_signedIn/storage/shared-folders/add")({
  component: AddSharedFolderPage,
});
