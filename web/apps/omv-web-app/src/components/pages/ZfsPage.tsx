// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > ZFS (phase 5 ZFS design 1), for administrators with the ZFS plugin installed: are my pools
// healthy, is any of them short of a disk or nearly full, and when was each last checked? The pools and
// their reports are read when the page opens, on Refresh and after an action; only while a pool is
// being checked or rebuilt are they read again every 30 seconds, in the background (P13). Unfinished
// work from this session (R8) is offered as its next step. A normal user gets the "only
// administrators" page, and nothing is called first (UI-4).
import { useEmailNotificationGet } from "@omv-webui/react-api-omv/generated";
import {
  Button,
  buttonClass,
  ExternalLink,
  InlineAlert,
  rollUp,
  StatusPill,
  TableToolbar,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { emailSetUp } from "../../disks/smartSettingsForm.ts";
import { useFormat } from "../../format/useFormat.ts";
import { ON_OPEN } from "../../hooks/useDiskReads.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { useZfsListView } from "../../hooks/useZfsView.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { onPool, worse, type Status } from "../../zfs/zfsModel.ts";
import { zfsPending } from "../../zfs/zfsRun.ts";
import { zfsSession } from "../../zfs/zfsSession.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { ZfsNotInstalled } from "../molecules/ZfsNotInstalled.tsx";
import { ZfsPoolsTable } from "../organisms/ZfsPoolsTable.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function ZfsPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("zfs.title")} />;
  }
  return <Zfs />;
}

/** "Read at …", or after a failed poll "Could not update since …" with Try again (1.7). */
export function ZfsReadAt({
  at,
  pollFailed,
  polling,
  onRetry,
}: {
  at: number;
  pollFailed: boolean;
  polling: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  if (at === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground tabular-nums">
      {pollFailed ? (
        <p className="flex flex-wrap items-center gap-2">
          <span>{t("zfs.pollFailed", { time: format.clock(at) })}</span>
          <Button variant="neutral" size="sm" onClick={onRetry}>
            {t("common.tryAgain")}
          </Button>
        </p>
      ) : (
        <p>{t("zfs.readAt", { time: format.clock(at) })}</p>
      )}
      {polling ? <p>{t("zfs.polling")}</p> : null}
    </div>
  );
}

function Zfs() {
  const { t } = useTranslation();
  const format = useFormat();
  const list = useZfsListView();
  const email = useEmailNotificationGet({
    query: { ...ON_OPEN, retry: false },
  });
  const info = useSystemInformation();
  const memory = useMemoryStore(zfsSession);
  const [refreshing, setRefreshing] = useState(false);
  const [readAt, setReadAt] = useState("");

  const pending = pendingModules(info.data?.dirtyModules);
  const stillPending = zfsPending(pending);

  if (list.missing) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <PageTitle>{t("zfs.title")}</PageTitle>
        <ZfsNotInstalled />
      </div>
    );
  }

  const refresh = async () => {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      await Promise.allSettled([
        list.list.refetch(),
        ...list.reports.map((r) => r.refetch()),
      ]);
    } finally {
      setRefreshing(false);
      setReadAt(t("zfs.readAt", { time: format.clock(Date.now()) }));
    }
  };

  const views = list.views;
  const rows = list.list.data?.data;
  const statuses: Status[] = (views ?? []).map((v) => v.status);
  const summary = rollUp(statuses);
  const worst = statuses.reduce(worse, "ok");
  const showRollUp = views !== undefined && worst !== "ok";

  // 1.6: what this session started and did not finish.
  const noFs = (views ?? []).filter(
    (v) =>
      memory.created.some((c) => c.withFs && c.pool === v.row.path) &&
      rows !== undefined &&
      onPool(rows, v.row.path).every((r) => r.poolroot === true),
  );
  const notSaved = stillPending
    ? (views ?? []).filter((v) => memory.touched.includes(v.row.path))
    : [];
  const pollFailed =
    list.list.data !== undefined && (list.list.isError || list.poll.isError);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageTitle>{t("zfs.title")}</PageTitle>
      <p className="max-w-prose">{t("zfs.intro")}</p>

      {showRollUp ? (
        <p role="status" className="flex flex-wrap items-center gap-2">
          <StatusPill status={worst}>{t(`health.${worst}`)}</StatusPill>
          <span>
            {t("zfs.rollUp", {
              count: summary.total,
              number: statuses.filter((s) => s === worst).length,
              status: t(`health.${worst}`),
            })}
          </span>
        </p>
      ) : null}

      {noFs.map((v) => (
        <InlineAlert key={`nofs:${v.row.path}`} tone="neutral">
          <p>
            <Trans
              i18nKey="zfs.unfinished.noFs"
              components={{ pool: <IdentifierText value={v.row.path} /> }}
            />
          </p>
          <p className="mt-2">
            <Link
              to="/storage/zfs/pools/$pool/add"
              params={{ pool: v.row.path }}
              className={routerLinkClass}
            >
              {t("zfs.unfinished.addFs")}
            </Link>
          </p>
        </InlineAlert>
      ))}
      {notSaved.map((v) => (
        <InlineAlert key={`ns:${v.row.path}`} tone="neutral">
          <p>
            <Trans
              i18nKey="zfs.unfinished.notSaved"
              components={{ pool: <IdentifierText value={v.row.path} /> }}
            />
          </p>
        </InlineAlert>
      ))}

      <TableToolbar className="pb-0">
        <Link
          to="/storage/zfs/create"
          className={buttonClass({ variant: "primary" })}
        >
          {t("zfs.create")}
        </Link>
        <Button
          variant="neutral"
          loading={refreshing}
          onClick={refreshing ? undefined : () => void refresh()}
        >
          {refreshing ? t("zfs.refreshing") : t("zfs.refresh")}
        </Button>
        <div className="ms-auto">
          <ZfsReadAt
            at={list.list.dataUpdatedAt}
            pollFailed={pollFailed}
            polling={list.anyBusy}
            onRetry={() => void refresh()}
          />
        </div>
      </TableToolbar>
      <p role="status" className="sr-only">
        {readAt}
      </p>

      <ZfsPoolsTable
        views={views}
        rows={rows}
        error={list.list.error}
        failed={list.list.isError}
        refreshing={refreshing}
        onRetry={() => void refresh()}
      />

      {email.data === undefined ? null : (
        <p className="max-w-prose text-sm">
          {emailSetUp(email.data) ? t("zfs.alerts.on") : t("zfs.alerts.off")}{" "}
          <ExternalLink
            href={
              emailSetUp(email.data)
                ? CLASSIC.notificationEvents
                : CLASSIC.notifications
            }
            newTabLabel={t("app.newTab")}
          >
            {emailSetUp(email.data)
              ? t("zfs.alerts.onLink")
              : t("zfs.alerts.offLink")}
          </ExternalLink>
        </p>
      )}

      <div className="flex flex-col gap-1 text-sm">
        <p className="text-muted-foreground">{t("zfs.footerLine")}</p>
        <p>
          <ExternalLink href={CLASSIC.zfs} newTabLabel={t("app.newTab")}>
            {t("zfs.classicLink")}
          </ExternalLink>
        </p>
      </div>
    </div>
  );
}
