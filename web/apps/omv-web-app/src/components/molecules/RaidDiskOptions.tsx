// SPDX-License-Identifier: GPL-3.0-or-later
// The disk options of the RAID flows (phase 5 RAID design 0.7, 3.2 C1, 4.3 A2): each disk named as
// Flow A names it (device, model, size, then its serial number and, for Erase and reuse, what is on it),
// and the disks that cannot be used, each with why, behind a disclosure.
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  Identifier,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { formatBytes } from "../../format/format.ts";
import { useFlowWords } from "../../hooks/useFlowWords.tsx";
import type { RaidDiskChoice, RaidUnusable } from "../../raid/raidChoices.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { WipeBlockers } from "./WipeBlockers.tsx";

export function RaidDiskHint({ choice }: { choice: RaidDiskChoice }) {
  const { t } = useTranslation();
  const words = useFlowWords();
  const serial = choice.disk.serialnumber.trim();
  return (
    <>
      {serial === "" ? null : (
        <span className="block text-xs text-muted-foreground">
          <Trans
            i18nKey="addStorage.optionSerial"
            components={{ serial: <IdentifierText value={serial} /> }}
          />
        </span>
      )}
      {choice.group === "reuse" ? (
        <span className="mt-0.5 block text-sm text-foreground" dir="auto">
          {choice.holds.length === 0
            ? t("raidCreate.holdsUnknown")
            : words.holdsText(choice.holds).join(" ")}
        </span>
      ) : null}
    </>
  );
}

export function RaidCannotUse({
  unusable,
  defaultOpen,
}: {
  unusable: readonly RaidUnusable[];
  defaultOpen: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  if (unusable.length === 0) {
    return null;
  }
  return (
    <Disclosure open={open} onOpenChange={setOpen}>
      <DisclosureTrigger>
        {t("addStorage.cannotUse", { count: unusable.length })}
      </DisclosureTrigger>
      <DisclosurePanel>
        <ul className="flex flex-col gap-3">
          {unusable.map((u) => (
            <li key={u.disk.devicefile} className="flex flex-col gap-1">
              <p className="font-medium">
                <Identifier>{u.disk.canonicaldevicefile}</Identifier>
                {u.disk.model.trim() === "" ? null : (
                  <span dir="auto">, {u.disk.model.trim()}</span>
                )}
              </p>
              {u.kind === "blocked" ? (
                <WipeBlockers blockers={u.blockers} />
              ) : u.kind === "usb" ? (
                <p>{t("raidCreate.cannotUsb")}</p>
              ) : (
                <p>{t("raidAdd.cannotSmall", { size: formatBytes(u.min) })}</p>
              )}
            </li>
          ))}
        </ul>
      </DisclosurePanel>
    </Disclosure>
  );
}
