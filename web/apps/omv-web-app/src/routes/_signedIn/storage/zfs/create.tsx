// SPDX-License-Identifier: GPL-3.0-or-later
// Create a ZFS pool (phase 5 ZFS design 3). No parameter: nothing is chosen from the address, and
// opening it only reads (R9). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { ZfsCreatePage } from "../../../../components/pages/ZfsCreatePage.tsx";

export const Route = createFileRoute("/_signedIn/storage/zfs/create")({
  component: ZfsCreatePage,
});
