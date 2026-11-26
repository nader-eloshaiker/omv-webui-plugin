// SPDX-License-Identifier: GPL-3.0-or-later
// What needs the person (rethink 6.2 B), as the library's attention rows: the rules stay in
// dashboard/dashboard.ts (`attentionRows`), and this maps each row to its status, title, one line and
// next step. The next step goes to a route of this interface, or to a fixed page of the classic
// interface in a new tab (UI-3), named by where it goes. Server names are text (UI-2).
//
// A needed restart is a Warning, not pending gold: the band's Apply cannot fix it. One row stands for
// every service that is on but not running, because the fix is the same. A disk row says when it was
// read, since disk readings do not update by themselves. A clock difference is advice with no health
// to report, so it is Unknown.
import type { AttentionItem } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { ExternalLink as ExternalIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { IdentifierText } from "../components/atoms/IdentifierText.tsx";
import { AttentionTitle } from "../components/molecules/AttentionTitle.tsx";
import { isCoreService, type AttentionRow } from "../dashboard/dashboard.ts";
import { isDiskName } from "../disks/diskWords.ts";
import { isolate } from "../format/isolate.ts";
import { useFormat } from "../format/useFormat.ts";
import { CLASSIC, CLASSIC_HOME } from "../navigation/navigation.ts";
import { isPoolAddress } from "../zfs/zfsModel.ts";
import { useFileSystemNameText } from "./useFileSystemNameText.ts";

const SERVICE_SETTINGS = {
  samba: CLASSIC.smbSettings,
  nfs: CLASSIC.nfsSettings,
  rsyncd: CLASSIC.rsyncServerSettings,
} as const;

const ZFS_BODY = {
  degraded: "dashboard.attention.zfsDegraded",
  unusable: "dashboard.attention.zfsUnusable",
  damaged: "dashboard.attention.zfsDamaged",
} as const;

/** Where a row's next step goes: a route of this interface, or a fixed classic page in a new tab. */
type Next =
  | { kind: "route"; link: ReactElement; words: ReactNode }
  | { kind: "classic"; href: string; words: ReactNode };

interface Parts {
  health: AttentionItem["health"];
  body: ReactNode;
  next: Next;
}

export function useAttentionItems(
  rows: readonly AttentionRow[],
): AttentionItem[] {
  const { t } = useTranslation();
  const format = useFormat();
  const nameText = useFileSystemNameText();

  const fsNext = (row: {
    name: Parameters<typeof nameText>[0];
    address: string | null;
  }): Next =>
    row.address === null
      ? {
          kind: "route",
          link: <Link to="/storage/filesystems" />,
          words: t("dashboard.storage.link"),
        }
      : {
          kind: "route",
          link: (
            <Link to="/storage/filesystems/$fs" params={{ fs: row.address }} />
          ),
          words: t("dashboard.storage.openFs", { name: nameText(row.name) }),
        };

  const serviceNext = (
    row: Extract<AttentionRow, { kind: "servicesDown" }>,
  ): Next => {
    const [only] = row.services;
    const one = row.services.length === 1 && only !== undefined;
    if (one && only.name === "ssh") {
      return {
        kind: "route",
        link: <Link to="/services/ssh" />,
        words: t("dashboard.attention.serviceLink.ssh"),
      };
    }
    if (one && only.name === "nfs") {
      return {
        kind: "route",
        link: <Link to="/services/nfs" />,
        words: t("dashboard.attention.serviceLink.nfs"),
      };
    }
    if (one && only.name === "rsyncd") {
      return {
        kind: "route",
        link: <Link to="/services/rsync/server" />,
        words: t("dashboard.attention.serviceLink.rsyncd"),
      };
    }
    if (one && only.name === "samba" && isCoreService(only.name)) {
      return {
        kind: "classic",
        href: SERVICE_SETTINGS.samba,
        words: t("dashboard.attention.serviceLink.samba"),
      };
    }
    return {
      kind: "route",
      link: <Link to="/diagnostics/system-logs" />,
      words: t("dashboard.attention.serviceLogs"),
    };
  };

  const partsOf = (row: AttentionRow): Parts => {
    switch (row.kind) {
      case "fsFull":
        return {
          health: "critical",
          body: t("dashboard.attention.fsFull"),
          next: fsNext(row),
        };
      case "fsMissing":
        return {
          health: "critical",
          body: t("dashboard.attention.fsMissing"),
          next: fsNext(row),
        };
      case "fsWarning":
        return {
          health: "warning",
          body: t("dashboard.attention.fsWarning", {
            percent: format.percent(row.percent),
            threshold: `${String(row.threshold)}%`,
          }),
          next: fsNext(row),
        };
      case "zfsPool":
        return {
          health: "critical",
          body: t(ZFS_BODY[row.health]),
          next: isPoolAddress(row.pool)
            ? {
                kind: "route",
                link: (
                  <Link
                    to="/storage/zfs/pools/$pool"
                    params={{ pool: row.pool }}
                  />
                ),
                words: t("dashboard.attention.zfsLink", { pool: row.pool }),
              }
            : {
                kind: "classic",
                href: CLASSIC.zfs,
                words: t("zfs.classicLink"),
              },
        };
      case "diskCritical":
      case "diskWarning": {
        const model = row.model.trim();
        const reason = t(`diskHealth.reason.${row.reason}`);
        return {
          health: row.kind === "diskCritical" ? "critical" : "warning",
          body: (
            <>
              {model === ""
                ? reason
                : t("dashboard.attention.diskBody", {
                    reason,
                    model: isolate(model),
                  })}
              {row.monitored ? null : (
                <> {t("dashboard.attention.diskUnmonitored")}</>
              )}{" "}
              {t("dashboard.attention.diskReadAt", {
                time: format.clock(row.readAt),
              })}
            </>
          ),
          next: isDiskName(row.devicename)
            ? {
                kind: "route",
                link: (
                  <Link
                    to="/storage/disks/$disk"
                    params={{ disk: row.devicename }}
                  />
                ),
                words: (
                  <Trans
                    i18nKey="dashboard.attention.diskLink"
                    components={{
                      device: <IdentifierText value={row.device} />,
                    }}
                  />
                ),
              }
            : {
                kind: "route",
                link: <Link to="/storage/smart/overview" />,
                words: t("dashboard.disks.link"),
              },
        };
      }
      case "servicesDown": {
        const [only] = row.services;
        const one = row.services.length === 1 && only !== undefined;
        const list = new Intl.ListFormat(undefined, {
          type: "conjunction",
        }).format(row.services.map((s) => s.title));
        return {
          health: "critical",
          body: one
            ? t("dashboard.attention.serviceDown", { count: 1 })
            : t("dashboard.attention.serviceDown", {
                count: row.services.length,
                list,
              }),
          next: serviceNext(row),
        };
      }
      case "restart":
        return {
          health: "warning",
          body: t("dashboard.attention.restart"),
          next: {
            kind: "classic",
            href: CLASSIC_HOME,
            words: t("dashboard.attention.restartLink"),
          },
        };
      case "clock":
        return {
          health: "unknown",
          body: t("dashboard.attention.clock"),
          next: {
            kind: "classic",
            href: CLASSIC.dateTime,
            words: t("dashboard.attention.clockLink"),
          },
        };
    }
  };

  return rows.map((row): AttentionItem => {
    const { health, body, next } = partsOf(row);
    const external = next.kind === "classic";
    return {
      id: row.key,
      health,
      healthLabel:
        health === "unknown"
          ? t("dashboard.needs.unknown")
          : t(`health.${health}`),
      title: <AttentionTitle row={row} />,
      detail: body,
      actionLabel: external ? (
        <>
          {next.words}
          <ExternalIcon aria-hidden="true" />
          <span className="sr-only"> {t("app.newTab")}</span>
        </>
      ) : (
        next.words
      ),
      render: external ? (
        <a href={next.href} target="_blank" rel="noopener noreferrer" />
      ) : (
        next.link
      ),
    };
  });
}
