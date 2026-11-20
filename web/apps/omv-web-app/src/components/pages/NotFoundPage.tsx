// SPDX-License-Identifier: GPL-3.0-or-later
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-3 bg-page px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
      <p>{t("notFound.body")}</p>
      <Link to="/" className="text-action-label underline">
        {t("notFound.home")}
      </Link>
    </main>
  );
}
