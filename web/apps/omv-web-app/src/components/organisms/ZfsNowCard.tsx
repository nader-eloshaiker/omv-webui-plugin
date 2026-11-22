// SPDX-License-Identifier: GPL-3.0-or-later
// "What to do now" on a pool's page (phase 5 ZFS design 2.4, 8): the start of Flow F. Each case says
// only what applies: a failed, missing or offline disk and how to replace it (the disk named by model
// and serial number, so the right one is pulled), a rebuild under way, a pool that cannot be used,
// damaged files, a disk's error counts (with "Clear the error counts…", 7.8), or a working disk the
// session's health check warns about. It never claims a disk is failing from anything else. A pool whose
// disks ZFS names by changeable names says so, and offers no change to its disks (fail closed, item 9).
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ServerMessage,
} from "@omv-webui/react-ui-components";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Trans, useTranslation } from "react-i18next";
import { diskState } from "../../dashboard/dashboard.ts";
import { formatBytes } from "../../format/format.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import { useZfsApi } from "../../hooks/useZfsApi.ts";
import type { PoolView } from "../../hooks/useZfsView.ts";
import { diskOf } from "../../raid/raidChoices.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { deviceOf, minSizeFor } from "../../zfs/zfsChoices.ts";
import {
  findPool,
  isBroken,
  isWorking,
  onlineDecision,
  replaceDecision,
  type PoolDisk,
  type PoolDisks,
} from "../../zfs/zfsModel.ts";
import { handOffReplace } from "../../zfs/zfsSession.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import {
  CheckedDialog,
  type CheckedPhase,
} from "../molecules/CheckedDialog.tsx";
import { DiskReason } from "../molecules/DiskHealthStatus.tsx";
import type { ZfsCheckHandle } from "./ZfsCheckSection.tsx";
import type { ZfsDisksHandle } from "./ZfsPoolDisks.tsx";

