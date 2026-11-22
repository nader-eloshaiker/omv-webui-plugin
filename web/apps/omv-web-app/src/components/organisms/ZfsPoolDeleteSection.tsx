// SPDX-License-Identifier: GPL-3.0-or-later
// "Delete this pool" (phase 5 ZFS design 9.2; owner, P9), last on the pool's page. Offered only once
// only its own folder is left (the plugin refuses otherwise); refused while shared folders or anything
// else use its own folder, while it is locked, and when the reads this needs failed (fail closed). The
// dialog reads everything again, then refuses, says the pool is gone, asks to apply or undo other
// pending changes first (P15), or confirms: red, naming every disk, with the pool's name typed. The
// folder sent is its own folder's, as Zfs.listPools reported it (item 10). A pool being checked or
// rebuilt may be deleted: nothing it holds is kept.
import type {
  ConfiguredFilesystem,
  DiskDevice,
  SharedFolder,
  ZfsSnapshot,
} from "@omv-webui/react-api-omv/generated";
import { Button, Identifier } from "@omv-webui/react-ui-components";
import { useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { labelSize } from "../../disks/diskWords.ts";
import { formatBytes } from "../../format/format.ts";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useZfsApi } from "../../hooks/useZfsApi.ts";
import type { PoolView } from "../../hooks/useZfsView.ts";
import { useZfsWords } from "../../hooks/useZfsWords.tsx";
import { bytesOf, diskOf } from "../../raid/raidChoices.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { deleteRunOf, isDeleting, zfsActions } from "../../zfs/zfsActions.ts";
import { deviceOf } from "../../zfs/zfsChoices.ts";
import {
  findPool,
  fsUsedBy,
  isUnknown,
  parsePoolReport,
  poolDeleteBlockers,
  poolRoot,
  poolState,
  type FsUsedBy,
  type PoolDisks,
} from "../../zfs/zfsModel.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { ZfsDeleteBlockers } from "./ZfsDeleteBlockers.tsx";
import { ZfsDeleteDialog, type DeleteCheck } from "./ZfsDeleteDialog.tsx";

export interface DeletedPool {
  pool: string;
  disks: { device: string; devicename: string | null }[];
}

/** The disks each deletion of this session started with, for its result once the pool is gone. */
const deletingDisks = new Map<string, DeletedPool["disks"]>();

/** The deletion's dialog alone, once the pool has gone from the list while its run lasts. */
export function ZfsPoolDeleteRun({
  pool,
  onDeleted,
}: {
  pool: string;
  onDeleted: (deleted: DeletedPool | null) => void;
}) {
  const words = usePoolDeleteWords(pool);
  return (
    <ZfsDeleteDialog
      open
      onClose={() => undefined}
      kind="pool"
      pool={pool}
      name={pool}
      check={() => Promise.resolve({ kind: "gone" })}
      words={words}
      onDone={(outcome) =>
        onDeleted(
          outcome === "unknown"
            ? null
            : { pool, disks: deletingDisks.get(pool) ?? [] },
        )
      }
    />
  );
}

function usePoolDeleteWords(pool: string) {
  const { t } = useTranslation();
  return {
    checkingTitle: t("zfsDelete.pool.dialogTitle", { pool }),
    checking: t("zfsDelete.pool.checking"),
    title: t("zfsDelete.pool.dialogTitle", { pool }),
    description: (
      <span>
        <Identifier>{pool}</Identifier>
      </span>
    ),
    typed: {
      confirmText: pool,
      prompt: t("zfsDelete.pool.typePrompt", { pool }),
    },
    confirm: t("zfsDelete.pool.confirm"),
    goneBody: t("zfsDelete.pool.gone"),
    stepDelete: t("zfsDelete.pool.step.delete"),
    task: t("zfsDelete.pool.task", { pool }),
    failed: t("zfsDelete.pool.failed", { pool }),
    goneAnyway: t("zfsDelete.pool.goneAnyway"),
    unknown: t("zfsDelete.pool.unknown", { pool }),
  };
}

