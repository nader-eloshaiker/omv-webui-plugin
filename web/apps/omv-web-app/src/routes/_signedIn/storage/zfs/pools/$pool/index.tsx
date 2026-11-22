// SPDX-License-Identifier: GPL-3.0-or-later
// A pool's page (phase 5 ZFS design 0.7, 2). The one path parameter is the pool's name, and only a value
// that passes the pattern reaches the page: anything else becomes null, which the page shows as "no such
// pool" without a pool-specific call (UI-4). The page finds the row in Zfs.listPools and uses that
// row's fields for every call, never the address.
import { createFileRoute } from "@tanstack/react-router";
import { ZfsPoolRoutePage } from "../../../../../../components/pages/ZfsPoolPage.tsx";
import { isPoolAddress } from "../../../../../../zfs/zfsModel.ts";

export const Route = createFileRoute("/_signedIn/storage/zfs/pools/$pool/")({
  params: {
    parse: ({ pool }) => ({ pool: isPoolAddress(pool) ? pool : null }),
    stringify: ({ pool }) => ({ pool: pool ?? "" }),
  },
  component: ZfsPoolRoutePage,
});
