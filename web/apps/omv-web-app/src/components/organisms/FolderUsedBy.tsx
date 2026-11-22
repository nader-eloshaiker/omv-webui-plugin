// SPDX-License-Identifier: GPL-3.0-or-later
// "Used by" on a shared folder's page (phase 5 shares design 0.7, 2.5; UX audit Pattern G), shown only
// when something besides its own SMB share uses it, or when a read it rests on failed. OMV's `_used`
// is a yes-or-no (B10): with no SMB share and `_used` true, the folder is used by a setting this page
// does not show, named as one sentence with no classic link (P15). A failed read is the retry form,
// never "nothing".
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { UsedByPanel } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import type { FolderUse } from "../../sharedFolders/folderPage.ts";

export function FolderUsedBy({
  use,
  onRetry,
}: {
  use: FolderUse;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <UsedByPanel
      title={t("sharedFolder.usedBy.title")}
      headingLevel={2}
      referrers={[]}
      error={
        use.kind === "unread"
          ? {
              message: t("shareDelete.blocked.unread"),
              serverMessage: isRpcError(use.error)
                ? { label: t("app.serverMessage"), text: use.error.message }
                : undefined,
              retryLabel: t("common.tryAgain"),
              onRetry,
            }
          : undefined
      }
      unknownUse={
        use.kind === "other"
          ? { message: t("sharedFolder.usedBy.other") }
          : undefined
      }
      emptyText={t("sharedFolder.usedBy.other")}
    />
  );
}
