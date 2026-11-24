// SPDX-License-Identifier: GPL-3.0-or-later
// An attention row's short title (dashboard spec 5.2): what is wrong, in a few words, with the
// server's names as text in their own direction (UI-2). A file system's label is quoted, so a title
// that starts with it still reads as a sentence ("“backups” is full"); a device is in the mono face,
// and the system drive is named in words. The card's heading, and the worst one in the answer.
import { Identifier } from "@omv-webui/react-ui-components";
import { Trans, useTranslation } from "react-i18next";
import type { AttentionRow, FsName } from "../../dashboard/dashboard.ts";
import { useFormat } from "../../format/useFormat.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { NodeSlot } from "../atoms/NodeSlot.tsx";

const ZFS_TITLE = {
  degraded: "dashboard.attention.title.zfsDegraded",
  unusable: "dashboard.attention.title.zfsUnusable",
  damaged: "dashboard.attention.title.zfsDamaged",
} as const;

/** A file system's name at the start of a title. */
function TitleName({ name }: { name: FsName }) {
  const { t } = useTranslation();
  switch (name.kind) {
    case "systemDrive":
      return <>{t("dashboard.attention.systemDrive")}</>;
    case "device":
      return <Identifier>{name.text}</Identifier>;
    case "label":
      return (
        <Trans
          i18nKey="dashboard.attention.quoted"
          components={{
            name: (
              <NodeSlot
                value={
                  <span dir="auto" className="break-words">
                    {name.text}
                  </span>
                }
              />
            ),
          }}
        />
      );
  }
}

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
            name: <NodeSlot value={<TitleName name={row.name} />} />,
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
