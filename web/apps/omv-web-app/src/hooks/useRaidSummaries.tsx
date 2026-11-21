// SPDX-License-Identifier: GPL-3.0-or-later
// The RAID create flow's summary (phase 5 RAID design 3.3): one item per action in the order they run,
// each disk named as Flow A names it, and the Stripe warning repeated apart from the list, just before
// the typed field (D24).
import { InlineAlert } from "@omv-webui/react-ui-components";
import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { splitTags } from "../filesystems/fsModel.ts";
import { formatBytes } from "../format/format.ts";
import { bytesOf } from "../raid/raidChoices.ts";
import { levelKey, protection, usableSize } from "../raid/raidModel.ts";
import type { CreateChoices } from "../raid/raidRun.ts";
import { useFlowWords } from "./useFlowWords.tsx";
import { useRaidWords } from "./useRaidWords.tsx";

export function useCreateSummary() {
  const { t } = useTranslation();
  const words = useRaidWords();
  const flow = useFlowWords();
  return (
    choices: CreateChoices,
  ): { items: ReactNode[]; notice: ReactNode } => {
    const key = levelKey(choices.level);
    const sizes = choices.targets.map((x) => bytesOf(x.disk.size));
    const items: ReactNode[] = [
      <Fragment key="erase">
        {t("raidCreate.sum.erase", { count: choices.targets.length })}
        <ul className="mt-1 flex list-[circle] flex-col gap-1 ps-5">
          {choices.targets.map((target) => (
            <li key={target.disk.devicefile}>{flow.diskLine(target)}</li>
          ))}
        </ul>
      </Fragment>,
      t("raidCreate.sum.combine", {
        level: words.levelWord(choices.level),
        usable: formatBytes(usableSize(key, sizes)),
        protection: words.protectionText(
          protection(key, choices.targets.length),
        ),
      }),
    ];
    if (choices.level !== "stripe") {
      items.push(t("raidCreate.sum.sync"));
    }
    if (choices.forFiles) {
      items.push(t(`raidCreate.sum.create.${choices.format}`));
      const tags = splitTags(choices.tags);
      if (tags.length > 0) {
        items.push(t("addStorage.sum.tags", { tags: tags.join(", ") }));
      }
      items.push(
        choices.warn > 0
          ? t("addStorage.sum.level", { level: `${String(choices.warn)}%` })
          : t("addStorage.sum.noLevel"),
      );
      items.push(t("raidCreate.sum.saveAndMount"));
      items.push(t("addStorage.sum.shareNext"));
    } else {
      items.push(t("raidCreate.sum.save"));
    }
    const notice =
      choices.level === "stripe" ? (
        <InlineAlert
          tone="neutral"
          icon="warning"
          role="note"
          title={t("raidCreate.sum.stripeTitle")}
        >
          <p>
            {t("raidCreate.sum.stripeBody", { count: choices.targets.length })}
          </p>
        </InlineAlert>
      ) : null;
    return { items, notice };
  };
}
