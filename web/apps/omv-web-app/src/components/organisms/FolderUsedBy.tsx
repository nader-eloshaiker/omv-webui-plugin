// SPDX-License-Identifier: GPL-3.0-or-later
// "Used by" on a shared folder's page (phase 5 shares design 0.7, 2.5; UX audit Pattern G; phase 5
// services design 2.7, P19), shown only when something besides its own SMB share and NFS entries uses
// it, or when a read it rests on failed. It names the rsync server folder that offers it ("Offered to
// the rsync server as {{name}}", linking to the rsync server tab), each copy job that copies from it
// or into it (linking to the job's page), and the home folders while it holds them (phase 5 users
// design 13.1). OMV's `_used` is a yes-or-no (B10): when it is true and none of the reads finds the
// folder, it is an add-on's setting, said as one sentence with no classic link (P15). A failed read is
// the retry form, never "nothing".
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { UsedByPanel, type Referrer } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useJobWords } from "../../hooks/useJobWords.ts";
import type { FolderUse } from "../../sharedFolders/folderPage.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";

export function FolderUsedBy({
  use,
  onRetry,
}: {
  use: FolderUse;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const { rowName } = useJobWords();
  const home: Referrer = {
    id: "home",
    kind: t("sharedFolder.usedBy.homeKind"),
    name: "",
    action: (
      <Link to="/usermgmt/settings" className={routerLinkClass}>
        {t("sharedFolder.usedBy.home")}
      </Link>
    ),
  };
  const referrers: Referrer[] = [];
  if (use.kind === "home") {
    referrers.push(home);
  } else if (use.kind === "named") {
    for (const each of use.uses) {
      if (each.kind === "rsyncModule") {
        referrers.push({
          id: `module-${each.module.uuid}`,
          kind: t("usedBy.kind.rsyncModule"),
          name: inertBidi(each.module.name),
          action: (
            <Link to="/services/rsync/server" className={routerLinkClass}>
              {t("usedBy.openRsyncd")}
            </Link>
          ),
        });
      } else {
        const name = rowName(each.job);
        referrers.push({
          id: `job-${each.job.uuid}-${each.into ? "to" : "from"}`,
          kind: t(each.into ? "usedBy.kind.jobTo" : "usedBy.kind.jobFrom"),
          name: inertBidi(name),
          nameStyle: "text",
          action: (
            <Link
              to="/services/rsync/jobs/$job"
              params={{ job: each.job.uuid }}
              aria-label={t("usedBy.openJobLabel", { job: inertBidi(name) })}
              className={routerLinkClass}
            >
              {t("usedBy.openJob")}
            </Link>
          ),
        });
      }
    }
    if (use.home) {
      referrers.push(home);
    }
  }
  return (
    <UsedByPanel
      title={t("sharedFolder.usedBy.title")}
      headingLevel={2}
      referrers={referrers}
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
        use.kind === "other" ? { message: t("usedBy.addOn") } : undefined
      }
      emptyText={t("usedBy.addOn")}
    />
  );
}
