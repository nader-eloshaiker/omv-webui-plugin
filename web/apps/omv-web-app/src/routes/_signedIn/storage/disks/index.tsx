// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disks (phase 5 disks design 1), built in this interface; more specific than /$group/$item,
// so it wins. Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { DisksPage } from "../../../../components/pages/DisksPage.tsx";

export const Route = createFileRoute("/_signedIn/storage/disks/")({
  component: DisksPage,
});
