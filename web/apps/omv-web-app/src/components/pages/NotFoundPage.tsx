// SPDX-License-Identifier: GPL-3.0-or-later
import { Page, PageHeader } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageTitle } from "../atoms/PageTitle.tsx";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Page className="max-w-3xl">
      <PageHeader title={<PageTitle>{t("notFound.title")}</PageTitle>}>
        <p>{t("notFound.body")}</p>
        <p>
          <Link to="/" className="text-link underline">
            {t("notFound.home")}
          </Link>
        </p>
      </PageHeader>
    </Page>
  );
}
