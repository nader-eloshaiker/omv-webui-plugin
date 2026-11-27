// SPDX-License-Identifier: GPL-3.0-or-later
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageTitle } from "../atoms/PageTitle.tsx";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageTitle>{t("notFound.title")}</PageTitle>
      <p>{t("notFound.body")}</p>
      <p>
        <Link to="/" className="text-link underline">
          {t("notFound.home")}
        </Link>
      </p>
    </div>
  );
}
