// SPDX-License-Identifier: GPL-3.0-or-later
// The start page. A placeholder until Phase 3 builds the dashboard; the set-up checklist of the first
// sign-in (UX audit Q11) goes in the slot at the top.
import { useTranslation } from "react-i18next";
import { useSession } from "../../session/sessionContext.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { SetupChecklistSlot } from "../atoms/SetupChecklistSlot.tsx";

export function DashboardPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  const role = t(`role.${session.role}`);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageTitle>{t("dashboard.title")}</PageTitle>
      <SetupChecklistSlot />
      <p>
        {session.username === null
          ? t("dashboard.signedInRole", { role })
          : t("dashboard.signedInAs", { username: session.username, role })}
      </p>
      <p className="text-muted-foreground">{t("dashboard.placeholder")}</p>
    </div>
  );
}
