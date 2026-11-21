// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > RAID (phase 5 RAID design 1), built in this interface; more specific than /$group/$item,
// so it wins. Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { RaidPage } from "../../../../components/pages/RaidPage.tsx";

export const Route = createFileRoute("/_signedIn/storage/md/")({
  component: RaidPage,
});
