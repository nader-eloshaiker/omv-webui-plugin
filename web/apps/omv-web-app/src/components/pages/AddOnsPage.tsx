// SPDX-License-Identifier: GPL-3.0-or-later
// Pages that installed plugins add exist only at run time and only in the classic interface.
import { useTranslation } from "react-i18next";
import { CLASSIC_HOME } from "../../navigation/navigation.ts";
import { useSession } from "../../session/sessionContext.ts";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";
import { ClassicOnlyPage } from "./ClassicOnlyPage.tsx";

export function AddOnsPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  const title = t("classicOnly.addOnsTitle");
  if (session.role !== "admin") {
    return <AdminOnlyPage title={title} />;
  }
  return (
    <ClassicOnlyPage
      title={title}
      body={t("classicOnly.addOnsBody")}
      link={t("classicOnly.addOnsLink")}
      classic={CLASSIC_HOME}
    />
  );
}
