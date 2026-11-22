// SPDX-License-Identifier: GPL-3.0-or-later
// The ZFS create flow's summary (phase 5 ZFS design 3.3): one item per action in the order they run,
// each disk named as Flow A names it, and the "no protection" warning repeated apart from the list,
// just before the typed field (P4).
import { InlineAlert } from "@omv-webui/react-ui-components";
import { Fragment, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { IdentifierText } from "../components/atoms/IdentifierText.tsx";
import { formatBytes } from "../format/format.ts";
import { createProtection, layoutOfCreate } from "../zfs/zfsModel.ts";
import type { CreateChoices } from "../zfs/zfsRun.ts";
import { useFlowWords } from "./useFlowWords.tsx";
import { useZfsWords } from "./useZfsWords.tsx";

/** The summary (3.3): one item per action in the order they run, and the warning before the field. */
export function useZfsCreateSummary() {
  const { t } = useTranslation();
  const words = useZfsWords();
  const flow = useFlowWords();
  return (
    choices: CreateChoices,
  ): { items: ReactNode[]; notice: ReactNode } => {
    const count = choices.targets.length;
    const layout = words.layoutWord(layoutOfCreate(choices.layout, count));
    const items: ReactNode[] = [
      <Fragment key="erase">
        {t("zfsCreate.sum.erase", { count })}
        <ul className="mt-1 flex list-[circle] flex-col gap-1 ps-5">
          {choices.targets.map((target) => (
            <li key={target.disk.devicefile}>
              {flow.diskLine({ kind: "disk", ...target })}
            </li>
          ))}
        </ul>
      </Fragment>,
      <Fragment key="create">
        <Trans
          i18nKey="zfsCreate.sum.create"
          values={{
            layout,
            usable: formatBytes(choices.usable),
            protection: words.protectionText(
              createProtection(choices.layout, count),
            ),
          }}
          components={{ pool: <IdentifierText value={choices.name} /> }}
        />{" "}
        {t("zfsCreate.sum.folder", { pool: choices.name })}
      </Fragment>,
    ];
    if (choices.fs !== null) {
      items.push(
        <Trans
          key="fs"
          i18nKey="zfsCreate.sum.fs"
          values={{ pool: choices.name, name: choices.fs }}
          components={{
            fs: <IdentifierText value={`${choices.name}/${choices.fs}`} />,
          }}
        />,
      );
    }
    items.push(t("zfsCreate.sum.save"));
    if (choices.fs !== null) {
      items.push(t("zfsCreate.sum.sharing"));
    }
    const notice =
      choices.layout === "basic" ? (
        <InlineAlert
          tone="neutral"
          icon="warning"
          role="note"
          title={t("zfsCreate.sum.noProtectTitle")}
        >
          <p>
            {count === 1
              ? t("zfsCreate.sum.noProtectOne")
              : t("zfsCreate.sum.noProtectMany", { count })}
          </p>
        </InlineAlert>
      ) : null;
    return { items, notice };
  };
}
