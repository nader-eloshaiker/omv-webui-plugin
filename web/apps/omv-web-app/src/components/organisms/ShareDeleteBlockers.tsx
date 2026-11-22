// SPDX-License-Identifier: GPL-3.0-or-later
// Why a shared folder cannot be deleted now, in words (phase 5 shares design 8.1, 0.9; P15): each
// blocker with what to do about it, where there is something this interface can do. A blocker this
// interface does not manage (an NFS share, a backup job, an add-on) names it with no classic link.
import type {
  ConfiguredFilesystem,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { Button, ServerMessage } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { fsPage } from "../../sharedFolders/folderPage.ts";
import { displayPath } from "../../sharedFolders/nameRules.ts";
import type { DeleteBlocker } from "../../sharedFolders/shareActions.ts";
import { shownFsName } from "../../sharedFolders/shownNames.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { FsNameSlot } from "../atoms/FsNameSlot.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { FolderFsName } from "../molecules/FolderFsName.tsx";

export function ShareDeleteBlockers({
  blockers,
  folder,
  onRetry,
  onStopSharing,
}: {
  blockers: readonly DeleteBlocker[];
  folder: SharedFolder;
  /** "Try again" after a failed read. */
  onRetry?: () => void;
  /** "Stop sharing…", in place (4.5). */
  onStopSharing?: () => void;
}) {
  const { t } = useTranslation();
  const words = useFsWords();
  const fsSlot = (fs: ConfiguredFilesystem | undefined) => (
    <FsNameSlot fs={fs} fallback={folder.device} />
  );
  return (
    <ul className="flex flex-col gap-2">
      {blockers.map((b) => {
        switch (b.kind) {
          case "smb":
            return (
              <li key={b.kind} className="flex flex-col items-start gap-1">
                <span>{t("shareDelete.blocked.smb")}</span>
                <span>{t("shareDelete.blocked.smbDo")}</span>
                {onStopSharing === undefined ? null : (
                  <Button variant="neutral" size="sm" onClick={onStopSharing}>
                    {t("folderSmb.stop.open")}
                  </Button>
                )}
              </li>
            );
          case "other":
            return <li key={b.kind}>{t("sharedFolder.usedBy.other")}</li>;
          case "unread":
            return (
              <li key={b.kind} className="flex flex-col items-start gap-2">
                <span>{t("shareDelete.blocked.unread")}</span>
                {isRpcError(b.error) ? (
                  <ServerMessage label={t("app.serverMessage")}>
                    {b.error.message}
                  </ServerMessage>
                ) : null}
                {onRetry === undefined ? null : (
                  <Button variant="neutral" size="sm" onClick={onRetry}>
                    {t("common.tryAgain")}
                  </Button>
                )}
              </li>
            );
          case "loading":
            return (
              <li key={b.kind} className="text-muted-foreground">
                {t("shareDelete.checking")}
              </li>
            );
          case "running":
            return (
              <li key={b.kind}>
                {t("shareDelete.blocked.running", {
                  action: t(`shares.action.${b.action}`),
                })}
              </li>
            );
          case "notOk":
            return <li key={b.kind}>{t("shareDelete.blocked.notOk")}</li>;
          case "fsNotMounted":
            return (
              <li key={b.kind}>
                <Trans
                  i18nKey="shareDelete.blocked.fsNotMounted"
                  components={{ fs: fsSlot(b.fs) }}
                />
              </li>
            );
          case "whole":
            return (
              <li key={b.kind} className="flex flex-col items-start gap-1">
                <span>
                  <Trans
                    i18nKey="shareDelete.blocked.whole"
                    components={{ fs: fsSlot(b.fs) }}
                  />
                </span>
                <span>{t("shareDelete.blocked.wholeDo")}</span>
                {b.fs !== undefined && fsPage(b.fs) !== null ? (
                  <FolderFsName fs={b.fs}>
                    {t("sharedFolder.todo.openFs", {
                      fs: words.nameOf(shownFsName(b.fs)),
                    })}
                  </FolderFsName>
                ) : null}
              </li>
            );
          case "inside":
            return (
              <li key={b.kind} className="flex flex-col items-start gap-1">
                <span>
                  <Trans
                    i18nKey="shareDelete.blocked.inside"
                    components={{
                      other: <FolderNameText value={b.other.name} />,
                      path: (
                        <IdentifierText
                          value={inertBidi(displayPath(b.other.reldirpath))}
                        />
                      ),
                    }}
                  />
                </span>
                <Link
                  to="/storage/shared-folders/$folder"
                  params={{ folder: b.other.uuid }}
                  className={routerLinkClass}
                >
                  {t("shareDelete.blocked.insideDo", {
                    other: inertBidi(b.other.name),
                  })}
                </Link>
              </li>
            );
          case "system":
            return <li key={b.kind}>{t("shareDelete.blocked.system")}</li>;
        }
      })}
    </ul>
  );
}
