// SPDX-License-Identifier: GPL-3.0-or-later
// A ZFS file system's page (phase 5 ZFS design 4.3): how much it holds, whether it can be reached,
// what uses it, which snapshots keep its older files, its size limit and compression, its technical
// details on request, and deleting it. Addressed by its full name, validated in the route; the row is
// found in Zfs.listPools and every later call uses its fields (UI-4). What uses it is found by its
// folder: FsTab.getByFsName refuses a ZFS name (HTTP 400, observed), so it is never called here. A
// volume has no page. A normal user gets the "only administrators" page, and nothing is called first.
import type { ZfsObject } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  CapacityMeter,
  CopyButton,
  EmptyState,
  ExternalLink,
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
  Identifier,
  JobResult,
  Skeleton,
  StatusPill,
  UsedByPanel,
} from "@omv-webui/react-ui-components";
import { Link, useParams } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { formatBytes } from "../../format/format.ts";
import { useConfiguredFs } from "../../hooks/useDiskReads.ts";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useAllShares } from "../../hooks/useFsReads.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { useZfsApi } from "../../hooks/useZfsApi.ts";
import { useZfsFsDetails, useZfsSnapshots } from "../../hooks/useZfsReads.ts";
import { useZfsPoolView } from "../../hooks/useZfsView.ts";
import { useZfsWords } from "../../hooks/useZfsWords.tsx";
import { CLASSIC } from "../../navigation/navigation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { deleteRunOf, isDeleting, zfsActions } from "../../zfs/zfsActions.ts";
import {
  findFs,
  findPool,
  fsDeleteBlockers,
  fsUsedBy,
  isEncrypted,
  isLocked,
  isUnknown,
  isUnusable,
  isVolumeRow,
  originOf,
  poolOf,
  snapshotsOf,
  type FsUsedBy,
} from "../../zfs/zfsModel.ts";
import { ZFS_SETTING_MODULES } from "../../zfs/zfsRun.ts";
import { zfsSession } from "../../zfs/zfsSession.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { ZfsNotInstalled } from "../molecules/ZfsNotInstalled.tsx";
import { ZfsDeleteBlockers } from "../organisms/ZfsDeleteBlockers.tsx";
import {
  ZfsDeleteDialog,
  type DeleteCheck,
} from "../organisms/ZfsDeleteDialog.tsx";
import { ZfsDetails } from "../organisms/ZfsDetails.tsx";
import { ZfsFsSettings } from "../organisms/ZfsFsSettings.tsx";
import { FsState } from "../organisms/ZfsPoolFileSystems.tsx";
import { ZfsSnapshots } from "../organisms/ZfsSnapshots.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";
import { ZfsCrumbs } from "./ZfsPoolPage.tsx";

export function ZfsFsRoutePage() {
  const { _splat } = useParams({ from: "/_signedIn/storage/zfs/fs/$" });
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("zfs.title")} />;
  }
  return (
    <ZfsFs address={_splat === "" || _splat === undefined ? null : _splat} />
  );
}

function NotFound({ pool }: { pool: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ZfsCrumbs pool={null} />
      <PageTitle>{t("zfs.title")}</PageTitle>
      <EmptyState
        action={
          pool === null ? (
            <Link to="/storage/zfs" className={routerLinkClass}>
              {t("zfsFs.showAll")}
            </Link>
          ) : (
            <Link
              to="/storage/zfs/pools/$pool"
              params={{ pool }}
              className={routerLinkClass}
            >
              {t("zfsFs.showPool", { pool })}
            </Link>
          )
        }
      >
        {t("zfsFs.notFound")}
      </EmptyState>
    </div>
  );
}

