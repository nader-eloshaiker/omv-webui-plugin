// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's Disk health card (phase 5 design 1.3). Nothing reads disk health on its own: not on
// page load, a timer, window focus or a reload (owner). Reading it wakes sleeping disks, so the card
// says so and waits for "Check disk health". The check is a task (Smart.getListBg) followed by the one
// registry; its result is kept in memory for the session (diskHealth.ts) and shows every disk the
// reply lists, monitored or not (D1). The one button keeps its place, so focus stays on it while it
// turns into "Checking…" and then "Check again". Its links lead to the Disk health pages and each
// disk's page (disks design 8).
import type { SmartDevice } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  EmptyState,
  HealthList,
  HealthListItem,
  HealthListSkeleton,
  InlineAlert,
  ServerMessage,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  diskState,
  diskTemperature,
  sortDisks,
} from "../../dashboard/dashboard.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import { useDiskRollUp } from "../../hooks/useDiskRollUp.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { DiskLink } from "../atoms/DiskLink.tsx";
import { DashboardCard } from "../molecules/DashboardCard.tsx";
import { DiskReason } from "../molecules/DiskHealthStatus.tsx";

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
  return (
    <HealthListItem
      status={state.status}
      statusLabel={t(`health.${state.status}`)}
      name={
        <DiskLink
          devicename={disk.devicename}
          device={disk.canonicaldevicefile}
        />
      }
      nameVariant="identifier"
      detail={detail === "" ? undefined : <span dir="auto">{detail}</span>}
      reason={
        state.reason === null ? undefined : (
          <DiskReason overallstatus={disk.overallstatus} />
        )
      }
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
          <Link to="/storage/smart/set-up" className={routerLinkClass}>
            {t("dashboard.disks.monitorOffAllLink")}
          </Link>
        </p>
      </InlineAlert>
    );
  }
  return (
    <p className="text-sm">
      {t("dashboard.disks.monitorOffSome", { count: off, total: disks.length })}{" "}
      <Link to="/storage/smart/set-up" className={routerLinkClass}>
        {t("dashboard.disks.monitorOffSomeLink")}
      </Link>
    </p>
  );
}

export function DiskHealthCard() {
  const { t } = useTranslation();
  const format = useFormat();
  const check = useDiskCheck();
  const state = check.state;
  const summarise = useDiskRollUp();
  // A check that ends while the card is on screen is announced; one that ended before is not.
  const [openedAt] = useState(Date.now);

  const checking = state.runningId !== undefined;
  const result = state.result;
  const disks = result ? sortDisks(result.list.data) : undefined;
  const summary = disks ? summarise(disks) : null;

  const start = check.start;

  let announcement = "";
  if (checking) {
    announcement = t("diskCheck.checkingLine");
  } else if (result && result.readAt >= openedAt && !state.failed && summary) {
    announcement = t("diskCheck.announce", { summary: summary.text });
  }

  return (
    <DashboardCard
      title={t("dashboard.disks.title")}
      footer={
        <Link to="/storage/smart/overview" className={routerLinkClass}>
          {t("dashboard.disks.link")}
        </Link>
      }
    >
      {state.failed && !checking ? (
        <InlineAlert tone="critical" title={t("diskCheck.failed")}>
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
              ? t("diskCheck.checkingAgain", {
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
            ? t("diskCheck.checking")
            : result
              ? t("diskCheck.checkAgain")
              : state.failed
                ? t("common.tryAgain")
                : t("diskCheck.check")}
        </Button>
      </div>
    </DashboardCard>
  );
}
