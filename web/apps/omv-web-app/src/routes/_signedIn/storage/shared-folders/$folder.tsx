// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's page (phase 5 shares design 2, D1). The one path parameter is the folder's UUID,
// and only a value that passes the pattern reaches the page: anything else becomes null, which the
// page shows as "This shared folder does not exist" without a folder-specific call (UI-4). The page
// finds the row in ShareMgmt.getList and uses that row's fields for every call, never the address.
import { createFileRoute } from "@tanstack/react-router";
import { SharedFolderRoutePage } from "../../../../components/pages/SharedFolderPage.tsx";
import { isFolderAddress } from "../../../../sharedFolders/folderAddress.ts";

export const Route = createFileRoute(
  "/_signedIn/storage/shared-folders/$folder",
)({
  params: {
    parse: ({ folder }) => ({
      folder: isFolderAddress(folder) ? folder : null,
    }),
    stringify: ({ folder }) => ({ folder: folder ?? "" }),
  },
  component: SharedFolderRoutePage,
});
