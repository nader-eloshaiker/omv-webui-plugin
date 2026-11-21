// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's "Usage" card (phase 3 design 1.3): how busy the NAS is. No thresholds are configured
// for these figures, so the meters stay the usage blue and carry no pill (style guide 5.6). The
// figures are not a live region: a reader would hear the processor figure on every poll.
import type { SystemInformation } from "@omv-webui/react-api-omv/generated";
import {
  CapacityMeter,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { memoryUsage, type UsageSample } from "../../dashboard/dashboard.ts";
import { formatBytes } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { UsageChart } from "./UsageChart.tsx";

const load = (value: number | undefined) =>
  value === undefined ? undefined : value.toFixed(2);

export function UsageCard({
  info,
  samples = [],
}: {
  info: SystemInformation | undefined;
  /** This session's samples for the chart (phase 5 design 1.6). */
  samples?: readonly UsageSample[];
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const titleId = useId();
  const loading = info === undefined;

  const cpu = info?.cpuUtilization;
  const memory = info ? memoryUsage(info) : null;
  const average = info?.loadAverage;
  const one = load(average?.["1min"]);
  const five = load(average?.["5min"]);
  const fifteen = load(average?.["15min"]);
  const cores = info?.cpuCores ?? null;

  return (
    <Card render={<section aria-labelledby={titleId} />}>
      <CardHeader>
        <CardTitle id={titleId}>{t("dashboard.usage.title")}</CardTitle>
      </CardHeader>
      <CardContent aria-busy={loading || undefined}>
        <CapacityMeter
          label={t("dashboard.usage.cpu")}
          loading={loading}
          value={cpu ?? null}
          max={100}
          valueText={
            loading
              ? t("app.loading")
              : cpu === undefined
                ? t("common.notReported")
                : t("dashboard.usage.cpuValue", {
                    percent: format.percent(cpu),
                  })
          }
        />
        <CapacityMeter
          label={t("dashboard.usage.memory")}
          loading={loading}
          value={memory?.used ?? null}
          max={memory?.total ?? 1}
          valueText={
            loading
              ? t("app.loading")
              : memory === null
                ? t("common.notReported")
                : t("dashboard.usage.memoryValue", {
                    used: formatBytes(memory.used),
                    total: formatBytes(memory.total),
                    percent: format.percent(memory.percent),
                  })
          }
        />
        <div className="flex flex-col gap-1.5">
          <p className="text-base font-medium text-foreground">
            {t("dashboard.usage.load")}
          </p>
          {loading ? (
            <Skeleton className="w-2/3" />
          ) : one === undefined ||
            five === undefined ||
            fifteen === undefined ? (
            <p className="text-sm text-muted-foreground">
              {t("common.notReported")}
            </p>
          ) : (
            <p className="text-sm text-foreground tabular-nums">
              {t("dashboard.usage.loadValue", { one, five, fifteen })}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {cores === null
              ? t("dashboard.usage.loadHintNoCores")
              : t("dashboard.usage.loadHint", { cores })}
          </p>
        </div>
        <UsageChart samples={samples} loading={loading} />
      </CardContent>
    </Card>
  );
}
