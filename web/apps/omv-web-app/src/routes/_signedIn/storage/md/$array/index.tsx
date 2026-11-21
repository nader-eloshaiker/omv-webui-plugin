// SPDX-License-Identifier: GPL-3.0-or-later
// An array's page (phase 5 RAID design 0.6, 2). The one path parameter is the array's kernel name, and
// only a value that passes the pattern (^md[0-9]{1,3}$) reaches the page: anything else becomes null,
// which the page shows as "no such array" without an array-specific call (UI-4). The page finds the row
// in MdMgmt.enumerateDevices and uses that row's fields for every call, never the address.
import { createFileRoute } from "@tanstack/react-router";
import { RaidArrayRoutePage } from "../../../../../components/pages/RaidArrayPage.tsx";
import { isArrayAddress } from "../../../../../raid/raidModel.ts";

export const Route = createFileRoute("/_signedIn/storage/md/$array/")({
  params: {
    parse: ({ array }) => ({ array: isArrayAddress(array) ? array : null }),
    stringify: ({ array }) => ({ array: array ?? "" }),
  },
  component: RaidArrayRoutePage,
});
