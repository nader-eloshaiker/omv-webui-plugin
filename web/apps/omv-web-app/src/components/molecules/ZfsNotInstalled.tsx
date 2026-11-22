// SPDX-License-Identifier: GPL-3.0-or-later
// What every ZFS address shows when the ZFS plugin is not installed (phase 5 ZFS design 0.11): a
// neutral empty state that says what is missing and where to install it, with the classic Plugins page
// as a fixed link (UI-3). No other call is made and no pool or file system is resolved.
import { EmptyState, ExternalLink } from "@omv-webui/react-ui-components";
import { Puzzle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NAV_PAGES } from "../../navigation/navigation.ts";

const PLUGINS =
  NAV_PAGES.find((p) => p.item === "plugins")?.classic ?? "/#/system/plugins";

export function ZfsNotInstalled() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={<Puzzle />}
      title={t("zfs.notInstalled.title")}
      action={
        <ExternalLink href={PLUGINS} newTabLabel={t("app.newTab")}>
          {t("zfs.notInstalled.link")}
        </ExternalLink>
      }
    >
      {t("zfs.notInstalled.body")}
    </EmptyState>
  );
}
