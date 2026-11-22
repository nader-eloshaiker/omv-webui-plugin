// SPDX-License-Identifier: GPL-3.0-or-later
// Add a file system to a pool (phase 5 ZFS design 4.2). The parameter is validated as on the pool's
// page; opening it only reads (R9). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { ZfsFsAddRoutePage } from "../../../../../../components/pages/ZfsFsAddPage.tsx";
import { isPoolAddress } from "../../../../../../zfs/zfsModel.ts";

export const Route = createFileRoute("/_signedIn/storage/zfs/pools/$pool/add")({
  params: {
    parse: ({ pool }) => ({ pool: isPoolAddress(pool) ? pool : null }),
    stringify: ({ pool }) => ({ pool: pool ?? "" }),
  },
  component: ZfsFsAddRoutePage,
});
