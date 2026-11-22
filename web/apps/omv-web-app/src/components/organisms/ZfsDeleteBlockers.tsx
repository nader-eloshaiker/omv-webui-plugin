// SPDX-License-Identifier: GPL-3.0-or-later
// Why a file system or a pool cannot be deleted (phase 5 ZFS design 9.1, 9.2; owner, P11), each blocker
// in words with what to do: links lead only to removing the blocker on this interface's pages (each
// shared folder's own page, shares design 9.1); what
// this interface does not manage (a volume, a clone, a locked file system) is said to be dealt with in
// the classic interface, without a link that could be taken for a way round the refusal.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { Identifier, ServerMessage } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { routerLinkClass } from "../../shell/linkClass.ts";
import {
  hasPage,
  isVolumeRow,
  type DeleteBlocker,
} from "../../zfs/zfsModel.ts";
import { FolderLink } from "../atoms/FolderLink.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

export function ZfsDeleteBlockers({
  blockers,
  of,
}: {
  blockers: readonly DeleteBlocker[];
  of: "fs" | "pool";
}) {
  const { t } = useTranslation();
  const sharesLink = (
    <Link to="/storage/shared-folders" className={routerLinkClass}>
      {t("zfsDelete.blocked.sharesLink")}
    </Link>
  );
  const fsLink = (path: string) =>
    hasPage({ type: "Filesystem", path }) ? (
      <Link
        key={path}
        to="/storage/zfs/fs/$"
        params={{ _splat: path }}
        className={routerLinkClass}
      >
        <Identifier>{path}</Identifier>
      </Link>
    ) : (
      <Identifier key={path}>{path}</Identifier>
    );
  return (
    <ul className="flex flex-col gap-2">
      {blockers.map((b, i) => {
        let line: ReactNode;
        switch (b.kind) {
          case "poolFolder":
            line = <p>{t("zfsDelete.blocked.poolFolder")}</p>;
            break;
          case "shares":
            line = (
              <>
                <p>
                  {t(
                    of === "pool"
                      ? "zfsDelete.blocked.poolShares"
                      : "zfsDelete.blocked.shares",
                    {
                      list: b.names.join(", "),
                    },
                  )}
                </p>
                <p className="flex flex-wrap gap-x-2 text-sm">
                  <span>{t("zfsDelete.blocked.sharesDo")}</span>
                  {b.folders.map((folder) => (
                    <FolderLink
                      key={folder.uuid}
                      uuid={folder.uuid}
                      name={folder.name}
                    />
                  ))}
                </p>
              </>
            );
            break;
          case "sharedUnnamed":
            line = (
              <p>
                {t("zfsDelete.blocked.sharedUnnamed")} {sharesLink}
              </p>
            );
            break;
          case "other":
            line = <p>{t("zfsDelete.blocked.other")}</p>;
            break;
          case "inside": {
            const volumes = b.rows.filter(isVolumeRow);
            line = (
              <>
                <p>
                  {t("zfsDelete.blocked.inside", {
                    list: b.rows.map((r) => r.path).join(", "),
                  })}
                </p>
                {b.rows.length > volumes.length ? (
                  <p className="flex flex-wrap gap-x-2 text-sm">
                    <span>{t("zfsDelete.blocked.insideFsDo")}</span>
                    {b.rows
                      .filter((r) => !isVolumeRow(r))
                      .map((r) => fsLink(r.path))}
                  </p>
                ) : null}
                {volumes.length > 0 ? (
                  <p className="text-sm">
                    {t("zfsDelete.blocked.insideVolDo")}
                  </p>
                ) : null}
              </>
            );
            break;
          }
          case "fileSystems":
            line = (
              <>
                <p>
                  {t("zfsDelete.blocked.fileSystems", {
                    list: b.rows.map((r) => r.path).join(", "),
                  })}
                </p>
                <p className="flex flex-wrap gap-x-2 text-sm">
                  <span>{t("zfsDelete.blocked.fileSystemsDo")}</span>
                  {b.rows.map((r) => fsLink(r.path))}
                </p>
              </>
            );
            break;
          case "volumes":
            line = (
              <>
                <p>
                  {t("zfsDelete.blocked.volumes", {
                    list: b.rows.map((r) => r.path).join(", "),
                  })}
                </p>
                <p className="text-sm">{t("zfsDelete.blocked.volumesDo")}</p>
              </>
            );
            break;
          case "clone":
            line = (
              <>
                <p>
                  <Trans
                    i18nKey="zfsDelete.blocked.clone"
                    components={{
                      clone: <IdentifierText value={b.clone.path} />,
                    }}
                  />
                </p>
                <p className="text-sm">{t("zfsDelete.blocked.cloneDo")}</p>
              </>
            );
            break;
          case "locked":
            line = (
              <>
                <p>
                  {of === "pool"
                    ? t("zfsDelete.blocked.poolLocked")
                    : t("zfsDelete.blocked.locked")}
                </p>
                <p className="text-sm">{t("zfsDelete.blocked.lockedDo")}</p>
              </>
            );
            break;
          case "unread":
            line = (
              <>
                <p>{t("zfsDelete.blocked.unread")}</p>
                {isRpcError(b.error) ? (
                  <ServerMessage label={t("app.serverMessage")}>
                    {b.error.message}
                  </ServerMessage>
                ) : null}
              </>
            );
            break;
          case "unknown":
            line = <p>{t("zfsBlock.unknown")}</p>;
            break;
          case "changing":
            line = <p>{t("zfsBlock.changing")}</p>;
            break;
        }
        return (
          <li
            key={`${b.kind}-${String(i)}`}
            className="flex max-w-prose flex-col gap-1"
          >
            {line}
          </li>
        );
      })}
    </ul>
  );
}
