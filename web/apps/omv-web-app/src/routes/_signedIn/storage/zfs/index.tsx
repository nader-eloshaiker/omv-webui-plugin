// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > ZFS (phase 5 ZFS design 1), built in this interface; more specific than /$group/$item, so
// it wins. Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { ZfsPage } from "../../../../components/pages/ZfsPage.tsx";

export const Route = createFileRoute("/_signedIn/storage/zfs/")({
  component: ZfsPage,
});
