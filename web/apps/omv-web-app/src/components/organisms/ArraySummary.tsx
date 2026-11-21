// SPDX-License-Identifier: GPL-3.0-or-later
// An array's summary card (phase 5 RAID design 2.3): its state, level with what it can lose now, size,
// how many disks are working (from the report), its own name when it has one (never the host part), and
// its device name; the RAID UUID behind "Other names for this array", with a copy button.
import {
  CopyButton,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ArrayView } from "../../hooks/useRaidView.ts";
import { useRaidWords } from "../../hooks/useRaidWords.tsx";
import { ownName } from "../../raid/raidModel.ts";
import { RaidStateView } from "../molecules/RaidStateView.tsx";

export function ArraySummary({ view }: { view: ArrayView }) {
  const { t } = useTranslation();
  const words = useRaidWords();
  const [open, setOpen] = useState(false);
  const { row, state, report } = view;
  const name = ownName(row.name);
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <FactList className="lg:grid-cols-2">
        <FactListItem>
          <FactListLabel>{t("array.fact.state")}</FactListLabel>
          <FactListValue>
            <RaidStateView row={row} state={state} />
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("array.fact.level")}</FactListLabel>
          <FactListValue>
            <span className="block">{words.levelWord(row.level)}</span>
            <span className="block text-sm text-muted-foreground">
              {words.protectionNow(row, state)}
            </span>
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("array.fact.size")}</FactListLabel>
          <FactListValue>
            <span className="block">{words.sizeText(row.size)}</span>
            <span className="block text-sm text-muted-foreground">
              {t("array.fact.sizeHint")}
              {state.kind === "reshaping"
                ? ` ${t("array.fact.sizeGrowing")}`
                : ""}
            </span>
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("array.fact.disks")}</FactListLabel>
          <FactListValue>{words.disksText(row, report)}</FactListValue>
        </FactListItem>
        {name === "" ? null : (
          <FactListItem>
            <FactListLabel>{t("array.fact.name")}</FactListLabel>
            <FactListValue>
              <span dir="auto">{name}</span>
            </FactListValue>
          </FactListItem>
        )}
        <FactListItem>
          <FactListLabel>{t("array.fact.device")}</FactListLabel>
          <FactListValue variant="identifier">{row.devicefile}</FactListValue>
        </FactListItem>
      </FactList>
      <Disclosure open={open} onOpenChange={setOpen}>
        <DisclosureTrigger>
          {open ? t("array.names.hide") : t("array.names.show")}
        </DisclosureTrigger>
        <DisclosurePanel>
          <FactList>
            <FactListItem>
              <FactListLabel>{t("array.names.uuid")}</FactListLabel>
              <FactListValue variant="identifier">
                <span className="flex flex-wrap items-center gap-2">
                  {row.uuid}
                  <CopyButton
                    text={row.uuid}
                    label={t("array.names.copy")}
                    copiedLabel={t("common.copied")}
                    selectedLabel={t("common.copySelected")}
                    size="icon-sm"
                  />
                </span>
              </FactListValue>
            </FactListItem>
          </FactList>
        </DisclosurePanel>
      </Disclosure>
    </section>
  );
}