function FsUsedByPanel({
  used,
  onRetry,
}: {
  used: FsUsedBy;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (used.kind === "loading") {
    return (
      <UsedByPanel
        title={t("zfsFs.usedBy.title")}
        referrers={[]}
        emptyText={t("zfsFs.usedBy.nothing")}
        loading={{ label: t("zfsFs.usedBy.checking") }}
      />
    );
  }
  if (used.kind === "unchecked") {
    return (
      <UsedByPanel
        title={t("zfsFs.usedBy.title")}
        referrers={[]}
        emptyText={t("zfsFs.usedBy.nothing")}
        error={{
          message: t("zfsFs.usedBy.unread"),
          serverMessage: isRpcError(used.error)
            ? { label: t("app.serverMessage"), text: used.error.message }
            : undefined,
          retryLabel: t("common.tryAgain"),
          onRetry,
        }}
      />
    );
  }
  const referrers = [
    ...used.shares.map((s) => ({
      id: `share:${s.uuid}`,
      kind: t("zfsFs.usedBy.share"),
      name: s.name,
      action: (
        <Link
          to="/storage/shared-folders/$folder"
          params={{ folder: s.uuid }}
          aria-label={t("zfsFs.usedBy.openShare", { name: s.name })}
          className={routerLinkClass}
        >
          {t("filesystem.usedBy.openShared")}
        </Link>
      ),
    })),
    ...used.inside.map((r) => ({
      id: `inside:${r.path}`,
      kind: isVolumeRow(r)
        ? t("zfsFs.usedBy.volume")
        : t("zfsFs.usedBy.inside"),
      name: r.path,
      action: isVolumeRow(r) ? undefined : (
        <Link
          to="/storage/zfs/fs/$"
          params={{ _splat: r.path }}
          aria-label={t("zfsFs.usedBy.openFs", { fs: r.path })}
          className={routerLinkClass}
        >
          {t("zfsPool.fs.open", { fs: r.path })}
        </Link>
      ),
    })),
    ...used.clones.map(({ clone, snapshot }) => ({
      id: `clone:${clone.path}`,
      kind: t("zfsFs.usedBy.cloneKind"),
      name: `${clone.path} (${snapshot})`,
    })),
  ];
  return (
    <UsedByPanel
      title={t("zfsFs.usedBy.title")}
      referrers={referrers}
      emptyText={t("zfsFs.usedBy.nothing")}
      unknownUse={
        used.other || used.sharedUnnamed
          ? {
              message: used.sharedUnnamed
                ? t("zfsFs.usedBy.sharedUnnamed")
                : t("zfsFs.usedBy.other"),
              classicLink: (
                <ExternalLink
                  href={CLASSIC.fileSystems}
                  newTabLabel={t("app.newTab")}
                >
                  {t("zfsFs.usedBy.otherLink")}
                </ExternalLink>
              ),
            }
          : undefined
      }
    />
  );
}

function ZfsFs({ address }: { address: string | null }) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const fsApi = useFsApi();
  const zfsApi = useZfsApi();
  const pool = address === null ? null : (address.split("/")[0] ?? null);
  const v = useZfsPoolView(pool);
  const row: ZfsObject | undefined =
    address === null || v.rows === undefined
      ? undefined
      : findFs(v.rows, address);
  const page = row !== undefined && !isVolumeRow(row);
  const snapshots = useZfsSnapshots(page);
  const shares = useAllShares(page);
  const configured = useConfiguredFs();
  const details = useZfsFsDetails(row?.path ?? "");
  const info = useSystemInformation("admin");
  const memory = useMemoryStore(zfsSession);
  useMemoryStore(zfsActions);
  const openerRef = useRef<HTMLButtonElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleted, setDeleted] = useState<{ fs: string; pool: string } | null>(
    null,
  );
  const [cut, setCut] = useState(false);

  const refresh = () =>
    Promise.allSettled([
      v.list.refetch(),
      v.report?.refetch(),
      snapshots.refetch(),
      shares.refetch(),
      configured.refetch(),
    ]);

  // The deletion's dialog, kept open while its run lasts, also once the file system is gone from the
  // list (a finished task reads everything again).
  const deleteDialog = (
    path: string,
    onPool: string,
    check: () => Promise<DeleteCheck>,
  ) => (
    <ZfsDeleteDialog
      open={deleteOpen || deleteRunOf(path) !== undefined}
      onClose={() => setDeleteOpen(false)}
      kind="fs"
      pool={onPool}
      name={path}
      check={check}
      openerRef={openerRef}
      words={{
        checkingTitle: t("zfsDelete.fs.dialogTitle", { fs: path }),
        checking: t("zfsDelete.fs.checking"),
        title: t("zfsDelete.fs.dialogTitle", { fs: path }),
        description: "",
        typed: {
          confirmText: path,
          prompt: t("zfsDelete.fs.typePrompt", { fs: path }),
        },
        confirm: t("zfsDelete.fs.confirm"),
        goneBody: t("zfsDelete.fs.gone"),
        stepDelete: t("zfsDelete.fs.step.delete"),
        task: t("zfsDelete.fs.task", { fs: path }),
        failed: t("zfsDelete.fs.failed", { fs: path }),
        goneAnyway: t("zfsDelete.fs.goneAnyway"),
        unknown: t("zfsDelete.fs.unknown", { fs: path }),
      }}
      onDone={(outcome) => {
        setDeleteOpen(false);
        if (outcome === "unknown") {
          setCut(true);
        } else {
          setDeleted({ fs: path, pool: onPool });
        }
        void refresh();
      }}
    />
  );

  if (v.missing) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <PageTitle>{t("zfs.title")}</PageTitle>
        <ZfsNotInstalled />
      </div>
    );
  }
  if (
    deleted === null &&
    address !== null &&
    deleteRunOf(address) !== undefined &&
    (v.rows === undefined || findFs(v.rows, address) === undefined)
  ) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <ZfsCrumbs pool={pool} current={address} />
        <PageTitle>{t("zfs.title")}</PageTitle>
        {deleteDialog(address, pool ?? "", () =>
          Promise.resolve({ kind: "gone" }),
        )}
      </div>
    );
  }
  if (deleted !== null) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <ZfsCrumbs pool={deleted.pool} current={deleted.fs} />
        <PageTitle>{t("zfs.title")}</PageTitle>
        <JobResult
          result={{
            status: "succeeded",
            statusLabel: t("addStorage.state.succeeded"),
            message: (
              <>
                <span className="block font-semibold">
                  {t("zfsDelete.fs.doneTitle", { fs: deleted.fs })}
                </span>
                <span className="block">
                  <Trans
                    i18nKey="zfsDelete.fs.doneBody"
                    components={{
                      pool: <IdentifierText value={deleted.pool} />,
                    }}
                  />
                </span>
              </>
            ),
          }}
          dismissLabel={t("zfsDelete.dismiss")}
          onDismiss={() => setDeleted(null)}
        />
        <p>
          <Link
            to="/storage/zfs/pools/$pool"
            params={{ pool: deleted.pool }}
            className={routerLinkClass}
          >
            {t("zfsFs.openPool", { pool: deleted.pool })}
          </Link>
        </p>
      </div>
    );
  }
  if (address === null) {
    return <NotFound pool={null} />;
  }
  if (v.rows === undefined) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <ZfsCrumbs pool={null} />
        {v.list.isError ? (
          <>
            <PageTitle>{t("zfs.title")}</PageTitle>
            <ReadFailed
              error={v.list.error}
              retrying={v.list.isFetching}
              onRetry={() => void v.list.refetch()}
            >
              {t("zfsFs.loadFailed")}
            </ReadFailed>
          </>
        ) : (
          <div role="status" aria-busy="true" className="flex flex-col gap-4">
            <span className="sr-only">{t("zfsFs.loading")}</span>
            <Skeleton className="h-8 w-48" />
            <FactListSkeleton rows={4} />
          </div>
        )}
      </div>
    );
  }
  if (row === undefined) {
    return <NotFound pool={pool !== null && v.view !== null ? pool : null} />;
  }
  const poolName = poolOf(row);
  if (isVolumeRow(row)) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <ZfsCrumbs pool={poolName} current={row.path} />
        <PageTitle>{t("zfs.title")}</PageTitle>
        <EmptyState
          action={
            <ExternalLink href={CLASSIC.zfs} newTabLabel={t("app.newTab")}>
              {t("zfs.classicLink")}
            </ExternalLink>
          }
        >
          {t("zfsFs.volumeNoPage")}
        </EmptyState>
      </div>
    );
  }

  const view = v.view;
  const state = view?.state ?? null;
  const poolRow = v.rows === undefined ? undefined : findPool(v.rows, poolName);
  const pending = pendingModules(info.data?.dirtyModules);
  const marked =
    memory.saved.includes(row.path) &&
    pending.some((m) => (ZFS_SETTING_MODULES as readonly string[]).includes(m));
  const omvRow = configured.data?.data.find(
    (c) => c.type === "zfs" && c.devicefile === row.path,
  );
  const used = fsUsedBy(row, v.rows, {
    shares: {
      data: shares.data?.data,
      failed: shares.isError,
      error: shares.error,
    },
    omvUsed: {
      value:
        configured.data === undefined ? undefined : (omvRow?._used ?? false),
      failed: configured.isError,
      error: configured.error,
    },
    snapshots: {
      data: snapshots.data?.data,
      failed: snapshots.isError,
      error: snapshots.error,
    },
  });
  const running = isDeleting(deleteRunOf(row.path));
  const blockers = fsDeleteBlockers(
    row,
    used,
    state !== null && state.kind === "unrecognised",
    memory.changing.includes(poolName) && !running,
  );
  const title =
    row.poolroot === true ? (
      <Trans
        i18nKey="zfsPool.fs.poolFolder"
        components={{ pool: <IdentifierText value={row.path} /> }}
      />
    ) : (
      <Identifier dir="auto" className="[overflow-wrap:anywhere]">
        {row.path}
      </Identifier>
    );

  const check = async (): Promise<DeleteCheck> => {
    const settle = <T,>(p: Promise<T>) =>
      p.then(
        (value) => ({ data: value, failed: false as const }),
        (error: unknown) => ({ data: undefined, failed: true as const, error }),
      );
    const [list, all, sharesNow, configuredNow, pendingNow] = await Promise.all(
      [
        zfsApi.list(),
        settle(zfsApi.snapshots()),
        settle(fsApi.shares()),
        settle(fsApi.configured()),
        fsApi.pending(),
      ],
    );
    const now = findFs(list, row.path);
    if (now === undefined) {
      return { kind: "gone" };
    }
    const nowOmv = configuredNow.data?.find(
      (c) => c.type === "zfs" && c.devicefile === now.path,
    );
    const nowUsed = fsUsedBy(now, list, {
      shares: sharesNow,
      omvUsed: {
        value: configuredNow.failed ? undefined : (nowOmv?._used ?? false),
        failed: configuredNow.failed,
        error: configuredNow.failed ? configuredNow.error : undefined,
      },
      snapshots: all,
    });
    const nowBlockers = fsDeleteBlockers(now, nowUsed, false, false) ?? [];
    if (nowBlockers.length > 0) {
      return {
        kind: "refused",
        body: <ZfsDeleteBlockers blockers={nowBlockers} of="fs" />,
      };
    }
    if (pendingNow.length > 0) {
      return { kind: "preflight", modules: pendingNow };
    }
    const mine = snapshotsOf(all.data ?? [], now.path);
    const held = mine.reduce((n, s) => n + s.used, 0);
    return {
      kind: "confirm",
      request: {
        type: "Filesystem",
        name: now.path,
        mp: now.mountpoint,
        recursive: false,
      },
      details: (
        <div className="flex flex-col gap-2">
          <p>
            <Trans
              i18nKey="zfsDelete.fs.facts"
              values={{ used: formatBytes(now.used) }}
              components={{
                pool: <IdentifierText value={poolOf(now)} />,
                folder: <IdentifierText value={now.mountpoint} />,
              }}
            />
          </p>
          <p>
            {t("zfsDelete.fs.snapshots", {
              count: mine.length,
              size: formatBytes(held),
            })}
          </p>
          <p>
            <Trans
              i18nKey="zfsDelete.fs.consequence"
              values={{ count: mine.length }}
              components={{ fs: <IdentifierText value={now.path} /> }}
            />
          </p>
        </div>
      ),
    };
  };

  const limitBytes = row.size;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ZfsCrumbs pool={poolName} current={row.path} />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <PageTitle documentTitle={t("zfsFs.documentTitle", { fs: row.path })}>
            {title}
          </PageTitle>
          {marked ? <PendingMark /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("zfsFs.subtitle", { pool: poolName })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <FsState row={row} />
        {state !== null && state.status !== "ok" ? (
          <p className="flex flex-wrap items-start gap-2">
            <StatusPill status={state.status}>
              {words.statusWord(state.status)}
            </StatusPill>
            <span>
              <Trans
                i18nKey="zfsFs.poolState"
                values={{ status: words.statusWord(state.status), reason: "" }}
                components={{
                  pool: (
                    <Link
                      to="/storage/zfs/pools/$pool"
                      params={{ pool: poolName }}
                      className={routerLinkClass}
                    >
                      <Identifier>{poolName}</Identifier>
                    </Link>
                  ),
                }}
              />{" "}
              {view === null ? null : words.stateReason(state, view.report)}
            </span>
          </p>
        ) : null}
      </div>
      {cut ? (
        <p role="status">{t("zfsDelete.fs.unknown", { fs: row.path })}</p>
      ) : null}

      <FactList>
        <FactListItem>
          <FactListLabel>{t("zfsFs.fact.space")}</FactListLabel>
          <FactListValue>
            {limitBytes !== null && limitBytes > 0 ? (
              <CapacityMeter
                label={t("zfsFs.fact.space")}
                variant="compact"
                value={Math.min(100, Math.round((row.used / limitBytes) * 100))}
                max={100}
                valueText={t("zfsFs.spaceLimit", {
                  used: formatBytes(row.used),
                  limit: formatBytes(limitBytes),
                })}
              />
            ) : (
              t("zfsFs.spaceShared", {
                used: formatBytes(row.used),
                available: formatBytes(row.available),
                pool: poolName,
              })
            )}
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("zfsFs.fact.limit")}</FactListLabel>
          <FactListValue>
            {limitBytes === null ? t("zfsFs.noLimit") : formatBytes(limitBytes)}
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("zfsFs.fact.compression")}</FactListLabel>
          <FactListValue>{words.compressionText(row)}</FactListValue>
        </FactListItem>
        {row.mountpoint.trim() === "" || row.mountpoint === "none" ? null : (
          <FactListItem>
            <FactListLabel>{t("zfsFs.fact.folder")}</FactListLabel>
            <FactListValue className="flex flex-wrap items-center gap-2">
              <Identifier className="[overflow-wrap:anywhere]">
                {row.mountpoint}
              </Identifier>
              <CopyButton
                text={row.mountpoint}
                label={t("filesystem.fact.copyFolder")}
                copiedLabel={t("common.copied")}
                selectedLabel={t("common.copySelected")}
              />
            </FactListValue>
          </FactListItem>
        )}
        {isEncrypted(row) ? (
          <FactListItem>
            <FactListLabel>{t("zfsFs.fact.encryption")}</FactListLabel>
            <FactListValue>
              <span className="block">
                {isLocked(row)
                  ? t("zfsFs.encryptedLocked")
                  : t("zfsFs.encryptedUnlocked")}
              </span>
              <span className="block text-sm text-muted-foreground">
                {t("zfsPool.encryptionClassic")}
              </span>
            </FactListValue>
          </FactListItem>
        ) : null}
        {originOf(row) === null ? null : (
          <FactListItem>
            <FactListLabel>{t("zfsFs.fact.origin")}</FactListLabel>
            <FactListValue>
              <Trans
                i18nKey="zfsFs.origin"
                components={{
                  origin: <IdentifierText value={originOf(row) ?? ""} />,
                }}
              />
            </FactListValue>
          </FactListItem>
        )}
      </FactList>

      <FsUsedByPanel used={used} onRetry={() => void refresh()} />

      <ZfsSnapshots
        row={row}
        rows={v.rows}
        pool={poolName}
        state={state}
        snapshots={{
          data: snapshots.data?.data,
          isError: snapshots.isError,
          error: snapshots.error,
          isFetching: snapshots.isFetching,
          refetch: () => snapshots.refetch(),
        }}
        shares={shares.data?.data}
        onChanged={() => void refresh()}
      />

      <ZfsFsSettings
        row={row}
        readOnly={
          state === null ||
          isUnknown(state) ||
          isUnusable(state) ||
          poolRow === undefined
        }
        onSaved={() => void refresh()}
      />

      <ZfsDetails
        label={t("zfsFs.details.label", { fs: row.path })}
        intro={t("zfsFs.details.readsPool")}
        text={typeof details.data === "string" ? details.data : null}
        failed={details.isError}
        error={details.error}
        retrying={details.isFetching}
        onRetry={() => void details.refetch()}
        onOpen={() => {
          if (details.data === undefined && !details.isFetching) {
            void details.refetch();
          }
        }}
      />

      <section
        aria-labelledby="zfs-fs-delete"
        className="mt-6 flex flex-col gap-2 border-t border-border pt-6"
      >
        <h2 id="zfs-fs-delete" className="text-lg font-semibold">
          {t("zfsDelete.fs.title")}
        </h2>
        {row.poolroot === true ? (
          <p className="max-w-prose">
            {t("zfsFs.poolFolderNote")}{" "}
            <Link
              to="/storage/zfs/pools/$pool"
              params={{ pool: poolName }}
              className={routerLinkClass}
            >
              {t("zfsFs.openPool", { pool: poolName })}
            </Link>
          </p>
        ) : (
          <>
            <p className="max-w-prose">{t("zfsDelete.fs.intro")}</p>
            {blockers === null ? (
              <p
                role="status"
                aria-busy="true"
                className="text-muted-foreground"
              >
                {t("zfsDelete.fs.checking")}
              </p>
            ) : null}
            <div className="flex flex-wrap items-start gap-3">
              <Button
                ref={openerRef}
                variant="neutral"
                disabled={
                  blockers === null || (blockers.length > 0 && !running)
                }
                focusableWhenDisabled
                aria-describedby={
                  blockers !== null && blockers.length > 0
                    ? "zfs-fs-delete-why"
                    : undefined
                }
                onClick={
                  running || (blockers !== null && blockers.length === 0)
                    ? () => setDeleteOpen(true)
                    : undefined
                }
              >
                {t("zfsDelete.fs.open")}
              </Button>
              {blockers !== null && blockers.length > 0 && !running ? (
                <div id="zfs-fs-delete-why" className="flex flex-col gap-2">
                  <ZfsDeleteBlockers blockers={blockers} of="fs" />
                  {blockers.some((b) => b.kind === "unread") ? (
                    <p>
                      <Button
                        variant="neutral"
                        size="sm"
                        onClick={() => void refresh()}
                      >
                        {t("common.tryAgain")}
                      </Button>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            {deleteDialog(row.path, poolName, check)}
          </>
        )}
      </section>
    </div>
  );
}
