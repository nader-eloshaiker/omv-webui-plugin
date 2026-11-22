// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Shared folders (phase 3 design 4; phase 5 shares design 1), for administrators: which
// folders are shared, how computers reach them, and whether any is broken. Leads to a folder's page
// and to adding a shared folder. A normal user who types the address gets the "only administrators"
// page, and nothing is called first (UI-4).
import { StatusPill } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  useShareServices,
  useSharesSystem,
  useSmbSettings,
} from "../../hooks/useSharesReads.ts";
import { useSession } from "../../session/sessionContext.ts";
import { smbState } from "../../sharedFolders/smbModel.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { SharedFoldersTable } from "../organisms/SharedFoldersTable.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function SharedFoldersPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("sharedFolders.title")} />;
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageTitle>{t("sharedFolders.title")}</PageTitle>
      <p className="max-w-prose">{t("sharedFolders.intro")}</p>
      <SmbOffLine />
      <SharedFoldersTable />
    </div>
  );
}

/** 1.2 item 3: only when Windows and Mac sharing is off; nothing while it is on or not known. */
function SmbOffLine() {
  const { t } = useTranslation();
  const settings = useSmbSettings({ focus: true });
  const services = useShareServices({ focus: true });
  const system = useSharesSystem();
  const state = smbState(
    { data: settings.data, failed: settings.isError, error: settings.error },
    {
      data: services.data?.data,
      failed: services.isError,
      error: services.error,
    },
    system.pending ?? [],
  );
  if (state.kind !== "off") {
    return null;
  }
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <StatusPill status="disabled">{t("health.disabled")}</StatusPill>
      <span>{t("sharedFolders.smbOff")}</span>
      <Link to="/services/smb" className={routerLinkClass}>
        {t("sharedFolders.smbOffLink")}
      </Link>
    </p>
  );
}
