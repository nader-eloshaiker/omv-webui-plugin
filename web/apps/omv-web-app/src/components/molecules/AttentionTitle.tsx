// SPDX-License-Identifier: GPL-3.0-or-later
// An attention row's short title (dashboard spec 5.2): what is wrong, in a few words, with the
// server's names as text in their own direction (UI-2). The card's heading, and the page's headline
// when it is the only thing that needs the reader.
import { Trans, useTranslation } from "react-i18next";
import type { AttentionRow } from "../../dashboard/dashboard.ts";
import { useFormat } from "../../format/useFormat.ts";
import { FileSystemName } from "../atoms/FileSystemName.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { NodeSlot } from "../atoms/NodeSlot.tsx";

const ZFS_TITLE = {
  degraded: "dashboard.attention.title.zfsDegraded",
  unusable: "dashboard.attention.title.zfsUnusable",
  damaged: "dashboard.attention.title.zfsDamaged",
} as const;

export function AttentionTitle({ row }: { row: AttentionRow }) {
  const { t } = useTranslation();
  const format = useFormat();
  switch (row.kind) {
    case "fsFull":
    case "fsMissing":
    case "fsWarning":
      return (
        <Trans
          i18nKey={`dashboard.attention.title.${row.kind}`}
          components={{
            name: <NodeSlot value={<FileSystemName name={row.name} />} />,
          }}
        />
      );
    case "zfsPool":
      return (
        <Trans
          i18nKey={ZFS_TITLE[row.health]}
          components={{ pool: <IdentifierText value={row.pool} /> }}
        />
      );
    case "diskCritical":
    case "diskWarning":
      return (
        <Trans
          i18nKey={`dashboard.attention.title.${row.kind}`}
          components={{ device: <IdentifierText value={row.device} /> }}
        />
      );
    case "servicesDown": {
      const [only] = row.services;
      return row.services.length === 1 && only !== undefined
        ? t("dashboard.attention.title.serviceDown", {
            count: 1,
            title: only.title,
          })
        : t("dashboard.attention.title.serviceDown", {
            count: row.services.length,
          });
    }
    case "restart":
      return t("dashboard.attention.title.restart");
    case "clock":
      return t("dashboard.attention.title.clock", {
        duration: format.duration(row.seconds),
      });
  }
}
