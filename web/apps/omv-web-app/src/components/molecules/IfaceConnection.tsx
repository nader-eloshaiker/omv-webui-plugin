// SPDX-License-Identifier: GPL-3.0-or-later
// What an interface is doing, in words with a neutral icon of its own shape (phase 5 network design
// 0.3, D8): "Connected at 1 Gbit/s" with a cable, "Not connected" with an unplugged one. No status
// colour: an unplugged spare port is normal. Also the kind word after an interface's name (0.2).
import { Cable, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../format/useFormat.ts";
import type { ConnectionWord, KindKey } from "../../network/ifaceModel.ts";

export function IfaceConnection({ word }: { word: ConnectionWord }) {
  const { t } = useTranslation();
  const format = useFormat();
  const Icon = word.kind === "connected" ? Cable : Unplug;
  const speed =
    word.kind === "connected" && word.speed !== null
      ? format.speed(word.speed)
      : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span>
        {word.kind === "notConnected"
          ? t("dashboard.network.notConnected")
          : speed === null
            ? t("dashboard.network.connected")
            : t("dashboard.network.connectedAt", { speed })}
      </span>
    </span>
  );
}

/** "Network port", "Bond", …, in the quieter ink after the name. */
export function IfaceKind({ kind }: { kind: KindKey }) {
  const { t } = useTranslation();
  return (
    <span className="text-sm text-muted-foreground">
      {t(`iface.kind.${kind}`)}
    </span>
  );
}
