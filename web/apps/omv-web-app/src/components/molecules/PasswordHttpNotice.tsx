// SPDX-License-Identifier: GPL-3.0-or-later
// The line under a password field on a connection that is not encrypted (phase 5 users design 0.7,
// D9), beside UI-12's page notice: it says the password can be read on the network, with the fixed
// link to OMV's HTTPS setting. The caller shows it only when the connection is not encrypted.
import { ExternalLink } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { CLASSIC_HTTPS_SETTINGS } from "../../navigation/navigation.ts";

export function PasswordHttpNotice() {
  const { t } = useTranslation();
  return (
    <>
      {t("password.notEncrypted")}{" "}
      <ExternalLink href={CLASSIC_HTTPS_SETTINGS} newTabLabel={t("app.newTab")}>
        {t("password.notEncryptedLink")}
      </ExternalLink>
    </>
  );
}
