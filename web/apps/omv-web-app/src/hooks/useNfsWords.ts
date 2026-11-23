// SPDX-License-Identifier: GPL-3.0-or-later
// The words for who an NFS entry lets in, inside a sentence (phase 5 services design 0.2, 2.3, 2.5):
// the short form for a title or a toast ("192.0.2.10", "any computer") and the sentence form ("the
// computer at 192.0.2.10", "computers on 192.0.2.0/24", "any computer that can reach the NAS"). The
// stored value is server text: its bidirectional controls are shown and it is isolated (format/isolate).
import { useTranslation } from "react-i18next";
import { isolateName } from "../format/isolate.ts";
import type { StoredClient } from "../services/clientRules.ts";

export function useNfsWords() {
  const { t } = useTranslation();
  const valueOf = (client: StoredClient) =>
    client.kind === "one" ||
    client.kind === "network" ||
    client.kind === "classic"
      ? isolateName(client.value)
      : "";
  return {
    /** "192.0.2.10", "192.0.2.0/24", "any computer". */
    short: (client: StoredClient): string =>
      client.kind === "any" || client.kind === "anyWithPassword"
        ? t("folderNfs.client.any")
        : valueOf(client),
    /** "the computer at 192.0.2.10", "computers on 192.0.2.0/24", "any computer that can reach…". */
    sentence: (client: StoredClient): string => {
      switch (client.kind) {
        case "one":
          return t("folderNfs.sentence.one", { client: valueOf(client) });
        case "network":
          return t("folderNfs.sentence.network", { client: valueOf(client) });
        case "classic":
          return t("folderNfs.sentence.classic", { client: valueOf(client) });
        case "any":
        case "anyWithPassword":
          return t("folderNfs.sentence.any");
      }
    },
  };
}
