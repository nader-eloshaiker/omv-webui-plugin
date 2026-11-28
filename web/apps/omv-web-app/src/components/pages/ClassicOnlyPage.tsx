// SPDX-License-Identifier: GPL-3.0-or-later
// A page of OMV's menu that is not in the new interface yet: it says so and links to the same page in
// the classic interface, at a literal path from the navigation table (UI-3). It calls nothing (UI-4).
import { ExternalLink, Page, PageHeader } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { PageTitle } from "../atoms/PageTitle.tsx";

export function ClassicOnlyPage({
  title,
  body,
  link,
  classic,
}: {
  title: string;
  body: string;
  link: string;
  /** A literal path from the navigation table. */
  classic: string;
}) {
  const { t } = useTranslation();
  return (
    <Page className="max-w-3xl">
      <PageHeader title={<PageTitle>{title}</PageTitle>}>
        <p>{body}</p>
        <p>
          <ExternalLink href={classic} newTabLabel={t("app.newTab")}>
            {link}
          </ExternalLink>
        </p>
      </PageHeader>
    </Page>
  );
}
