// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Shared folders (phase 3 design 4), for administrators: which folders are shared, where they
// are, and whether any is broken. Read-only in Phase 3; adding one is a fixed link to the classic
// interface (owner, 2026-11-20). A normal user who types the address gets the "only administrators"
// page, and nothing is called first (UI-4).
import { useTranslation } from "react-i18next";
import { useSession } from "../../session/sessionContext.ts";
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
      <SharedFoldersTable />
    </div>
  );
}
