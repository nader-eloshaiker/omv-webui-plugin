// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > RAID (phase 5 RAID design 1), for administrators with the RAID plugin installed: are my
// arrays healthy, is one short of a disk, and is one busy? The arrays and their reports are read when
// the page opens, on Refresh and after an action; only while an array is synchronising, rebuilding,
// reshaping or being checked are they read again every 30 seconds, in the background (P9). Unfinished
// work from this session (R8) is offered as its next step. A normal user gets the "only
// administrators" page, and nothing is called first (UI-4).
import { useEmailNotificationGet } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  buttonClass,
  ExternalLink,
  InlineAlert,
  rollUp,
  ServerMessage,
  StatusPill,
  TableToolbar,
} from "@omv-webui/react-ui-components";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { emailSetUp } from "../../disks/smartSettingsForm.ts";
import { handOffDisk } from "../../filesystems/fsSession.ts";
import { useFormat } from "../../format/useFormat.ts";
import { ON_OPEN, useDiskList } from "../../hooks/useDiskReads.ts";
import { useRaidList } from "../../hooks/useRaidView.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { worse } from "../../raid/raidModel.ts";
import { forgetChanged, raidSession } from "../../raid/raidSession.ts";
import { useSession } from "../../session/sessionContext.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { RaidNotInstalled } from "../molecules/RaidNotInstalled.tsx";
import { RaidTable } from "../organisms/RaidTable.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function RaidPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("raid.title")} />;
  }
  return <Raid />;
}

/** "Read at …", or after a failed poll "Could not update since …" with Try again (1.7). */
export function ReadAtLine({
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
          <span>{t("raid.pollFailed", { time: format.clock(at) })}</span>
          <Button variant="neutral" size="sm" onClick={onRetry}>
            {t("common.tryAgain")}
          </Button>
        </p>
      ) : (
        <p>{t("raid.readAt", { time: format.clock(at) })}</p>
      )}
      {polling ? <p>{t("raid.polling")}</p> : null}
    </div>
  );
}

