// SPDX-License-Identifier: GPL-3.0-or-later
// A pool's disks (phase 5 ZFS design 2.5, 7.1, 7.7): one row per disk in ZFS's report, each group and
// class in its own body under a heading row when the pool has more than one, with the disk's model,
// serial number and size from DiskMgmt.getList, its role in words, and its health from the session's
// check. Two disks while one takes the other's place are one row (the VM gives both the group
// "replacing-1"). Each row offers what section 7 allows: "Replace…", "Take offline…" or "Bring back…";
// where nothing is allowed the reason is said once, under the table. Taking a disk offline is a red
// confirmation without typing (P10); bringing it back a plain one. Both read the pool again first.
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Identifier,
  ServerMessage,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableGroupRow,
  TableHead,
  TableHeader,
  TableRow,
} from "@omv-webui/react-ui-components";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { formatBytes } from "../../format/format.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import { useZfsApi } from "../../hooks/useZfsApi.ts";
import type { PoolView } from "../../hooks/useZfsView.ts";
import { useZfsWords } from "../../hooks/useZfsWords.tsx";
import { bytesOf, diskOf } from "../../raid/raidChoices.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { deviceOf } from "../../zfs/zfsChoices.ts";
import {
  findPool,
  groupProtection,
  isBroken,
  matchDisks,
  offlineDecision,
  onlineDecision,
  parsePoolReport,
  poolState,
  replaceDecision,
  type DiskDecision,
  type PoolDisk,
  type PoolDisks,
  type ReportGroup,
} from "../../zfs/zfsModel.ts";
import { handOffReplace } from "../../zfs/zfsSession.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import {
  CheckedDialog,
  type CheckedPhase,
} from "../molecules/CheckedDialog.tsx";
import { DiskHealthStatus } from "../molecules/DiskHealthStatus.tsx";

const COLUMNS = 6;

function DiskCell({ d, disk }: { d: PoolDisk; disk: DiskDevice | undefined }) {
  const { t } = useTranslation();
  if (d.role === "missing" || disk === undefined) {
    return (
      <span className="flex flex-col">
        <span className="text-muted-foreground">
          {d.role === "missing"
            ? t("zfsPool.disks.missing")
            : t("zfsPool.disks.notInList")}
        </span>
        <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          <Trans
            i18nKey="zfsPool.disks.lastSeen"
            components={{
              path: <IdentifierText value={d.disk.was ?? d.path} />,
            }}
          />
        </span>
      </span>
    );
  }
  return (
    <Link
      to="/storage/disks/$disk"
      params={{ disk: disk.devicename }}
      aria-label={t("disks.openDisk", { device: disk.canonicaldevicefile })}
      className={routerLinkClass}
    >
      <Identifier>{disk.canonicaldevicefile}</Identifier>
    </Link>
  );
}

export function RoleCell({ d, view }: { d: PoolDisk; view: PoolView }) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const detail = words.roleDetail(d);
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-2">
        {isBroken(d.role) ? (
          <StatusPill status="critical">{t("health.critical")}</StatusPill>
        ) : d.role === "workingErrors" ? (
          <StatusPill status="warning">{t("health.warning")}</StatusPill>
        ) : null}
        <span>{words.roleWord(d.role)}</span>
      </span>
      {d.role === "rebuilding" ? (
        <span className="text-sm text-muted-foreground">
          {words.progressText(view.state.scan)}
        </span>
      ) : detail === null ? null : (
        <span className="text-sm text-muted-foreground">{detail}</span>
      )}
      {d.role === "other" ? <Identifier>{d.disk.state}</Identifier> : null}
    </span>
  );
}

type Act = "offline" | "online";

/** What the "What to do now" card opens here: the same dialog as the row's button. */
export interface ZfsDisksHandle {
  open(act: Act, disk: PoolDisk, opener: HTMLButtonElement): void;
}

