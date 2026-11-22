// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's state on its page (phase 5 shares design 0.3, 2.2 item 3): the worse of the
// folder's own status and its file system's, as the fixed pill with its reason in words beside it,
// never colour alone. A code this interface does not know is shown as itself (UI-2: as text).
import type { ConfiguredFilesystem } from "@omv-webui/react-api-omv/generated";
import { StatusPill } from "@omv-webui/react-ui-components";
import { Trans, useTranslation } from "react-i18next";
import type { FolderState } from "../../sharedFolders/shareActions.ts";
import { FsNameSlot } from "../atoms/FsNameSlot.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

export function FolderStateView({
  state,
  fs,
}: {
  state: FolderState;
  fs: ConfiguredFilesystem | undefined;
}) {
  const { t } = useTranslation();
  if (state.pill === "ok") {
    return <StatusPill status="ok">{t("sharedFolders.status.ok")}</StatusPill>;
  }
  let reason;
  if (state.pill === "unknown") {
    reason = (
      <Trans
        i18nKey="sharedFolders.reason.other"
        components={{ code: <IdentifierText value={state.code} /> }}
      />
    );
  } else if (state.reason === "fsNotMounted" || state.reason === "fsMissing") {
    reason = (
      <Trans
        i18nKey={`sharedFolder.state.${state.reason}`}
        components={{
          fs: <FsNameSlot fs={fs} />,
        }}
      />
    );
  } else {
    reason = t(`sharedFolders.reason.${state.reason}`);
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusPill status={state.pill}>
        {t(`sharedFolders.status.${state.pill}`)}
      </StatusPill>
      <span className="text-sm text-foreground">{reason}</span>
    </span>
  );
}
