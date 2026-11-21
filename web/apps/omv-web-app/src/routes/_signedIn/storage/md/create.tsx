// SPDX-License-Identifier: GPL-3.0-or-later
// Create a RAID array (phase 5 RAID design 3). No parameter: nothing is chosen from the address, and
// opening it only reads (R9). A static segment, matched before $array; it does not pass the array
// pattern anyway. Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { RaidCreatePage } from "../../../../components/pages/RaidCreatePage.tsx";

export const Route = createFileRoute("/_signedIn/storage/md/create")({
  component: RaidCreatePage,
});
