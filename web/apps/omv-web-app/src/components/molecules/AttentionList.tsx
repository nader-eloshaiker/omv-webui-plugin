// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's attention list (phase 3 design 1.4, phase 5 design 1.7), worst first, then in a fixed
// order of kinds, shown only when it has rows. Each row is a pill (or the clock icon for advice), one
// sentence and one action: a fixed classic page (UI-3), or a route in this interface. A needed restart
// is a Warning, not pending gold: the band's Apply cannot fix it. One row stands for every service
// that is on but not running, because the fix is the same. Disk rows say when they were read, since
// disk readings do not update by themselves.
import { Card, ExternalLink, StatusPill } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { Fragment, useId, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { isCoreService, type AttentionRow } from "../../dashboard/dashboard.ts";
import { isDiskName } from "../../disks/diskWords.ts";
import { isolate } from "../../format/isolate.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useFileSystemNameText } from "../../hooks/useFileSystemNameText.ts";
import { CLASSIC, CLASSIC_HOME } from "../../navigation/navigation.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { isPoolAddress } from "../../zfs/zfsModel.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

const SERVICE_SETTINGS = {
  samba: CLASSIC.smbSettings,
  nfs: CLASSIC.nfsSettings,
  rsyncd: CLASSIC.rsyncServerSettings,
} as const;

function Row({
  mark,
  sentence,
  action,
}: {
  mark: ReactNode;
  sentence: ReactNode;
  action: ReactNode;
}) {
  return (
    <Card
      render={<li />}
      className="flex-row flex-wrap items-start gap-x-3 gap-y-2 p-4"
    >
      {mark}
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
        <p>{sentence}</p>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {action}
        </p>
      </div>
    </Card>
  );
}

export function AttentionList({ rows }: { rows: readonly AttentionRow[] }) {
  const { t } = useTranslation();
  const format = useFormat();
  const nameText = useFileSystemNameText();
  const labelId = useId();
  if (rows.length === 0) {
    return null;
  }
  const newTab = t("app.newTab");
  const critical = (
    <StatusPill status="critical" className="shrink-0">
      {t("dashboard.attention.critical")}
    </StatusPill>
  );
  const warning = (
    <StatusPill status="warning" className="shrink-0">
      {t("dashboard.attention.warning")}
    </StatusPill>
  );
  // The file system's page when it has one, else the File systems list (file-systems design 9).
  const fsLink = (row: {
    name: Parameters<typeof nameText>[0];
    address: string | null;
  }) =>
    row.address === null ? (
      <Link to="/storage/filesystems" className={routerLinkClass}>
        {t("dashboard.storage.link")}
      </Link>
    ) : (
      <Link
        to="/storage/filesystems/$fs"
        params={{ fs: row.address }}
        className={routerLinkClass}
      >
        {t("dashboard.storage.openFs", { name: nameText(row.name) })}
      </Link>
    );

  const render = (row: AttentionRow) => {
    switch (row.kind) {
      case "fsFull":
        return (
          <Row
            mark={critical}
            sentence={t("dashboard.attention.fsFull", {
              name: nameText(row.name),
            })}
            action={fsLink(row)}
          />
        );
      case "fsMissing":
        return (
          <Row
            mark={critical}
            sentence={t("dashboard.attention.fsMissing", {
              name: nameText(row.name),
            })}
            action={fsLink(row)}
          />
        );
      case "fsWarning":
        return (
          <Row
            mark={warning}
            sentence={t("dashboard.attention.fsWarning", {
              name: nameText(row.name),
              percent: format.percent(row.percent),
              threshold: `${String(row.threshold)}%`,
            })}
            action={fsLink(row)}
          />
        );
      case "diskCritical":
      case "diskWarning": {
        const model = row.model.trim();
        const key =
          row.kind === "diskCritical"
            ? model === ""
              ? "dashboard.attention.diskCriticalNoModel"
              : "dashboard.attention.diskCritical"
            : model === ""
              ? "dashboard.attention.diskWarningNoModel"
              : "dashboard.attention.diskWarning";
        return (
          <Row
            mark={row.kind === "diskCritical" ? critical : warning}
            sentence={
              <>
                <Trans
                  i18nKey={key}
                  values={{
                    model: isolate(model),
                    reason: t(`diskHealth.reason.${row.reason}`),
                  }}
                  components={{ device: <IdentifierText value={row.device} /> }}
                />
                {row.monitored ? null : (
                  <> {t("dashboard.attention.diskUnmonitored")}</>
                )}
              </>
            }
            action={
              <>
                {isDiskName(row.devicename) ? (
                  <Link
                    to="/storage/disks/$disk"
                    params={{ disk: row.devicename }}
                    className={routerLinkClass}
                  >
                    <Trans
                      i18nKey="dashboard.attention.diskLink"
                      components={{
                        device: <IdentifierText value={row.device} />,
                      }}
                    />
                  </Link>
                ) : (
                  <Link
                    to="/storage/smart/overview"
                    className={routerLinkClass}
                  >
                    {t("dashboard.disks.link")}
                  </Link>
                )}
                <span className="text-sm text-muted-foreground tabular-nums">
                  {t("dashboard.attention.diskReadAt", {
                    time: format.clock(row.readAt),
                  })}
                </span>
              </>
            }
          />
        );
      }
      case "servicesDown": {
        const [only] = row.services;
        const one = row.services.length === 1 && only !== undefined;
        let action;
        if (one && only.name === "ssh") {
          action = (
            <Link to="/services/ssh" className={routerLinkClass}>
              {t("dashboard.attention.serviceLink.ssh")}
            </Link>
          );
        } else if (one && only.name === "nfs") {
          // Linux and Unix sharing has its page here now (services design 12.2).
          action = (
            <Link to="/services/nfs" className={routerLinkClass}>
              {t("dashboard.attention.serviceLink.nfs")}
            </Link>
          );
        } else if (one && only.name === "rsyncd") {
          // The rsync server has its tab here now (services design 12.2).
          action = (
            <Link to="/services/rsync/server" className={routerLinkClass}>
              {t("dashboard.attention.serviceLink.rsyncd")}
            </Link>
          );
        } else if (one && isCoreService(only.name) && only.name !== "ssh") {
          action = (
            <ExternalLink
              href={SERVICE_SETTINGS[only.name]}
              newTabLabel={newTab}
            >
              {t(`dashboard.attention.serviceLink.${only.name}`)}
            </ExternalLink>
          );
        } else {
          action = (
            <Link to="/diagnostics/system-logs" className={routerLinkClass}>
              {t("dashboard.attention.serviceLogs")}
            </Link>
          );
        }
        const list = new Intl.ListFormat(undefined, {
          type: "conjunction",
        }).format(row.services.map((s) => s.title));
        return (
          <Row
            mark={critical}
            sentence={
              one
                ? t("dashboard.attention.serviceDown", {
                    count: 1,
                    title: only.title,
                  })
                : t("dashboard.attention.serviceDown", {
                    count: row.services.length,
                    list,
                  })
            }
            action={action}
          />
        );
      }
      case "zfsPool":
        return (
          <Row
            mark={critical}
            sentence={
              <Trans
                i18nKey={
                  row.health === "degraded"
                    ? "dashboard.attention.zfsDegraded"
                    : row.health === "unusable"
                      ? "dashboard.attention.zfsUnusable"
                      : "dashboard.attention.zfsDamaged"
                }
                components={{ pool: <IdentifierText value={row.pool} /> }}
              />
            }
            action={
              isPoolAddress(row.pool) ? (
                <Link
                  to="/storage/zfs/pools/$pool"
                  params={{ pool: row.pool }}
                  className={routerLinkClass}
                >
                  {t("dashboard.attention.zfsLink", { pool: row.pool })}
                </Link>
              ) : (
                <ExternalLink href={CLASSIC.zfs} newTabLabel={newTab}>
                  {t("zfs.classicLink")}
                </ExternalLink>
              )
            }
          />
        );
      case "restart":
        return (
          <Row
            mark={warning}
            sentence={t("dashboard.attention.restart")}
            action={
              <ExternalLink href={CLASSIC_HOME} newTabLabel={newTab}>
                {t("dashboard.attention.restartLink")}
              </ExternalLink>
            }
          />
        );
      case "clock":
        return (
          <Row
            mark={
              <Clock
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
            }
            sentence={t("dashboard.attention.clock", {
              duration: format.duration(row.seconds),
            })}
            action={
              <ExternalLink href={CLASSIC.dateTime} newTabLabel={newTab}>
                {t("dashboard.attention.clockLink")}
              </ExternalLink>
            }
          />
        );
    }
  };

  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-2">
      <h2 id={labelId} className="sr-only">
        {t("dashboard.attention.label")}
      </h2>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <Fragment key={row.key}>{render(row)}</Fragment>
        ))}
      </ul>
    </section>
  );
}
