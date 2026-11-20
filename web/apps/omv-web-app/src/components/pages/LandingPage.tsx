// SPDX-License-Identifier: GPL-3.0-or-later
// Where sign-in lands until the shell exists (Phase 2, task 5). The set-up checklist of the first
// sign-in (UX audit Q11) takes its place at the top of this page in Phase 3.
import { ExternalLink } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { useSession } from "../../session/sessionContext.ts";
import { ThemeSelect } from "../molecules/ThemeSelect.tsx";
import { SignOutButton } from "../organisms/SignOutButton.tsx";

export function LandingPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  const role = t(`role.${session.role}`);
  return (
    <div className="min-h-dvh bg-page">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{t("landing.title")}</h1>
          <p>
            {session.username === null
              ? t("landing.signedInRole", { role })
              : t("landing.signedInAs", { username: session.username, role })}
          </p>
        </div>
        {/* Phase 3: the set-up checklist (Q11) goes here. */}
        <div className="flex flex-col items-start gap-3 rounded-card border border-border bg-surface p-4">
          <p className="text-muted-foreground">{t("landing.placeholder")}</p>
          <ExternalLink href="/" newTabLabel={t("app.newTab")}>
            {t("landing.classicLink")}
          </ExternalLink>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SignOutButton />
          <ThemeSelect />
        </div>
      </main>
    </div>
  );
}
