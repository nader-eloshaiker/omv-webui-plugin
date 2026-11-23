// SPDX-License-Identifier: GPL-3.0-or-later
// Who may connect to a folder offered to the rsync server, in words (phase 5 services design 0.2, 0.4,
// 9.2): "The computer at 192.0.2.10", "Computers on 192.0.2.0/24", "Any computer with the name and
// password", "Any computer" with the warning shape (no password, anyone who can reach the NAS), or a
// value set in the classic interface as stored. The value is text in the identifier face (UI-2).
import { TriangleAlert } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type { StoredClient } from "../../services/clientRules.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

export function RsyncWhoText({ who }: { who: StoredClient }) {
  const { t } = useTranslation();
  switch (who.kind) {
    case "anyWithPassword":
      return <>{t("rsyncd.who.anyWithPassword")}</>;
    case "any":
      return (
        <span className="inline-flex items-start gap-1.5">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-foreground"
          />
          <span>{t("rsyncd.who.any")}</span>
        </span>
      );
    case "one":
    case "network":
    case "classic":
      return (
        <Trans
          i18nKey={`rsyncd.who.${who.kind}`}
          components={{
            client: <IdentifierText value={inertBidi(who.value)} />,
          }}
        />
      );
  }
}
