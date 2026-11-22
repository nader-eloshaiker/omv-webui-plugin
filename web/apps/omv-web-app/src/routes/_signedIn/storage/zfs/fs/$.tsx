// SPDX-License-Identifier: GPL-3.0-or-later
// A ZFS file system's page (phase 5 ZFS design 0.7, 4.3). The rest of the address is the file system's
// full name ("tank/media"), and only a value that passes the patterns reaches the page: anything else
// becomes empty, which the page shows as "no such file system" without a file-system-specific call
// (UI-4). The page finds the row in Zfs.listPools and uses that row's fields for every call.
import { createFileRoute } from "@tanstack/react-router";
import { ZfsFsRoutePage } from "../../../../../components/pages/ZfsFsPage.tsx";
import { isFsAddress } from "../../../../../zfs/zfsModel.ts";

export const Route = createFileRoute("/_signedIn/storage/zfs/fs/$")({
  params: {
    parse: ({ _splat }) => ({ _splat: isFsAddress(_splat) ? _splat : "" }),
    stringify: ({ _splat }) => ({ _splat: _splat ?? "" }),
  },
  component: ZfsFsRoutePage,
});