function Raid() {
  const { t } = useTranslation();
  const format = useFormat();
  const navigate = useNavigate();
  const list = useRaidList();
  const disks = useDiskList();
  const email = useEmailNotificationGet({
    query: { ...ON_OPEN, retry: false },
  });
  const info = useSystemInformation("admin");
  const memory = useMemoryStore(raidSession);
  const [refreshing, setRefreshing] = useState(false);
  const [readAt, setReadAt] = useState<string>("");

  const pending = pendingModules(info.data?.dirtyModules);
  const mdadmPending = pending.includes("mdadm");
  const written = info.data !== undefined && !mdadmPending;
  useEffect(() => {
    // The arrays are written down: this session's marks are forgotten (0.8).
    if (written) {
      forgetChanged();
    }
  }, [written]);

  if (list.missing) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <PageTitle>{t("raid.title")}</PageTitle>
        <RaidNotInstalled />
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
        list.arrays.refetch(),
        list.configured.refetch(),
        list.detected.refetch(),
        disks.refetch(),
      ]);
    } finally {
      setRefreshing(false);
      setReadAt(t("raid.readAt", { time: format.clock(Date.now()) }));
    }
  };

  const views = list.views;
  const statuses = (views ?? []).map((v) => v.state.status);
  const summary = rollUp(statuses);
  const worst = statuses.reduce(worse, "ok");
  const showRollUp = views !== undefined && worst !== "ok";

  // 1.6: what this session started and did not finish.
  const noFs = (views ?? []).filter(
    (v) =>
      memory.created.some((c) => c.forFiles && c.uuid === v.row.uuid) &&
      v.used.kind === "known" &&
      v.used.configured.length === 0 &&
      !v.used.creating &&
      !v.used.other,
  );
  const notWritten = mdadmPending
    ? (views ?? []).filter((v) => memory.changed.includes(v.row.devicefile))
    : [];

  const pollFailed =
    list.arrays.data !== undefined &&
    (list.arrays.isError || list.poll.isError);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageTitle>{t("raid.title")}</PageTitle>
      <p className="max-w-prose">{t("raid.intro")}</p>

      {showRollUp ? (
        <p role="status" className="flex flex-wrap items-center gap-2">
          <StatusPill status={worst}>{t(`health.${worst}`)}</StatusPill>
          <span>
            {t("raid.rollUp", {
              // The plural follows the number of arrays: "1 of 3 arrays".
              count: summary.total,
              number: statuses.filter((s) => s === worst).length,
              status: t(`health.${worst}`),
            })}
          </span>
        </p>
      ) : null}

      {noFs.map((v) => (
        <InlineAlert key={`nofs:${v.row.uuid}`} tone="neutral">
          <p>{t("raid.unfinished.noFs", { device: v.row.devicefile })}</p>
          <p className="mt-2">
            <Button
              variant="neutral"
              size="sm"
              onClick={() => {
                handOffDisk(v.row.devicefile);
                void navigate({ to: "/storage/filesystems/add" });
              }}
            >
              {t("raid.unfinished.addStorage")}
            </Button>
          </p>
        </InlineAlert>
      ))}
      {notWritten.map((v) => (
        <InlineAlert key={`nw:${v.row.uuid}`} tone="neutral">
          <p>{t("raid.unfinished.notWritten", { device: v.row.devicefile })}</p>
        </InlineAlert>
      ))}

      <TableToolbar className="pb-0">
        <Link
          to="/storage/md/create"
          className={buttonClass({ variant: "primary" })}
        >
          {t("raid.create")}
        </Link>
        <Button
          variant="neutral"
          loading={refreshing}
          onClick={refreshing ? undefined : () => void refresh()}
        >
          {refreshing ? t("raid.refreshing") : t("raid.refresh")}
        </Button>
        <div className="ms-auto">
          <ReadAtLine
            at={list.arrays.dataUpdatedAt}
            pollFailed={pollFailed}
            polling={list.anyBusy}
            onRetry={() => void refresh()}
          />
        </div>
      </TableToolbar>
      <p role="status" className="sr-only">
        {readAt}
      </p>

      {list.usedFailed && views !== undefined ? (
        <InlineAlert tone="critical" title={t("raid.usedUnknown")}>
          {[list.configured.error, list.detected.error].map((error) =>
            isRpcError(error) ? (
              <ServerMessage key={error.message} label={t("app.serverMessage")}>
                {error.message}
              </ServerMessage>
            ) : null,
          )}
          <p>
            <Button variant="neutral" size="sm" onClick={() => void refresh()}>
              {t("common.tryAgain")}
            </Button>
          </p>
        </InlineAlert>
      ) : null}

      <RaidTable
        rows={views}
        disks={disks.data?.data}
        error={list.arrays.error}
        failed={list.arrays.isError}
        refreshing={refreshing}
        onRetry={() => void refresh()}
      />

      {email.data === undefined ? null : (
        <p className="max-w-prose text-sm">
          {emailSetUp(email.data) ? t("raid.alerts.on") : t("raid.alerts.off")}{" "}
          <ExternalLink
            href={
              emailSetUp(email.data)
                ? CLASSIC.notificationEvents
                : CLASSIC.notifications
            }
            newTabLabel={t("app.newTab")}
          >
            {emailSetUp(email.data)
              ? t("raid.alerts.onLink")
              : t("raid.alerts.offLink")}
          </ExternalLink>
        </p>
      )}

      <div className="flex flex-col gap-1 text-sm">
        <p className="text-muted-foreground">{t("raid.footerLine")}</p>
        <p>
          <ExternalLink href={CLASSIC.raid} newTabLabel={t("app.newTab")}>
            {t("raid.classicLink")}
          </ExternalLink>
        </p>
      </div>
    </div>
  );
}
