// SPDX-License-Identifier: GPL-3.0-or-later
// UI-12: on a page not served over HTTPS, a persistent notice says the connection is not encrypted.
// An administrator gets a fixed link to OMV's HTTPS setting in the classic interface; a normal user
// is told who can change it.
import type { Role } from "@omv-webui/react-api-omv/generated";
import { ExternalLink, NoticeBanner } from "@omv-webui/react-ui-components";
import { LockOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CLASSIC_HTTPS_SETTINGS } from "../../navigation/navigation.ts";

export function HttpNotice({ role }: { role: Role }) {
  const { t } = useTranslation();
  if (window.location.protocol === "https:") {
    return null;
  }
  return (
    <NoticeBanner
      label={t("httpNotice.label")}
      icon={<LockOpen />}
      action={
        role === "admin" ? (
          <ExternalLink
            href={CLASSIC_HTTPS_SETTINGS}
            newTabLabel={t("app.newTab")}
          >
            {t("httpNotice.adminLink")}
          </ExternalLink>
        ) : undefined
      }
    >
      {t("httpNotice.body")}
      {role === "admin" ? null : ` ${t("httpNotice.userBody")}`}
    </NoticeBanner>
  );
}
