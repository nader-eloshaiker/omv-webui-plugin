// SPDX-License-Identifier: GPL-3.0-or-later
// A pool's file systems and volumes (phase 5 ZFS design 2.6): the pool's own folder first, each file
// system with its state (mounted, locked, not mounted, or no folder), what it holds, the snapshot count
// once its page has counted them this session (the snapshot list is not read here, 0.6), and how many
// shared folders use it. "Add a file system" under it, unavailable with the reason when refused.
import type {
  SharedFolder,
  ZfsObject,
} from "@omv-webui/react-api-omv/generated";
import {
  Button,
  buttonClass,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  Identifier,
  PageSection,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { formatBytes } from "../../format/format.ts";
import { useZfsWords } from "../../hooks/useZfsWords.tsx";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import {
  hasNoFolder,
  hasPage,
  isLocked,
  isVolumeRow,
  onPool,
  sharesOn,
  type PoolBlocker,
} from "../../zfs/zfsModel.ts";
import { zfsSession } from "../../zfs/zfsSession.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

/** A file system's name in the list: its full name, or the pool's own folder said as such. */
export function FsName({ row }: { row: ZfsObject }) {
  const { t } = useTranslation();
  const name =
    row.poolroot === true ? (
      <Trans
        i18nKey="zfsPool.fs.poolFolder"
        components={{ pool: <IdentifierText value={row.path} /> }}
      />
    ) : (
      <Identifier dir="auto">{row.path}</Identifier>
    );
  if (isVolumeRow(row) || !hasPage(row)) {
    return <span>{name}</span>;
  }
  return (
    <Link
      to="/storage/zfs/fs/$"
      params={{ _splat: row.path }}
      aria-label={t("zfsPool.fs.open", { fs: row.path })}
      className={routerLinkClass}
    >
      {name}
    </Link>
  );
}

export function FsState({ row }: { row: ZfsObject }) {
  const { t } = useTranslation();
  if (isVolumeRow(row)) {
    return (
      <span className="text-muted-foreground">
        {t("zfsPool.fs.volumeClassic")}
      </span>
    );
  }
  if (hasNoFolder(row)) {
    return <span>{t("zfsPool.fs.noFolder")}</span>;
  }
  if (isLocked(row)) {
    return (
      <span className="flex flex-wrap items-start gap-2">
        <StatusPill status="critical" className="shrink-0 whitespace-nowrap">
          {t("health.critical")}
        </StatusPill>
        <span>{t("zfsPool.fs.locked")}</span>
      </span>
    );
  }
  if (row.mounted !== true) {
    return (
      <span className="flex flex-wrap items-start gap-2">
        <StatusPill status="critical" className="shrink-0 whitespace-nowrap">
          {t("health.critical")}
        </StatusPill>
        <span>{t("zfsPool.fs.notMounted")}</span>
      </span>
    );
  }
  return (
    <StatusPill status="ok" className="shrink-0 whitespace-nowrap">
      {t("health.ok")}
    </StatusPill>
  );
}

export function ZfsPoolFileSystems({
  pool,
  rows,
  shares,
  addBlocker,
}: {
  pool: string;
  rows: readonly ZfsObject[];
  shares: readonly SharedFolder[] | undefined;
  addBlocker: PoolBlocker | null;
}) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const reasonId = useId();
  const memory = useMemoryStore(zfsSession);
  const [whatOpen, setWhatOpen] = useState(false);
  const list = onPool(rows, pool);
  const usedText = (row: ZfsObject) =>
    row.size !== null && !isVolumeRow(row)
      ? t("zfsPool.fs.usedOf", {
          used: formatBytes(row.used),
          limit: formatBytes(row.size),
        })
      : formatBytes(row.used);
  const onlyRoot = list.every((r) => r.poolroot === true);
  return (
    <PageSection heading={t("zfsPool.fs.title")}>
      <Disclosure open={whatOpen} onOpenChange={setWhatOpen}>
        <DisclosureTrigger>{t("zfsPool.fs.what")}</DisclosureTrigger>
        <DisclosurePanel>
          <p className="max-w-prose">{t("zfs.term.fileSystem")}</p>
          <p className="mt-2 max-w-prose">{t("zfs.term.poolFolder")}</p>
        </DisclosurePanel>
      </Disclosure>
      <Table
        aria-label={t("zfsPool.fs.tableLabel", { pool })}
        frameLabel={t("zfsPool.fs.tableLabel", { pool })}
      >
        <TableHeader>
          <TableRow>
            <TableHead>{t("zfsPool.fs.col.name")}</TableHead>
            <TableHead>{t("zfsPool.fs.col.state")}</TableHead>
            <TableHead className="text-end">
              {t("zfsPool.fs.col.used")}
            </TableHead>
            <TableHead className="max-sm:hidden">
              {t("zfsPool.fs.col.snapshots")}
            </TableHead>
            <TableHead className="max-sm:hidden">
              {t("zfsPool.fs.col.shared")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((row) => {
            const found = sharesOn(row, shares);
            const count = memory.snapshotCounts[row.path];
            return (
              <TableRow key={row.path}>
                <TableCell className="min-w-28 [overflow-wrap:anywhere] sm:min-w-40">
                  <FsName row={row} />
                  {isVolumeRow(row) ? (
                    <span className="block text-sm text-muted-foreground">
                      {t("zfsPool.fs.volume")}
                    </span>
                  ) : null}
                  {/* Under the small breakpoint the Used column is hidden and said here. */}
                  <span className="block text-sm whitespace-nowrap tabular-nums sm:hidden">
                    {usedText(row)}
                  </span>
                </TableCell>
                <TableCell className="sm:min-w-40">
                  <FsState row={row} />
                </TableCell>
                <TableCell className="text-end whitespace-nowrap tabular-nums max-sm:hidden">
                  {usedText(row)}
                </TableCell>
                <TableCell className="tabular-nums max-sm:hidden">
                  {count === undefined ? "" : String(count)}
                </TableCell>
                <TableCell className="max-sm:hidden">
                  {isVolumeRow(row)
                    ? ""
                    : found === undefined
                      ? row.hasshares
                        ? t("zfsPool.fs.shared", { count: 1 })
                        : t("zfsPool.fs.sharedUnknown")
                      : found.length > 0
                        ? t("zfsPool.fs.shared", { count: found.length })
                        : row.hasshares
                          ? t("zfsPool.fs.shared", { count: 1 })
                          : t("zfsPool.fs.notShared")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {onlyRoot ? (
        <p className="max-w-prose text-sm">{t("zfsPool.fs.onlyRoot")}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {addBlocker === null ? (
          <Link
            to="/storage/zfs/pools/$pool/add"
            params={{ pool }}
            className={buttonClass({ variant: "neutral" })}
          >
            {t("zfsPool.fs.add")}
          </Link>
        ) : (
          <>
            <Button
              variant="neutral"
              disabled
              focusableWhenDisabled
              aria-describedby={reasonId}
            >
              {t("zfsPool.fs.add")}
            </Button>
            <p id={reasonId} className="max-w-prose">
              {words.blockerText(addBlocker)}
            </p>
          </>
        )}
      </div>
    </PageSection>
  );
}
