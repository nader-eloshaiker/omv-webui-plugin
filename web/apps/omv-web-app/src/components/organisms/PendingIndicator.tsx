// SPDX-License-Identifier: GPL-3.0-or-later
// The pending-changes indicator in the top bar (style guide 5.8), so the state stays visible when the
// band has scrolled away. It takes the reader to the band.
import { Button } from "@omv-webui/react-ui-components";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { PENDING_BAND_ID } from "../../shell/ids.ts";

export function PendingIndicator() {
  const { t } = useTranslation();
  const info = useSystemInformation();
  const count = pendingModules(info.data?.dirtyModules).length;
  if (info.data?.configDirty !== true && count === 0) {
    return null;
  }
  return (
    <Button
      variant="onIdentity"
      size="sm"
      aria-label={
        count > 0
          ? t("pending.indicator", { count })
          : t("pending.indicatorUnknown")
      }
      onClick={() => {
        const band = document.getElementById(PENDING_BAND_ID);
        band?.scrollIntoView({ block: "nearest" });
        band?.focus();
      }}
    >
      <History aria-hidden="true" />
      {count > 0 ? (
        <span aria-hidden="true" className="tabular-nums">
          {count}
        </span>
      ) : null}
      <span aria-hidden="true" className="hidden md:inline">
        {t("pending.indicatorShort")}
      </span>
    </Button>
  );
}
