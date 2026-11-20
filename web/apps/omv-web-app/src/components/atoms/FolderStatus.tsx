// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's status (phase 3 design 4.3): the pill with its fixed word and, for anything but
// OK, what the code means as text beside it, not in a tooltip. A code this interface does not know is
// shown as itself, in the mono face (UI-2: as text).
import { StatusPill } from "@omv-webui/react-ui-components";
import { Trans, useTranslation } from "react-i18next";
import { statusView } from "../../sharedFolders/table.ts";
import { IdentifierText } from "./IdentifierText.tsx";

export function FolderStatus({ status }: { status: string }) {
  const { t } = useTranslation();
  const view = statusView(status);
  if (view.pill === "ok") {
    return <StatusPill status="ok">{t("sharedFolders.status.ok")}</StatusPill>;
  }
  return (
    <span className="flex flex-col items-start gap-1">
      <StatusPill status={view.pill}>
        {t(`sharedFolders.status.${view.pill}`)}
      </StatusPill>
      <span className="text-sm text-foreground">
        {view.pill === "critical" ? (
          t(`sharedFolders.reason.${view.reason}`)
        ) : (
          <Trans
            i18nKey="sharedFolders.reason.other"
            components={{ code: <IdentifierText value={view.code} /> }}
          />
        )}
      </span>
    </span>
  );
}
