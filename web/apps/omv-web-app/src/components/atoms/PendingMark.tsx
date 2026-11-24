// SPDX-License-Identifier: GPL-3.0-or-later
// The small pending mark beside a page title (style guide 5.8; phase 3 design 0.5): this page's module
// has saved changes that are not applied yet. It is the only pending gold on the page; the band does
// the rest.
import { StatusPill } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";

export function PendingMark() {
  const { t } = useTranslation();
  return <StatusPill status="pending">{t("pending.itemMark")}</StatusPill>;
}
