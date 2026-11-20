// SPDX-License-Identifier: GPL-3.0-or-later
// A normal user reached an administrator's page (by its address: the menu does not offer it). This is
// presentation only; the backend refuses an administrator's calls to them anyway.
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageTitle } from "../atoms/PageTitle.tsx";

export function AdminOnlyPage({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageTitle>{title}</PageTitle>
      <p>{t("adminOnly.body")}</p>
      <p>
        <Link to="/" className="text-action-label underline">
          {t("adminOnly.home")}
        </Link>
      </p>
    </div>
  );
}
