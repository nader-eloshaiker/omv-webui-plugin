// SPDX-License-Identifier: GPL-3.0-or-later
// Shown while the interface asks the server whether a session exists.
import { useTranslation } from "react-i18next";

export function BootScreen() {
  const { t } = useTranslation();
  return (
    <p role="status" className="p-6 text-muted-foreground">
      {t("app.loading")}
    </p>
  );
}