export function ZfsPoolDeleteSection({
  view,
  rows,
  disks: poolDisks,
  omvDisks,
  configured,
  shares,
  changing,
  onRetry,
  onDeleted,
}: {
  view: PoolView;
  rows: Parameters<typeof poolDeleteBlockers>[1];
  disks: PoolDisks;
  omvDisks: readonly DiskDevice[] | undefined;
  configured: {
    data?: readonly ConfiguredFilesystem[];
    failed: boolean;
    error?: unknown;
  };
  shares: { data?: readonly SharedFolder[]; failed: boolean; error?: unknown };
  changing: boolean;
  onRetry: () => void;
  onDeleted: (deleted: DeletedPool | null) => void;
}) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const fsApi = useFsApi();
  const zfsApi = useZfsApi();
  useMemoryStore(zfsActions);
  const reasonId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const pool = view.row.path;
  const deleteWords = usePoolDeleteWords(pool);

  const usedOf = (
    sharesIn: typeof shares,
    configuredIn: typeof configured,
    snapshots: {
      data?: readonly ZfsSnapshot[];
      failed: boolean;
      error?: unknown;
    },
    list = rows,
  ): FsUsedBy | null => {
    const own = poolRoot(list, pool);
    if (own === undefined) {
      return null;
    }
    const omv = configuredIn.data?.find(
      (c) => c.type === "zfs" && c.devicefile === pool,
    );
    return fsUsedBy(own, list, {
      shares: sharesIn,
      omvUsed: {
        value:
          configuredIn.data === undefined ? undefined : (omv?._used ?? false),
        failed: configuredIn.failed,
        error: configuredIn.error,
      },
      snapshots,
    });
  };
  const running = isDeleting(deleteRunOf(pool));
  const blockers = poolDeleteBlockers(
    pool,
    rows,
    usedOf(shares, configured, { data: [], failed: false }),
    isUnknown(view.state) && view.state.kind !== "unread",
    changing && !running,
  );

  const check = async (): Promise<DeleteCheck> => {
    const settle = <T,>(p: Promise<T>) =>
      p.then(
        (value) => ({ data: value, failed: false as const }),
        (error: unknown) => ({ data: undefined, failed: true as const, error }),
      );
    const [list, sharesNow, configuredNow, snapshots, pending, text, devices] =
      await Promise.all([
        zfsApi.list(),
        settle(fsApi.shares()),
        settle(fsApi.configured()),
        settle(zfsApi.snapshots()),
        fsApi.pending(),
        zfsApi.report(pool).catch(() => null),
        zfsApi.devices(pool).catch(() => []),
      ]);
    const row = findPool(list, pool);
    if (row === undefined) {
      return { kind: "gone" };
    }
    const report = parsePoolReport(text);
    const state = poolState(row, report);
    const nowBlockers =
      poolDeleteBlockers(
        pool,
        list,
        usedOf(sharesNow, configuredNow, snapshots, list),
        state.kind === "unrecognised",
        false,
      ) ?? [];
    if (nowBlockers.length > 0) {
      return {
        kind: "refused",
        body: <ZfsDeleteBlockers blockers={nowBlockers} of="pool" />,
      };
    }
    if (pending.length > 0) {
      return { kind: "preflight", modules: pending };
    }
    const own = poolRoot(list, pool);
    if (own === undefined) {
      return { kind: "refused", body: t("zfsDelete.blocked.unread") };
    }
    const snapshotCount = (snapshots.data ?? []).filter(
      (s) => s.parent === pool || s.parent.startsWith(`${pool}/`),
    ).length;
    const paths = devices.map((d) => d.devicefile);
    const diskLines = (
      poolDisks.known ? poolDisks.disks.map((d) => d.path) : paths
    ).map((path) => {
      const disk = diskOf(path, omvDisks);
      const size = disk === undefined ? 0 : bytesOf(disk.size);
      const label = labelSize(size);
      const sizeText =
        size <= 0
          ? ""
          : label === null
            ? formatBytes(size)
            : t("raidRemove.sizeLabel", {
                size: formatBytes(size),
                label: t("format.sizeDecimal", label),
              });
      const known = poolDisks.known
        ? poolDisks.disks.find((d) => d.path === path)
        : undefined;
      const device =
        known === undefined
          ? (disk?.canonicaldevicefile ?? path)
          : deviceOf(known, omvDisks);
      return (
        <li key={path}>
          <Trans
            i18nKey={
              disk?.model.trim()
                ? "zfsDelete.pool.disk"
                : "zfsDelete.pool.diskNoModel"
            }
            values={{ model: disk?.model.trim() ?? "", size: sizeText }}
            components={{
              device: <IdentifierText value={device} />,
              serial: (
                <IdentifierText value={disk?.serialnumber.trim() ?? ""} />
              ),
            }}
          />
        </li>
      );
    });
    deletingDisks.set(
      pool,
      (poolDisks.known ? poolDisks.disks : []).map((d) => {
        const disk = diskOf(d.path, omvDisks);
        return {
          device: deviceOf(d, omvDisks),
          devicename: disk?.devicename ?? null,
        };
      }),
    );
    return {
      kind: "confirm",
      request: {
        type: "Pool",
        name: pool,
        mp: own.mountpoint,
        recursive: false,
      },
      details: (
        <div className="flex flex-col gap-2">
          <p>
            {t("zfsDelete.pool.facts", {
              layout: words.poolLayout(report),
              space: formatBytes(own.used + own.available),
            })}
          </p>
          <ul className="flex list-disc flex-col gap-1 ps-5">{diskLines}</ul>
          <p>
            {t("zfsDelete.pool.consequence", {
              used: formatBytes(own.used),
              count: snapshotCount,
            })}
          </p>
          <p>{t("zfsDelete.pool.disks")}</p>
        </div>
      ),
    };
  };

  return (
    <section
      aria-labelledby="zfs-pool-delete"
      className="mt-6 flex flex-col gap-2 border-t border-border pt-6"
    >
      <h2 id="zfs-pool-delete" className="text-lg font-semibold">
        {t("zfsDelete.pool.title")}
      </h2>
      <p className="max-w-prose">{t("zfsDelete.pool.intro")}</p>
      {blockers === null ? (
        <p role="status" aria-busy="true" className="text-muted-foreground">
          {t("zfsDelete.pool.checking")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-3">
        <Button
          ref={openerRef}
          variant="neutral"
          disabled={blockers === null || (blockers.length > 0 && !running)}
          focusableWhenDisabled
          aria-describedby={
            blockers !== null && blockers.length > 0 ? reasonId : undefined
          }
          onClick={
            running || (blockers !== null && blockers.length === 0)
              ? () => setOpen(true)
              : undefined
          }
        >
          {t("zfsDelete.pool.open")}
        </Button>
        {blockers !== null && blockers.length > 0 && !running ? (
          <div id={reasonId} className="flex flex-col gap-2">
            <ZfsDeleteBlockers blockers={blockers} of="pool" />
            {blockers.some((b) => b.kind === "unread") ? (
              <p>
                <Button variant="neutral" size="sm" onClick={onRetry}>
                  {t("common.tryAgain")}
                </Button>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <ZfsDeleteDialog
        open={open}
        onClose={() => setOpen(false)}
        kind="pool"
        pool={pool}
        name={pool}
        check={check}
        openerRef={openerRef}
        words={deleteWords}
        onDone={(outcome) => {
          setOpen(false);
          onDeleted(
            outcome === "unknown"
              ? null
              : { pool, disks: deletingDisks.get(pool) ?? [] },
          );
        }}
      />
    </section>
  );
}