export function ZfsNowCard({
  view,
  disks: poolDisks,
  omvDisks,
  changing,
  disksRef,
  checkRef,
  detailsId,
  onRescan,
  onChanged,
}: {
  view: PoolView;
  disks: PoolDisks;
  omvDisks: readonly DiskDevice[] | undefined;
  changing: boolean;
  disksRef: RefObject<ZfsDisksHandle | null>;
  checkRef: RefObject<ZfsCheckHandle | null>;
  /** The technical details' heading, for "Show technical details". */
  detailsId: string;
  onRescan: () => Promise<void>;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const api = useZfsApi();
  const navigate = useNavigate();
  const check = useDiskCheck();
  const pool = view.row.path;
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [phase, setPhase] = useState<CheckedPhase>({ kind: "confirm" });
  const [error, setError] = useState<unknown>(null);
  const { state } = view;
  const all = poolDisks.known ? poolDisks.disks : [];

  const replaceButton = (d: PoolDisk) =>
    replaceDecision(d, state, poolDisks, changing).allowed ? (
      <Button
        onClick={() => {
          handOffReplace(pool, d.path);
          void navigate({
            to: "/storage/zfs/pools/$pool/replace",
            params: { pool },
          });
        }}
      >
        {t("zfsPool.todo.replace")}
      </Button>
    ) : null;
  const named = (d: PoolDisk) => {
    const disk = diskOf(d.path, omvDisks);
    return {
      device: <IdentifierText value={deviceOf(d, omvDisks)} />,
      serial: <IdentifierText value={disk?.serialnumber.trim() ?? ""} />,
      model: disk?.model.trim() ?? "",
    };
  };
  const sizeOf = (d: PoolDisk) => {
    const min = minSizeFor(d, all, omvDisks);
    return min === null ? "" : formatBytes(min);
  };

  let title: string | null = null;
  let body: ReactNode = null;
  let actions: ReactNode = null;

  const broken = all.find(
    (d) =>
      d.group.class === "data" &&
      d.pair === null &&
      isBroken(d.role) &&
      d.role !== "missing",
  );
  const missing = all.find(
    (d) => d.group.class === "data" && d.role === "missing",
  );
  const offline = all.find((d) => d.role === "offline" && d.pair === null);
  const withErrors = all.find(
    (d) => d.group.class === "data" && d.role === "workingErrors",
  );
  const warned = all.find((d) => {
    if (!isWorking(d.role)) {
      return false;
    }
    const disk = diskOf(d.path, omvDisks);
    const reading =
      disk === undefined ? undefined : check.reading(disk.canonicaldevicefile);
    const s = reading === undefined ? null : diskState(reading.overallstatus);
    return s?.status === "warning" || s?.status === "critical";
  });
  const notById =
    poolDisks.known && !poolDisks.byId ? (
      <p className="max-w-prose">{t("zfsPool.todo.notById")}</p>
    ) : null;

  if (state.kind === "unusable" || state.kind === "suspended") {
    title = t("zfsPool.todo.unusableTitle");
    body = <p className="max-w-prose">{t("zfsPool.todo.unusableBody")}</p>;
  } else if (state.kind === "dataErrors") {
    title = t("zfsPool.todo.damagedTitle");
    body = <p className="max-w-prose">{t("zfsPool.todo.damagedBody")}</p>;
    actions = (
      <a href={`#${detailsId}`} className={routerLinkClass}>
        {t("zfsPool.details.show")}
      </a>
    );
  } else if (state.kind === "degradedRebuilding" || state.kind === "copying") {
    title = t("zfsPool.todo.rebuildingTitle");
    body = (
      <p className="max-w-prose">
        <Trans
          i18nKey="zfsPool.todo.rebuildingBody"
          components={{ disk: <IdentifierText value={state.disk ?? ""} /> }}
        />
      </p>
    );
  } else if (broken !== undefined) {
    const n = named(broken);
    title = t("zfsPool.todo.failedTitle");
    body = (
      <>
        <p className="max-w-prose">
          <Trans
            i18nKey="zfsPool.todo.failedBody"
            values={{ model: n.model, size: sizeOf(broken) }}
            components={{ device: n.device, serial: n.serial }}
          />
        </p>
        <ol className="flex list-decimal flex-col gap-1 ps-5">
          <li>{t("zfsPool.todo.wayFree")}</li>
          <li>{t("zfsPool.todo.waySwap")}</li>
        </ol>
        {notById}
      </>
    );
    actions = replaceButton(broken);
  } else if (missing !== undefined) {
    title = t("zfsPool.todo.missingTitle");
    const left = all.filter(
      (d) => d.group === missing.group && d !== missing && isWorking(d.role),
    );
    body = (
      <>
        <p className="max-w-prose">
          <Trans
            i18nKey="zfsPool.todo.missingBody"
            values={{
              list: left
                .map((d) => {
                  const disk = diskOf(d.path, omvDisks);
                  return disk === undefined
                    ? deviceOf(d, omvDisks)
                    : `${disk.canonicaldevicefile} (${disk.serialnumber.trim()})`;
                })
                .join(", "),
            }}
            components={{
              path: <IdentifierText value={missing.disk.was ?? missing.path} />,
            }}
          />
        </p>
        <p className="max-w-prose">
          {t("zfsPool.todo.missingConnect", { size: sizeOf(missing) })}
        </p>
        {notById}
      </>
    );
    actions = (
      <>
        <Button
          variant="neutral"
          loading={rescanning}
          onClick={async () => {
            if (rescanning) {
              return;
            }
            setRescanning(true);
            try {
              await onRescan();
            } finally {
              setRescanning(false);
            }
          }}
        >
          {rescanning ? t("zfsPool.todo.rescanning") : t("zfsPool.todo.rescan")}
        </Button>
        {replaceButton(missing)}
      </>
    );
  } else if (offline !== undefined) {
    title = t("zfsPool.todo.offlineTitle");
    body = (
      <>
        <p className="max-w-prose">
          <Trans
            i18nKey="zfsPool.todo.offlineBody"
            components={{ device: named(offline).device }}
          />
        </p>
        {notById}
      </>
    );
    actions = (
      <>
        {replaceButton(offline)}
        {onlineDecision(offline, state, poolDisks, changing).allowed ? (
          <Button
            variant="neutral"
            onClick={(e) =>
              disksRef.current?.open("online", offline, e.currentTarget)
            }
          >
            {t("zfsPool.todo.bringBack")}
          </Button>
        ) : null}
      </>
    );
  } else if (withErrors !== undefined) {
    const n = named(withErrors);
    title = t("zfsPool.todo.errorsTitle");
    body = (
      <>
        <p className="max-w-prose">
          <Trans
            i18nKey="zfsPool.todo.errorsBody"
            values={{ model: n.model }}
            components={{ device: n.device, serial: n.serial }}
          />
        </p>
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("zfsPool.todo.clearHint")}
        </p>
      </>
    );
    actions = (
      <>
        <Button
          variant="neutral"
          onClick={(e) => checkRef.current?.start(e.currentTarget)}
        >
          {t("zfsCheck.start")}
        </Button>
        <Button
          variant="neutral"
          onClick={(e) => {
            openerRef.current = e.currentTarget;
            setError(null);
            setPhase({ kind: "confirm" });
            setClearing(true);
          }}
        >
          {t("zfsClear.button")}
        </Button>
      </>
    );
  } else if (warned !== undefined) {
    const n = named(warned);
    const disk = diskOf(warned.path, omvDisks);
    const reading =
      disk === undefined ? undefined : check.reading(disk.canonicaldevicefile);
    title = t("zfsPool.todo.healthTitle");
    body = (
      <p className="max-w-prose">
        <Trans
          i18nKey="zfsPool.todo.healthBody"
          values={{ model: n.model }}
          components={{
            device: n.device,
            serial: n.serial,
            reason:
              reading === undefined ? (
                <span />
              ) : (
                <DiskReason overallstatus={reading.overallstatus} />
              ),
          }}
        />
      </p>
    );
    actions = (
      <>
        {replaceButton(warned)}
        {disk === undefined ? null : (
          <Link
            to="/storage/disks/$disk"
            params={{ disk: disk.devicename }}
            className={routerLinkClass}
          >
            {t("zfsPool.todo.openDisk", { device: disk.canonicaldevicefile })}
          </Link>
        )}
      </>
    );
  }

  const clear = async () => {
    setPhase({ kind: "confirm", rechecking: true });
    try {
      const rows = await api.list();
      if (findPool(rows, pool) === undefined) {
        setPhase({ kind: "confirm" });
        setError(new Error("gone"));
        return;
      }
      setPhase({ kind: "confirm", running: true });
      await api.clear(pool);
      setClearing(false);
      onChanged();
    } catch (cause) {
      setPhase({ kind: "confirm" });
      setError(cause);
    }
  };

  if (title === null) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle level={3}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {body}
        {actions === null ? null : (
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        )}
      </CardContent>
      <CheckedDialog
        open={clearing}
        onClose={() => setClearing(false)}
        phase={phase}
        checkingTitle=""
        checkingLabel=""
        title={t("zfsClear.title", { pool })}
        description={t("zfsClear.body")}
        confirmLabel={t("zfsClear.confirm")}
        recheckingLabel={t("zfsDevice.checkingAgain")}
        runningLabel={t("zfsClear.running")}
        cancelLabel={t("zfsDevice.cancel")}
        closeLabel={t("zfsDevice.close")}
        error={
          error === null ? undefined : (
            <>
              <p className="text-critical-label">{t("zfsDevice.failed")}</p>
              {isRpcError(error) ? (
                <ServerMessage label={t("app.serverMessage")}>
                  {error.message}
                </ServerMessage>
              ) : null}
            </>
          )
        }
        onConfirm={() => void clear()}
        openerRef={openerRef}
      />
    </Card>
  );
}
