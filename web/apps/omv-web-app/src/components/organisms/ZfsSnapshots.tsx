// SPDX-License-Identifier: GPL-3.0-or-later
// A file system's snapshots (phase 5 ZFS design 5; owner, P7): the list in the server's order (name
// order; a snapshot this page takes is named by the NAS's date and time, so the last is the newest),
// pages of 50 past 50 rows, "Take a snapshot now" without a confirmation, "Roll back…" on the newest
// only (ZFS refuses an older one), and "Delete…" on each. Rolling back and deleting are red, with the
// name typed; both read again first. Deleting applies the change it leaves pending (P15).
import type {
  SharedFolder,
  ZfsObject,
  ZfsSnapshot,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  CheckboxField,
  ExternalLink,
  Identifier,
  InlineAlert,
  ServerMessage,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
} from "@omv-webui/react-ui-components";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { isCut } from "../../filesystems/fsTasks.ts";
import { formatBytes } from "../../format/format.ts";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useZfsApi } from "../../hooks/useZfsApi.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { deleteRunOf, isDeleting, zfsActions } from "../../zfs/zfsActions.ts";
import {
  clonesOf,
  findFs,
  findPool,
  isLocked,
  parsePoolReport,
  poolState,
  sharesOn,
  snapshotBlocker,
  snapshotsOf,
  type PoolState,
} from "../../zfs/zfsModel.ts";
import { recordSnapshotCount } from "../../zfs/zfsSession.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import {
  CheckedDialog,
  type CheckedPhase,
} from "../molecules/CheckedDialog.tsx";
import { ZfsDeleteDialog, type DeleteCheck } from "./ZfsDeleteDialog.tsx";

const PAGE = 50;

/** A sentence with its slots filled as plain text, for the polite announcement. */
const plain = (sentence: string, values: Record<string, string>): string =>
  sentence.replace(/<(\w+)><\/\1>/g, (_, name: string) => values[name] ?? "");
const SNAPSHOT_JOBS = "/#/storage/zfs/snapshotjobs";

