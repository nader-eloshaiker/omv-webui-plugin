// SPDX-License-Identifier: GPL-3.0-or-later
// Add a disk to an array (phase 5 RAID design 4). The parameter is validated as on the array's page;
// nothing is chosen from the address, and opening it only reads (R9): every disk needs the typed
// confirmation. Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { RaidAddRoutePage } from "../../../../../components/pages/RaidAddPage.tsx";
import { isArrayAddress } from "../../../../../raid/raidModel.ts";

export const Route = createFileRoute("/_signedIn/storage/md/$array/add")({
  params: {
    parse: ({ array }) => ({ array: isArrayAddress(array) ? array : null }),
    stringify: ({ array }) => ({ array: array ?? "" }),
  },
  component: RaidAddRoutePage,
});
