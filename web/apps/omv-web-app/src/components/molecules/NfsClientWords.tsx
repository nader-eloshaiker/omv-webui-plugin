// SPDX-License-Identifier: GPL-3.0-or-later
// Who an NFS entry lets in, as a heading or a table cell (phase 5 services design 0.2, 2.2): "The
// computer at 192.0.2.10", "Computers on 192.0.2.0/24", "Any computer that can reach the NAS", or a
// value set in the classic interface as stored, "(set in the classic interface)". The value is server
// text, in the Identifier style, with its bidirectional controls shown (format/isolate).
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type { StoredClient } from "../../services/clientRules.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

export function NfsClientWords({ client }: { client: StoredClient }) {
  const { t } = useTranslation();
  switch (client.kind) {
    case "any":
    case "anyWithPassword":
      return <>{t("folderNfs.entry.any")}</>;
    case "one":
    case "network":
    case "classic":
      return (
        <Trans
          i18nKey={
            client.kind === "one"
              ? "folderNfs.entry.one"
              : client.kind === "network"
                ? "folderNfs.entry.network"
                : "folderNfs.entry.classic"
          }
          components={{
            client: <IdentifierText value={inertBidi(client.value)} />,
          }}
        />
      );
  }
}