export function ZfsSnapshots({
  row,
  rows,
  pool,
  state,
  snapshots,
  shares,
  onChanged,
}: {
  row: ZfsObject;
  rows: readonly ZfsObject[];
  pool: string;
  state: PoolState | null;
  snapshots: {
    data?: readonly ZfsSnapshot[];
    isError: boolean;
    error: unknown;
    isFetching: boolean;
    refetch: () => Promise<unknown>;
  };
  shares: readonly SharedFolder[] | undefined;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const zfsApi = useZfsApi();
  const fsApi = useFsApi();
  useMemoryStore(zfsActions);
  const fs = row.path;
  const own =
    snapshots.data === undefined ? undefined : snapshotsOf(snapshots.data, fs);
  const [page, setPage] = useState(0);
  const [recursive, setRecursive] = useState(false);
  const [taking, setTaking] = useState(false);
  const [taken, setTaken] = useState<string | null>(null);
  const [takeError, setTakeError] = useState<unknown>(null);
  const [rolled, setRolled] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [rollback, setRollback] = useState<ZfsSnapshot | null>(null);
  const [rbPhase, setRbPhase] = useState<CheckedPhase>({ kind: "checking" });
  const [rbError, setRbError] = useState<ReactNode>(undefined);
  const [deleting, setDeleting] = useState<ZfsSnapshot | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const runRef = useRef(0);
  const count = own?.length;
  useEffect(() => {
    if (count !== undefined) {
      recordSnapshotCount(fs, count);
    }
  }, [fs, count]);

  const blocker = snapshotBlocker(row, state);
  const hasInside = rows.some((r) => r.path.startsWith(`${fs}/`));
  const newest = own === undefined ? undefined : own[own.length - 1];

  const take = async () => {
    if (taking || blocker !== null) {
      return;
    }
    setTaking(true);
    setTaken(null);
    setTakeError(null);
    try {
      const before = new Set((own ?? []).map((s) => s.path));
      await zfsApi.quickSnapshot(fs, recursive);
      const after = await zfsApi.snapshots();
      const made = snapshotsOf(after, fs).find((s) => !before.has(s.path));
      setTaken(made?.name ?? "");
      setAnnounce(
        made === undefined
          ? t("zfsSnap.takenNoName")
          : plain(t("zfsSnap.taken"), { snapshot: made.name }),
      );
    } catch (error) {
      setTakeError(error);
    } finally {
      setTaking(false);
      void snapshots.refetch();
    }
  };

  /** 5.4: the three reads again; a refusal, or the confirmation. */
  const rollbackCheck = async (
    snap: ZfsSnapshot,
  ): Promise<{ ok: true } | { ok: false; title: string; body: ReactNode }> => {
    const [list, all, report] = await Promise.all([
      zfsApi.list(),
      zfsApi.snapshots(),
      zfsApi.report(pool).catch(() => null),
    ]);
    const nowRow = findFs(list, fs);
    const poolRow = findPool(list, pool);
    const mine = snapshotsOf(all, fs);
    const refused = (body: ReactNode) => ({
      ok: false as const,
      title: t("zfsSnap.refusedTitle"),
      body,
    });
    if (nowRow === undefined || !mine.some((s) => s.path === snap.path)) {
      return refused(t("zfsSnap.gone"));
    }
    if (mine[mine.length - 1]?.path !== snap.path) {
      return refused(t("zfsSnap.notNewest"));
    }
    const nowState =
      poolRow === undefined
        ? null
        : poolState(poolRow, parsePoolReport(report));
    const b = snapshotBlocker(nowRow, nowState);
    if (b !== null) {
      return refused(t(`zfsSnap.blocked.${b}`));
    }
    return { ok: true };
  };

  const openRollback = (snap: ZfsSnapshot, opener: HTMLButtonElement) => {
    openerRef.current = opener;
    const mine = ++runRef.current;
    setRbError(undefined);
    setRbPhase({ kind: "checking" });
    setRollback(snap);
    void rollbackCheck(snap).then(
      (r) => {
        if (runRef.current === mine) {
          setRbPhase(
            r.ok
              ? { kind: "confirm" }
              : { kind: "refused", title: r.title, body: r.body },
          );
        }
      },
      (error: unknown) => {
        if (runRef.current === mine) {
          setRbPhase({
            kind: "refused",
            title: t("zfsSnap.refusedTitle"),
            body: isRpcError(error) ? error.message : t("zfsSnap.loadFailed"),
          });
        }
      },
    );
  };

  const confirmRollback = async () => {
    if (rollback === null) {
      return;
    }
    const snap = rollback;
    const mine = runRef.current;
    setRbError(undefined);
    setRbPhase({ kind: "confirm", rechecking: true });
    try {
      const again = await rollbackCheck(snap);
      if (runRef.current !== mine) {
        return;
      }
      if (!again.ok) {
        setRbPhase({ kind: "refused", title: again.title, body: again.body });
        return;
      }
      setRbPhase({ kind: "confirm", running: true });
      await zfsApi.rollback(snap.path);
      setRollback(null);
      setRolled(snap.name);
      setAnnounce(plain(t("zfsSnap.rb.done"), { fs, snapshot: snap.name }));
      onChanged();
      void snapshots.refetch();
    } catch (error) {
      if (isCut(error)) {
        setRollback(null);
        setRbError(undefined);
        setAnnounce(t("zfsSnap.rb.unknown", { fs }));
        onChanged();
        return;
      }
      setRbPhase({ kind: "confirm" });
      setRbError(
        <>
          <p className="text-critical-label">
            {t("zfsSnap.rb.failed", { fs })}
          </p>
          {isRpcError(error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {error.message}
            </ServerMessage>
          ) : null}
        </>,
      );
    }
  };

  const deleteCheck = (snap: ZfsSnapshot) => async (): Promise<DeleteCheck> => {
    const [list, all, pending] = await Promise.all([
      zfsApi.list(),
      zfsApi.snapshots(),
      fsApi.pending(),
    ]);
    const now = all.find((s) => s.path === snap.path);
    if (now === undefined) {
      return { kind: "gone" };
    }
    const clones = clonesOf(list, [snap.path]);
    const clone = clones[0];
    if (clone !== undefined) {
      return {
        kind: "refused",
        body: (
          <Trans
            i18nKey="zfsSnap.del.cloned"
            components={{ clone: <IdentifierText value={clone.path} /> }}
          />
        ),
      };
    }
    if (pending.length > 0) {
      return { kind: "preflight", modules: pending };
    }
    return {
      kind: "confirm",
      request: { type: "Snapshot", name: now.path, mp: "", recursive: false },
      details: (
        <div className="flex flex-col gap-2">
          <p>
            <Trans
              i18nKey="zfsSnap.del.of"
              values={{ used: formatBytes(now.used) }}
              components={{ fs: <IdentifierText value={fs} /> }}
            />
          </p>
          <p>
            <Trans
              i18nKey="zfsSnap.del.consequence"
              components={{ fs: <IdentifierText value={fs} /> }}
            />
          </p>
        </div>
      ),
    };
  };

  const shared = sharesOn(row, shares) ?? [];
  const total = (own ?? []).reduce((n, s) => n + s.used, 0);
  const shown =
    own === undefined ? [] : own.slice(page * PAGE, page * PAGE + PAGE);
  let body: ReactNode;
  if (own === undefined && !snapshots.isError) {
    body = (
      <Table
        aria-label={t("zfsSnap.tableLabel", { fs })}
        busy
        busyLabel={t("zfsSnap.loading")}
      >
        <TableBody>
          <TableSkeletonRows rows={3} columns={3} />
        </TableBody>
      </Table>
    );
  } else if (own === undefined) {
    body = (
      <InlineAlert tone="critical" title={t("zfsSnap.loadFailed")}>
        {isRpcError(snapshots.error) ? (
          <ServerMessage label={t("app.serverMessage")}>
            {snapshots.error.message}
          </ServerMessage>
        ) : null}
        <p>
          <Button
            variant="neutral"
            size="sm"
            loading={snapshots.isFetching}
            onClick={() => void snapshots.refetch()}
          >
            {t("common.tryAgain")}
          </Button>
        </p>
      </InlineAlert>
    );
  } else if (own.length === 0) {
    body = <p className="max-w-prose">{t("zfsSnap.empty")}</p>;
  } else {
    body = (
      <>
        <Table
          aria-label={t("zfsSnap.tableLabel", { fs })}
          frameLabel={t("zfsSnap.tableLabel", { fs })}
        >
          <TableHeader>
            <TableRow>
              <TableHead>{t("zfsSnap.col.snapshot")}</TableHead>
              <TableHead className="text-end max-sm:hidden">
                <span className="block">{t("zfsSnap.col.holds")}</span>
                <span className="block text-xs font-normal tracking-normal normal-case">
                  {t("zfsSnap.col.holdsHint")}
                </span>
              </TableHead>
              <TableHead>
                <span className="sr-only">{t("zfsSnap.col.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((snap) => {
              const isNewest = snap.path === newest?.path;
              const running = isDeleting(deleteRunOf(snap.path));
              return (
                <TableRow key={snap.path}>
                  <TableCell className="py-2 [overflow-wrap:anywhere]">
                    <Identifier dir="auto" className="whitespace-nowrap">
                      {snap.name}
                    </Identifier>
                    {isNewest ? (
                      <span className="ms-2 text-xs text-muted-foreground">
                        {t("zfsSnap.newest")}
                      </span>
                    ) : null}
                    {/* Under the small breakpoint the Holds column is hidden and said here. */}
                    <span className="block text-sm text-muted-foreground tabular-nums sm:hidden">
                      {t("zfsSnap.col.holds")}: {formatBytes(snap.used)}
                    </span>
                  </TableCell>
                  <TableCell numeric className="py-2 max-sm:hidden">
                    {formatBytes(snap.used)}
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="flex flex-wrap gap-2">
                      {isNewest && blocker === null ? (
                        <Button
                          variant="neutral"
                          size="sm"
                          aria-label={t("zfsSnap.rollBackLabel", {
                            fs,
                            snapshot: snap.name,
                          })}
                          onClick={(e) => openRollback(snap, e.currentTarget)}
                        >
                          {t("zfsSnap.rollBack")}
                        </Button>
                      ) : null}
                      <Button
                        variant="neutral"
                        size="sm"
                        aria-label={t("zfsSnap.deleteLabel", {
                          fs,
                          snapshot: snap.name,
                        })}
                        onClick={(e) => {
                          openerRef.current = e.currentTarget;
                          setDeleting(snap);
                        }}
                      >
                        {running ? t("zfsSnap.checking") : t("zfsSnap.delete")}
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {own.length > PAGE ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="tabular-nums">
              {t("table.range", {
                from: page * PAGE + 1,
                to: Math.min(own.length, page * PAGE + PAGE),
                total: own.length,
              })}
            </span>
            <Button
              variant="neutral"
              size="sm"
              disabled={page === 0}
              focusableWhenDisabled
              onClick={() => setPage(Math.max(0, page - 1))}
            >
              {t("zfsSnap.previous")}
            </Button>
            <Button
              variant="neutral"
              size="sm"
              disabled={(page + 1) * PAGE >= own.length}
              focusableWhenDisabled
              onClick={() => setPage(page + 1)}
            >
              {t("zfsSnap.next")}
            </Button>
          </div>
        ) : null}
        {own.length > 1 ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("zfsSnap.goFurther")}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <section aria-labelledby="zfs-snapshots" className="flex flex-col gap-3">
      <h2 id="zfs-snapshots" className="text-lg font-semibold">
        {t("zfsSnap.title")}
      </h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        {t("zfs.term.snapshot")} {t("zfsSnap.singleFile")}
      </p>
      <p role="status" className="sr-only">
        {announce}
      </p>
      {rolled === null ? null : (
        <InlineAlert tone="neutral">
          <Trans
            i18nKey="zfsSnap.rb.done"
            components={{
              fs: <IdentifierText value={fs} />,
              snapshot: <IdentifierText value={rolled} />,
            }}
          />
        </InlineAlert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {own === undefined ? null : (
          <span>
            {t("zfsSnap.summary", {
              count: own.length,
              total: formatBytes(total),
            })}
          </span>
        )}
        <Button
          variant="neutral"
          loading={taking}
          disabled={blocker !== null}
          focusableWhenDisabled
          onClick={() => void take()}
        >
          {taking ? t("zfsSnap.taking") : t("zfsSnap.take")}
        </Button>
        {hasInside ? (
          <CheckboxField
            label={t("zfsSnap.recursive")}
            checked={recursive}
            onCheckedChange={(on: boolean) => setRecursive(on)}
          />
        ) : null}
      </div>
      {blocker === null ? null : (
        <p className="max-w-prose">{t(`zfsSnap.blocked.${blocker}`)}</p>
      )}
      {taken === null ? null : (
        <p className="text-sm">
          {taken === "" ? (
            t("zfsSnap.takenNoName")
          ) : (
            <Trans
              i18nKey="zfsSnap.taken"
              components={{ snapshot: <IdentifierText value={taken} /> }}
            />
          )}
        </p>
      )}
      {takeError === null ? null : (
        <InlineAlert tone="critical" title={t("zfsSnap.takeFailed")}>
          {isRpcError(takeError) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {takeError.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      )}
      {body}
      <p className="text-sm text-muted-foreground">
        {t("zfsSnap.schedules")}{" "}
        <ExternalLink href={SNAPSHOT_JOBS} newTabLabel={t("app.newTab")}>
          {t("zfsSnap.schedulesLink")}
        </ExternalLink>
      </p>

      <CheckedDialog
        open={rollback !== null}
        onClose={() => {
          runRef.current += 1;
          setRollback(null);
        }}
        phase={rbPhase}
        checkingTitle={t("zfsSnap.rb.title", {
          fs,
          snapshot: rollback?.name ?? "",
        })}
        checkingLabel={t("zfsSnap.checking")}
        title={t("zfsSnap.rb.title", { fs, snapshot: rollback?.name ?? "" })}
        description={
          <Trans
            i18nKey="zfsSnap.rb.consequence"
            components={{ fs: <IdentifierText value={fs} /> }}
          />
        }
        destructive
        typed={{
          confirmText: fs,
          prompt: t("zfsSnap.rb.typePrompt", { fs }),
          hint: t("zfsSnap.rb.typeHint"),
        }}
        confirmLabel={t("zfsSnap.rb.confirm")}
        recheckingLabel={t("zfsSnap.rb.checkingAgain")}
        runningLabel={t("zfsSnap.rb.running", { fs })}
        cancelLabel={t("zfsSnap.cancel")}
        closeLabel={t("zfsSnap.close")}
        error={rbError}
        onConfirm={() => void confirmRollback()}
        openerRef={openerRef}
      >
        <div className="flex flex-col gap-2">
          {shared.length > 0 ? (
            <p>
              {t("zfsSnap.rb.shared", {
                list: shared.map((s) => s.name).join(", "),
              })}
            </p>
          ) : null}
          <p>{t("zfsSnap.rb.kept")}</p>
          {isLocked(row) ? <p>{t("zfsSnap.blocked.locked")}</p> : null}
        </div>
      </CheckedDialog>

      {deleting === null ? null : (
        <ZfsDeleteDialog
          open
          onClose={() => setDeleting(null)}
          kind="snapshot"
          pool={pool}
          name={deleting.path}
          check={deleteCheck(deleting)}
          openerRef={openerRef}
          words={{
            checkingTitle: t("zfsSnap.del.title", { snapshot: deleting.name }),
            checking: t("zfsSnap.checking"),
            title: t("zfsSnap.del.title", { snapshot: deleting.name }),
            description: "",
            typed: {
              confirmText: deleting.name,
              prompt: t("zfsSnap.del.typePrompt", { snapshot: deleting.name }),
            },
            confirm: t("zfsSnap.del.confirm"),
            goneBody: t("zfsSnap.gone"),
            stepDelete: t("zfsSnap.del.step.delete"),
            task: t("zfsSnap.del.task", { snapshot: deleting.name }),
            failed: t("zfsSnap.del.failed", { snapshot: deleting.name }),
            goneAnyway: t("zfsSnap.del.goneAnyway"),
            unknown: t("zfsSnap.del.failed", { snapshot: deleting.name }),
          }}
          onDone={() => {
            setAnnounce(
              plain(t("zfsSnap.del.done"), { snapshot: deleting.name }),
            );
            setDeleting(null);
            onChanged();
            void snapshots.refetch();
          }}
        />
      )}
    </section>
  );
}
