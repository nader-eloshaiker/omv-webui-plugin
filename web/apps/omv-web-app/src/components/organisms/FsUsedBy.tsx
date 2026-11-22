// SPDX-License-Identifier: GPL-3.0-or-later
// "Used by" on a file system's page (phase 5 file-systems design 0.6, 2.4; UX audit Pattern G): the
// shared folders on it, by name; "a setting this interface does not show yet" when the server says it
// is used and no folder is found; a retry when the folders could not be read, never "nothing". While
// nothing is shared from it, the sharing handover follows (D20), so the next step is never lost.
import type { ConfiguredFilesystem } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { ExternalLink, UsedByPanel } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { UsedBy } from "../../filesystems/fsModel.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { SharingHandover } from "./SharingHandover.tsx";

export function FsUsedBy({
  fs,
  used,
  created,
  onRetry,
}: {
  fs: ConfiguredFilesystem;
  used: UsedBy;
  /** This session created the file system. */
  created: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const handover =
    used.kind === "none" && fs.status === 1 && (fs.mounted || created);
  return (
    <div className="flex flex-col gap-3">
      <UsedByPanel
        title={t("filesystem.usedBy.title")}
        headingLevel={2}
        loading={
          used.kind === "loading"
            ? { label: t("filesystem.usedBy.checking") }
            : undefined
        }
        error={
          used.kind === "unchecked"
            ? {
                message: t("filesystem.usedBy.failed"),
                serverMessage: isRpcError(used.error)
                  ? { label: t("app.serverMessage"), text: used.error.message }
                  : undefined,
                retryLabel: t("common.tryAgain"),
                onRetry,
              }
            : undefined
        }
        referrers={
          used.kind === "shares"
            ? used.folders.map((folder) => ({
                id: folder.uuid,
                kind: t("filesystem.usedBy.sharedFolder"),
                name: folder.name,
                action: (
                  <Link
                    to="/storage/shared-folders/$folder"
                    params={{ folder: folder.uuid }}
                    aria-label={t("filesystem.usedBy.openSharedName", {
                      name: folder.name,
                    })}
                    className={`${routerLinkClass} text-sm`}
                  >
                    {t("filesystem.usedBy.openShared")}
                  </Link>
                ),
              }))
            : []
        }
        unknownUse={
          used.kind === "other"
            ? {
                message: t("filesystem.usedBy.other"),
                classicLink: (
                  <ExternalLink
                    href={CLASSIC.fileSystems}
                    newTabLabel={t("app.newTab")}
                  >
                    {t("filesystems.classicLink")}
                  </ExternalLink>
                ),
              }
            : undefined
        }
        emptyText={t("filesystem.usedBy.none")}
      />
      {handover ? <SharingHandover fs={fs} /> : null}
    </div>
  );
}
