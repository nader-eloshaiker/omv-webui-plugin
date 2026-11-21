// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's Disk health card (phase 5 design 1.3). Nothing reads disk health on its own: not on
// page load, a timer, window focus or a reload (owner). Reading it wakes sleeping disks, so the card
// says so and waits for "Check disk health". The check is a task (Smart.getListBg) followed by the one
// registry; its result is kept in memory for the session (diskHealth.ts) and shows every disk the
// reply lists, monitored or not (D1). The one button keeps its place, so focus stays on it while it
// turns into "Checking…" and then "Check again".
import type { SmartDevice } from "@omv-webui/react-api-omv/generated";
import { useSmartGetListBg } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  EmptyState,
  ExternalLink,
  HealthList,
  HealthListItem,
  HealthListSkeleton,
  InlineAlert,
  rollUp,
  ServerMessage,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  diskState,
  diskTemperature,
  sortDisks,
  type DiskState,
} from "../../dashboard/dashboard.ts";
import { diskHealth, startDiskCheck } from "../../dashboard/diskHealth.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { DashboardCard } from "../molecules/DashboardCard.tsx";

/** Every disk, in one request; the method takes the common list parameters (design 0.5). */
const ALL_DISKS = { start: 0, limit: null, sortfield: null, sortdir: null };

function DiskItem({ disk }: { disk: SmartDevice }) {
  const { t } = useTranslation();
  const format = useFormat();
  const state = diskState(disk.overallstatus);
  const size = parseByteCount(disk.size);
  const sizeText = size === null ? "" : formatBytes(size);
  const model = disk.model.trim();
  const temperature = diskTemperature(disk.temperature);
  const modelSize =
    model === ""
      ? sizeText
      : sizeText === ""
        ? model
        : t("dashboard.disks.modelSize", { model, size: sizeText });
  const detail = [
    modelSize,
    temperature === null ? "" : format.celsius(temperature),
  ]
    .filter((part) => part !== "")
    .join(" · ");
  let reason;
  if (state.reason === "other") {
    reason = (
      <Trans
        i18nKey="dashboard.disks.reason.other"
        components={{ code: <IdentifierText value={disk.overallstatus} /> }}
      />
    );
  } else if (state.reason !== null) {
    reason = t(`dashboard.disks.reason.${state.reason}`);
  }
  return (
    <HealthListItem
      status={state.status}
      statusLabel={t(`health.${state.status}`)}
      name={disk.canonicaldevicefile}
      nameVariant="identifier"
      detail={detail === "" ? undefined : <span dir="auto">{detail}</span>}
      reason={reason}
      note={disk.monitor ? undefined : t("dashboard.disks.monitorOff")}
    />
  );
}

function MonitoringAdvice({ disks }: { disks: readonly SmartDevice[] }) {
  const { t } = useTranslation();
  const off = disks.filter((d) => !d.monitor).length;
  if (off === 0) {
    return null;
  }
  if (off === disks.length) {
    return (
      <InlineAlert tone="neutral" role="note">
        <p>{t("dashboard.disks.monitorOffAll")}</p>
        <p>
          <ExternalLink
            href={CLASSIC.smartSettings}
            newTabLabel={t("app.newTab")}
          >
            {t("dashboard.disks.monitorOffAllLink")}
          </ExternalLink>
        </p>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.disks.monitorOffAllHint")}
        </p>
      </InlineAlert>
    );
  }
  return (
    <p className="text-sm">
      {t("dashboard.disks.monitorOffSome", { count: off, total: disks.length })}{" "}
      <ExternalLink href={CLASSIC.smartDevices} newTabLabel={t("app.newTab")}>
        {t("dashboard.disks.monitorOffSomeLink")}
      </ExternalLink>
    </p>
  );
}

/** "1 of 5 disks: Critical", or "5 disks: OK". */
function useDiskSummary() {
  const { t } = useTranslation();
  return (
    disks: readonly SmartDevice[],
  ): { status: DiskState["status"]; text: string } | null => {
    const statuses = disks.map((d) => diskState(d.overallstatus).status);
    const summary = rollUp(statuses);
    // The worst is one of the disks' own states.
    const status = statuses.find((s) => s === summary.status);
    if (status === undefined) {
      return null;
    }
    const text =
      status === "ok"
        ? t("dashboard.disks.allOk", { count: summary.total })
        : t("dashboard.disks.rollUp", {
            count: summary.count,
            total: summary.total,
            status: t(`health.${status}`),
          });
    return { status, text };
  };
}

export function DiskHealthCard() {
  const { t } = useTranslation();
  const format = useFormat();
  const state = useMemoryStore(diskHealth);
  const check = useSmartGetListBg();
  const summarise = useDiskSummary();
  // A check that ends while the card is on screen is announced; one that ended before is not.
  const [openedAt] = useState(Date.now);

  const checking = state.runningId !== undefined;
  const result = state.result;
  const disks = result ? sortDisks(result.list.data) : undefined;
  const summary = disks ? summarise(disks) : null;

  const start = () => {
    startDiskCheck(t("dashboard.disks.taskLabel"), () =>
      check.mutateAsync({ data: ALL_DISKS }),
    );
  };

  let announcement = "";
  if (checking) {
    announcement = t("dashboard.disks.checkingLine");
  } else if (result && result.readAt >= openedAt && !state.failed && summary) {
    announcement = t("dashboard.disks.announce", { summary: summary.text });
  }

  return (
    <DashboardCard
      title={t("dashboard.disks.title")}
      footer={
        <ExternalLink href={CLASSIC.smartDevices} newTabLabel={t("app.newTab")}>
          {t("dashboard.disks.link")}
        </ExternalLink>
      }
    >
      {state.failed && !checking ? (
        <InlineAlert tone="critical" title={t("dashboard.disks.failed")}>
          {isRpcError(state.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {state.error.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}

      {disks === undefined ? (
        <p className="max-w-prose">{t("dashboard.disks.intro")}</p>
      ) : disks.length === 0 ? (
        <EmptyState className="py-4">{t("dashboard.disks.empty")}</EmptyState>
      ) : (
        <>
          {summary ? (
            <p className="flex flex-wrap items-center gap-2">
              <StatusPill status={summary.status}>
                {t(`health.${summary.status}`)}
              </StatusPill>
              <span>{summary.text}</span>
            </p>
          ) : null}
          <MonitoringAdvice disks={disks} />
          <HealthList aria-label={t("dashboard.disks.listLabel")}>
            {disks.map((disk) => (
              <DiskItem key={disk.canonicaldevicefile} disk={disk} />
            ))}
          </HealthList>
        </>
      )}

      {checking && disks === undefined ? <HealthListSkeleton rows={2} /> : null}

      <p role="status" className="text-sm empty:hidden">
        {announcement}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {result ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {checking
              ? t("dashboard.disks.checkingAgain", {
                  time: format.clock(result.readAt),
                })
              : t("dashboard.disks.checkedAt", {
                  time: format.clock(result.readAt),
                })}
          </p>
        ) : null}
        <Button
          variant="neutral"
          size={result ? "sm" : "md"}
          loading={checking}
          onClick={checking ? undefined : start}
        >
          {checking
            ? t("dashboard.disks.checking")
            : result
              ? t("dashboard.disks.checkAgain")
              : state.failed
                ? t("common.tryAgain")
                : t("dashboard.disks.check")}
        </Button>
      </div>
    </DashboardCard>
  );
}