export function ZfsPoolDisks({
  view,
  disks: poolDisks,
  omvDisks,
  changing,
  onChanged,
  handle,
}: {
  view: PoolView;
  disks: PoolDisks;
  omvDisks: readonly DiskDevice[] | undefined;
  changing: boolean;
  onChanged: () => void;
  handle?: Ref<ZfsDisksHandle>;
}) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const api = useZfsApi();
  const navigate = useNavigate();
  const check = useDiskCheck();
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const pool = view.row.path;
  const [open, setOpen] = useState<{ act: Act; disk: PoolDisk } | null>(null);
  const [phase, setPhase] = useState<CheckedPhase>({ kind: "confirm" });
  const [error, setError] = useState<{ text: string; cause: unknown } | null>(
    null,
  );

  const report = view.report;
  const groups = report.known ? report.groups : [];
  const showHeadings =
    groups.length > 1 || groups.some((g) => g.class !== "data");
  const known = poolDisks.known ? poolDisks.disks : [];

  const replace = (d: PoolDisk) => {
    handOffReplace(pool, d.path);
    void navigate({ to: "/storage/zfs/pools/$pool/replace", params: { pool } });
  };

  const start = (act: Act, d: PoolDisk, opener: HTMLButtonElement) => {
    openerRef.current = opener;
    setError(null);
    setPhase({ kind: "confirm" });
    setOpen({ act, disk: d });
  };

  useImperativeHandle(handle, () => ({ open: start }));

  const confirm = async () => {
    if (open === null) {
      return;
    }
    const { act, disk } = open;
    setPhase({ kind: "confirm", rechecking: true });
    try {
      const [rows, text, devices] = await Promise.all([
        api.list(),
        api.report(pool),
        api.devices(pool),
      ]);
      const row = findPool(rows, pool);
      const parsed = parsePoolReport(text);
      const nowDisks = matchDisks(parsed, devices);
      const nowState = row === undefined ? null : poolState(row, parsed);
      const same = nowDisks.known
        ? nowDisks.disks.find((d) => d.path === disk.path)
        : undefined;
      const decision =
        same === undefined || nowState === null
          ? null
          : act === "offline"
            ? offlineDecision(same, nowState, nowDisks, false)
            : onlineDecision(same, nowState, nowDisks, false);
      if (decision === null || !decision.allowed) {
        setPhase({ kind: "confirm" });
        setError({ text: t("zfsDevice.changed"), cause: undefined });
        return;
      }
      setPhase({ kind: "confirm", running: true });
      if (act === "offline") {
        await api.offline(pool, disk.path);
      } else {
        await api.online(pool, disk.path);
      }
      setOpen(null);
      onChanged();
    } catch (cause) {
      setPhase({ kind: "confirm" });
      setError({ text: t("zfsDevice.failed"), cause });
    }
  };

  const decisionsOf = (d: PoolDisk) => ({
    replace: replaceDecision(d, view.state, poolDisks, changing),
    offline: offlineDecision(d, view.state, poolDisks, changing),
    online: onlineDecision(d, view.state, poolDisks, changing),
  });
  // One reason, said once under the table, when no row offers anything (2.5).
  const reasons = new Set<string>();
  const noteReason = (decision: DiskDecision) => {
    if (!decision.allowed) {
      reasons.add(words.blockerText(decision.blocker));
    }
  };

  const rowsOf = (group: ReportGroup): ReactNode[] => {
    const inGroup = known.filter((d) => d.group === group);
    const seenPairs = new Set<string>();
    const out: ReactNode[] = [];
    for (const d of inGroup) {
      if (d.pair !== null) {
        if (seenPairs.has(d.pair.vdev)) {
          continue;
        }
        seenPairs.add(d.pair.vdev);
        const old = inGroup.find(
          (x) => x.pair?.vdev === d.pair?.vdev && x.disk === d.pair?.old,
        );
        const fresh = inGroup.find(
          (x) => x.pair?.vdev === d.pair?.vdev && x.disk === d.pair?.new,
        );
        out.push(
          <TableRow key={`pair:${d.pair.vdev}`}>
            <TableCell colSpan={COLUMNS}>
              <span className="flex flex-col gap-1">
                <span>
                  <Trans
                    i18nKey={
                      d.pair.kind === "replacing"
                        ? "zfsPool.group.replacing"
                        : "zfsPool.group.standingIn"
                    }
                    components={{
                      new: (
                        <IdentifierText
                          value={
                            fresh === undefined ? "" : deviceOf(fresh, omvDisks)
                          }
                        />
                      ),
                      old: (
                        <IdentifierText
                          value={
                            old === undefined ? "" : deviceOf(old, omvDisks)
                          }
                        />
                      ),
                    }}
                  />
                </span>
                {fresh === undefined ? null : (
                  <span className="text-sm text-muted-foreground">
                    {words.roleWord(fresh.role)}
                    {fresh.role === "rebuilding"
                      ? `: ${words.progressText(view.state.scan)}`
                      : ""}
                  </span>
                )}
              </span>
            </TableCell>
          </TableRow>,
        );
        continue;
      }
      const disk = d.role === "missing" ? undefined : diskOf(d.path, omvDisks);
      const device = deviceOf(d, omvDisks);
      const size = disk === undefined ? null : bytesOf(disk.size);
      const serial = disk?.serialnumber.trim() ?? "";
      const decisions = decisionsOf(d);
      noteReason(decisions.replace);
      out.push(
        <TableRow key={d.path}>
          <TableCell className="whitespace-nowrap">
            <DiskCell d={d} disk={disk} />
            <span className="mt-1 flex flex-col gap-0.5 text-sm whitespace-normal sm:hidden">
              <span dir="auto">
                {[
                  disk?.model.trim() ?? "",
                  size === null ? "" : formatBytes(size),
                ]
                  .filter((x) => x !== "")
                  .join(", ")}
              </span>
              {serial === "" ? null : (
                <span className="text-xs text-muted-foreground">
                  <Trans
                    i18nKey="wipe.serial"
                    components={{ serial: <IdentifierText value={serial} /> }}
                  />
                </span>
              )}
            </span>
          </TableCell>
          <TableCell className="min-w-40 max-sm:hidden">
            <span className="block" dir="auto">
              {disk?.model.trim() ?? ""}
            </span>
            {serial === "" ? null : (
              <span className="block text-xs text-muted-foreground">
                <Trans
                  i18nKey="wipe.serial"
                  components={{ serial: <IdentifierText value={serial} /> }}
                />
              </span>
            )}
          </TableCell>
          <TableCell className="text-end whitespace-nowrap tabular-nums max-sm:hidden">
            {size === null || size === 0 ? "" : formatBytes(size)}
          </TableCell>
          <TableCell className="sm:min-w-32">
            <RoleCell d={d} view={view} />
          </TableCell>
          <TableCell className="min-w-32 max-sm:hidden">
            <DiskHealthStatus
              checked={check.result !== undefined}
              reading={
                disk === undefined
                  ? undefined
                  : check.reading(disk.canonicaldevicefile)
              }
            />
          </TableCell>
          <TableCell>
            <span className="flex flex-wrap gap-2">
              {decisions.replace.allowed ? (
                <Button
                  variant="neutral"
                  size="sm"
                  aria-label={t("zfsPool.disks.replaceLabel", { device, pool })}
                  onClick={() => replace(d)}
                >
                  {t("zfsPool.disks.replace")}
                </Button>
              ) : null}
              {decisions.offline.allowed ? (
                <Button
                  variant="neutral"
                  size="sm"
                  aria-label={t("zfsPool.disks.offlineLabel", { device })}
                  onClick={(e) => start("offline", d, e.currentTarget)}
                >
                  {t("zfsOffline.button")}
                </Button>
              ) : null}
              {decisions.online.allowed ? (
                <Button
                  variant="neutral"
                  size="sm"
                  aria-label={t("zfsPool.disks.onlineLabel", { device, pool })}
                  onClick={(e) => start("online", d, e.currentTarget)}
                >
                  {t("zfsOnline.button")}
                </Button>
              ) : null}
            </span>
          </TableCell>
        </TableRow>,
      );
    }
    return out;
  };

  const groupHeading = (
    group: ReportGroup,
  ): { heading: string; description?: string } => {
    if (group.class === "data") {
      const protection = groupProtection(group);
      const p =
        protection.left === null
          ? null
          : group.layout === "single" || group.layout === "stripe"
            ? ({ key: "none" } as const)
            : protection.left === 0
              ? ({ key: "noMore" } as const)
              : group.layout === "mirror"
                ? ({ key: "mirror", count: protection.left } as const)
                : ({ key: "parity", count: protection.left } as const);
      return {
        heading: t("zfsPool.group.heading", {
          layout: words.layoutWord(group.layout),
          count: group.entries.length,
        }),
        description: words.protectionText(p),
      };
    }
    return {
      heading: t(`zfsPool.group.${group.class}`),
      description:
        group.class === "spares"
          ? `${t("zfsPool.group.sparesHint")} ${t("zfsPool.group.classic")}`
          : t("zfsPool.group.classic"),
    };
  };

  const shown = open?.disk;
  const shownDisk =
    shown === undefined ? undefined : diskOf(shown.path, omvDisks);
  const shownDevice = shown === undefined ? "" : deviceOf(shown, omvDisks);
  const after =
    shown === undefined
      ? ""
      : (() => {
          const g = groupProtection(shown.group);
          const left = (g.left ?? 1) - 1;
          return left <= 0
            ? t("zfsProtect.noMore")
            : shown.group.layout === "mirror"
              ? t("zfsProtect.mirror", { count: left })
              : t("zfsProtect.parity", { count: left });
        })();

  return (
    <section aria-labelledby="zfs-disks" className="flex flex-col gap-2">
      <h2 id="zfs-disks" className="text-lg font-semibold">
        {t("zfsPool.disks.title")}
      </h2>
      {!poolDisks.known ? (
        <p className="max-w-prose">{t("zfsRole.notKnownBlocks")}</p>
      ) : null}
      {poolDisks.known && !poolDisks.byId ? (
        <div className="flex max-w-prose flex-col gap-1">
          <h3 className="font-semibold">{t("zfsPool.notById")}</h3>
          <p>{t("zfsBlock.notById")}</p>
        </div>
      ) : null}
      {poolDisks.known ? (
        <Table
          aria-label={t("zfsPool.disks.tableLabel", { pool })}
          frameLabel={t("zfsPool.disks.tableLabel", { pool })}
        >
          <TableHeader>
            <TableRow>
              <TableHead>{t("zfsPool.disks.col.disk")}</TableHead>
              <TableHead className="max-sm:hidden">
                {t("zfsPool.disks.col.model")}
              </TableHead>
              <TableHead className="text-end max-sm:hidden">
                {t("zfsPool.disks.col.size")}
              </TableHead>
              <TableHead>{t("zfsPool.disks.col.role")}</TableHead>
              <TableHead className="max-sm:hidden">
                {t("zfsPool.disks.col.health")}
              </TableHead>
              <TableHead>
                <span className="sr-only">
                  {t("zfsPool.disks.col.actions")}
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          {groups.map((group, i) => {
            const h = groupHeading(group);
            return (
              <TableBody key={`${group.class}:${group.vdev ?? String(i)}`}>
                {showHeadings ? (
                  <TableGroupRow
                    colSpan={COLUMNS}
                    heading={h.heading}
                    description={h.description}
                  />
                ) : null}
                {rowsOf(group)}
              </TableBody>
            );
          })}
        </Table>
      ) : null}
      {poolDisks.known && !poolDisks.byId
        ? null
        : [...reasons].slice(0, 1).map((reason) => (
            <p key={reason} className="max-w-prose text-sm">
              {reason}
            </p>
          ))}
      {groups.some((g) => g.class !== "data") ? (
        <p className="text-sm text-muted-foreground">
          {t("zfsPool.disks.classesClassic")}
        </p>
      ) : null}
      {check.result === undefined ? (
        <p className="text-sm">
          <Link to="/storage/disks" className={routerLinkClass}>
            {t("zfsPool.disks.checkHealth")}
          </Link>
        </p>
      ) : null}
      <CheckedDialog
        open={open !== null}
        onClose={() => setOpen(null)}
        phase={phase}
        checkingTitle=""
        checkingLabel=""
        destructive={open?.act === "offline"}
        title={
          open?.act === "offline"
            ? t("zfsOffline.title", { device: shownDevice })
            : t("zfsOnline.title", { device: shownDevice, pool })
        }
        description={
          open?.act === "offline" ? (
            <>
              <span className="block">
                <Trans
                  i18nKey="zfsOffline.disk"
                  values={{ model: shownDisk?.model.trim() ?? "" }}
                  components={{
                    device: <IdentifierText value={shownDevice} />,
                    serial: (
                      <IdentifierText
                        value={shownDisk?.serialnumber.trim() ?? ""}
                      />
                    ),
                  }}
                />
              </span>
              <span className="block">
                <Trans
                  i18nKey="zfsOffline.body"
                  values={{ protection: after }}
                  components={{ pool: <IdentifierText value={pool} /> }}
                />
              </span>
            </>
          ) : (
            t("zfsOnline.body")
          )
        }
        confirmLabel={
          open?.act === "offline"
            ? t("zfsOffline.confirm")
            : t("zfsOnline.confirm")
        }
        recheckingLabel={t("zfsDevice.checkingAgain")}
        runningLabel={
          open?.act === "offline"
            ? t("zfsOffline.running", { device: shownDevice })
            : t("zfsOnline.running", { device: shownDevice })
        }
        cancelLabel={t("zfsDevice.cancel")}
        closeLabel={t("zfsDevice.close")}
        error={
          error === null ? undefined : (
            <>
              <p className="text-critical-label">{error.text}</p>
              {isRpcError(error.cause) ? (
                <ServerMessage label={t("app.serverMessage")}>
                  {error.cause.message}
                </ServerMessage>
              ) : null}
            </>
          )
        }
        onConfirm={() => void confirm()}
        openerRef={openerRef}
      />
    </section>
  );
}
