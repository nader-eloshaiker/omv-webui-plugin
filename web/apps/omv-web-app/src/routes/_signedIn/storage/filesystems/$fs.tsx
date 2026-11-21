// SPDX-License-Identifier: GPL-3.0-or-later
// A file system's page (phase 5 file-systems design 0.5, 2). The one path parameter is the file
// system's UUID, and only a value that passes the pattern reaches the page: anything else becomes null,
// which the page shows as "not set up" without making a file-system-specific call (UI-4). The page
// finds the row in FileSystemMgmt.getList and uses that row's fields for every call, never the address.
// "add" and "add-multi" are static routes matched first, and neither passes the pattern.
import { createFileRoute } from "@tanstack/react-router";
import { FileSystemRoutePage } from "../../../../components/pages/FileSystemPage.tsx";
import { isFsAddress } from "../../../../filesystems/fsModel.ts";

export const Route = createFileRoute("/_signedIn/storage/filesystems/$fs")({
  params: {
    parse: ({ fs }) => ({ fs: isFsAddress(fs) ? fs : null }),
    stringify: ({ fs }) => ({ fs: fs ?? "" }),
  },
  component: FileSystemRoutePage,
});
