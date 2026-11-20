// SPDX-License-Identifier: GPL-3.0-or-later
// A page of OMV's menu that only the classic interface has so far (route /$group/$item). The entry
// comes from the fixed navigation table, selected by the route's loader.
import { getRouteApi } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { mayOpen } from "../../navigation/navigation.ts";
import { useSession } from "../../session/sessionContext.ts";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";
import { ClassicOnlyPage } from "./ClassicOnlyPage.tsx";

const route = getRouteApi("/_signedIn/$group/$item");

export function MenuPage() {
  const { t } = useTranslation();
  const page = route.useLoaderData();
  const session = useSession();
  const title = t(page.labelKey);
  if (session.status !== "signedIn") {
    return null;
  }
  if (!mayOpen(page, session.role)) {
    return <AdminOnlyPage title={title} />;
  }
  return (
    <ClassicOnlyPage
      title={title}
      body={t("classicOnly.body")}
      link={t("classicOnly.link", { page: title })}
      classic={page.classic}
    />
  );
}
