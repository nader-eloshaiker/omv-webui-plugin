// SPDX-License-Identifier: GPL-3.0-or-later
// A pool's summary (phase 5 ZFS design 2.3): its state, layout and what it can lose, space for files
// from its own folder (D6) with how full it is (D7), the last check, compression, encryption when it is
// encrypted, and its folder on the NAS.
import {
  CopyButton,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Identifier,
} from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { useNow } from "../../hooks/useNow.ts";
import type { PoolView } from "../../hooks/useZfsView.ts";
import { useZfsWords } from "../../hooks/useZfsWords.tsx";
import { isEncrypted, isLocked, protectionOf } from "../../zfs/zfsModel.ts";
import { ZfsStateView } from "../molecules/ZfsStateView.tsx";
import { PoolSpace } from "./ZfsPoolsTable.tsx";

export function ZfsPoolSummary({ view }: { view: PoolView }) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const now = useNow(60_000);
  const { row, root, report, state } = view;
  const last = words.lastCheck(
    row,
    view.reportRead === "read" ? report : null,
    now,
  );
  return (
    <FactList>
      <FactListItem>
        <FactListLabel>{t("zfsPool.fact.state")}</FactListLabel>
        <FactListValue>
          <ZfsStateView state={state} report={report} />
        </FactListValue>
      </FactListItem>
      <FactListItem>
        <FactListLabel>{t("zfsPool.fact.layout")}</FactListLabel>
        <FactListValue>
          <span className="block">{words.poolLayout(report)}</span>
          <span className="block text-sm text-muted-foreground">
            {words.protectionText(protectionOf(report))}
          </span>
        </FactListValue>
      </FactListItem>
      <FactListItem>
        <FactListLabel>{t("zfsPool.fact.space")}</FactListLabel>
        <FactListValue>
          <PoolSpace view={view} compact={false} />
          <span className="block text-sm text-muted-foreground">
            {t("zfsPool.spaceShared")}
          </span>
        </FactListValue>
      </FactListItem>
      <FactListItem>
        <FactListLabel>{t("zfsPool.fact.lastCheck")}</FactListLabel>
        <FactListValue>
          <span className="block">{last.main}</span>
          {last.date === null ? null : (
            <span className="block text-sm text-muted-foreground">
              {last.date}
            </span>
          )}
          {last.old ? (
            <span className="block text-sm text-muted-foreground">
              {t("zfs.checkAdvice")}
            </span>
          ) : null}
        </FactListValue>
      </FactListItem>
      {root === undefined ? null : (
        <FactListItem>
          <FactListLabel>{t("zfsPool.fact.compression")}</FactListLabel>
          <FactListValue>
            <span className="block">{words.compressionText(root)}</span>
            <span className="block text-sm text-muted-foreground">
              {t("zfsPool.compressionInherit")}
            </span>
          </FactListValue>
        </FactListItem>
      )}
      {root !== undefined && isEncrypted(root) ? (
        <FactListItem>
          <FactListLabel>{t("zfsPool.fact.encryption")}</FactListLabel>
          <FactListValue>
            <span className="block">
              {t("zfsPool.encrypted")},{" "}
              {isLocked(root) ? t("zfsPool.locked") : t("zfsPool.unlocked")}
            </span>
            <span className="block text-sm text-muted-foreground">
              {t("zfsPool.encryptionClassic")}
            </span>
          </FactListValue>
        </FactListItem>
      ) : null}
      {root === undefined || root.mountpoint.trim() === "" ? null : (
        <FactListItem>
          <FactListLabel>{t("zfsPool.fact.folder")}</FactListLabel>
          <FactListValue className="flex flex-wrap items-center gap-2">
            <Identifier className="[overflow-wrap:anywhere]">
              {root.mountpoint}
            </Identifier>
            <CopyButton
              text={root.mountpoint}
              label={t("filesystem.fact.copyFolder")}
              copiedLabel={t("common.copied")}
              selectedLabel={t("common.copySelected")}
            />
          </FactListValue>
        </FactListItem>
      )}
    </FactList>
  );
}
