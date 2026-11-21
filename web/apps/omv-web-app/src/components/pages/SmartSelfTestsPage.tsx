// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disk health > Self-tests (phase 5 disks design 6), for administrators: which self-tests the
// NAS runs on its disks, and when. A normal user who types the address gets the "only administrators"
// page, and nothing is called first (UI-4). Nothing here wakes a disk until "Run now" is confirmed.
import { InlineAlert } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSmartSettings } from "../../hooks/useDiskReads.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { SelfTestsManager } from "../organisms/SelfTestsManager.tsx";
import { SmartTabsFrame } from "../templates/SmartTabsFrame.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function SmartSelfTestsPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("smart.title")} />;
  }
  return (
    <SmartTabsFrame tab="selfTests">
      <SelfTests />
    </SmartTabsFrame>
  );
}

function SelfTests() {
  const { t } = useTranslation();
  const settings = useSmartSettings();
  return (
    <>
      <p className="max-w-prose">{t("smart.tests.intro")}</p>
      {settings.data?.enable === false ? (
        <InlineAlert tone="neutral" role="note">
          <p>{t("smart.tests.globalOff")}</p>
          <p>
            <Link to="/storage/smart/settings" className={routerLinkClass}>
              {t("smart.tests.settingsLink")}
            </Link>
          </p>
        </InlineAlert>
      ) : null}
      <SelfTestsManager />
    </>
  );
}
