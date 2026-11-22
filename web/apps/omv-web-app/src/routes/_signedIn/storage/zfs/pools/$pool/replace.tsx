// SPDX-License-Identifier: GPL-3.0-or-later
// Replace a disk of a pool (phase 5 ZFS design 7.2). The parameter is validated as on the pool's page.
// The disk to replace is handed over in memory, never in the address, and the new disk is never chosen
// from it: opening it only reads (R9). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { ZfsReplaceRoutePage } from "../../../../../../components/pages/ZfsReplacePage.tsx";
import { isPoolAddress } from "../../../../../../zfs/zfsModel.ts";

export const Route = createFileRoute(
  "/_signedIn/storage/zfs/pools/$pool/replace",
)({
  params: {
    parse: ({ pool }) => ({ pool: isPoolAddress(pool) ? pool : null }),
    stringify: ({ pool }) => ({ pool: pool ?? "" }),
  },
  component: ZfsReplaceRoutePage,
});
