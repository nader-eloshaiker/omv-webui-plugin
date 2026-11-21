// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's page (phase 5 disks design 0.5, 2). The one path parameter is the disk's kernel name, and
// only a name that passes the pattern reaches the page as a name: anything else becomes null, which
// the page shows as "not connected" without making a disk-specific call (UI-4). The page finds the
// disk in DiskMgmt.getList and uses that row's device file for every call, never the address.
import { createFileRoute } from "@tanstack/react-router";
import { DiskRoutePage } from "../../../../components/pages/DiskPage.tsx";
import { isDiskName } from "../../../../disks/diskWords.ts";

export const Route = createFileRoute("/_signedIn/storage/disks/$disk")({
  params: {
    parse: ({ disk }) => ({ disk: isDiskName(disk) ? disk : null }),
    stringify: ({ disk }) => ({ disk: disk ?? "" }),
  },
  component: DiskRoutePage,
});
