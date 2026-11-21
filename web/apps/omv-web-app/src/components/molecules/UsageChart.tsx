// SPDX-License-Identifier: GPL-3.0-or-later
// The processor and memory over the last ten minutes, on the Usage card (phase 5 design 1.6). The
// samples are the shell's System.getInformation replies for this session (usageSamples.ts, D9), so
// the chart shows only what this browser has sampled (A7). Gaps are gaps. To assistive technology it
// is one image with a summary, not a live region; every reading is in the "Show the readings" table.
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  LineChart,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CHART_MAX_GAP_MS,
  CHART_WINDOW_MS,
  readingRows,
  type UsageSample,
} from "../../dashboard/dashboard.ts";
import { useFormat } from "../../format/useFormat.ts";

const HEIGHT = 120;

export function UsageChart({
  samples,
  loading,
}: {
  samples: readonly UsageSample[];
  /** No system information yet: the plot area is a skeleton of its own height. */
  loading: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const [open, setOpen] = useState(false);
  const cpu = t("dashboard.chart.cpu");
  const memory = t("dashboard.chart.memory");
  const last = samples.at(-1)?.t;
  const first = samples[0]?.t;
  const span = last !== undefined && first !== undefined ? last - first : 0;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t("dashboard.chart.title")}</p>
      {loading ? (
        <Skeleton shape="block" className="h-[120px]" />
      ) : (
        <LineChart
          aria-label={t("dashboard.chart.label", {
            duration: format.duration(Math.max(60, span / 1000)),
          })}
          height={HEIGHT}
          windowMs={CHART_WINDOW_MS}
          maxGap={CHART_MAX_GAP_MS}
          domain={[0, 100]}
          yTicks={[0, 50, 100]}
          formatValue={format.percent}
          formatTime={(time) =>
            time === last
              ? t("dashboard.chart.now")
              : new Date(time).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })
          }
          series={[
            {
              id: "cpu",
              label: cpu,
              points: samples.map((s) => ({ t: s.t, value: s.cpu })),
            },
            {
              id: "memory",
              label: memory,
              points: samples.map((s) => ({ t: s.t, value: s.memory })),
            },
          ]}
          describeSeries={(summary) =>
            t("dashboard.chart.seriesSummary", {
              series: summary.label,
              now: summary.latest,
              max: summary.max,
              min: summary.min,
            })
          }
          emptyLabel={t("dashboard.chart.notEnough")}
        />
      )}
      {!loading && samples.length >= 2 ? (
        <Disclosure open={open} onOpenChange={setOpen}>
          <DisclosureTrigger variant="inline">
            {open
              ? t("dashboard.chart.hideReadings")
              : t("dashboard.chart.showReadings")}
          </DisclosureTrigger>
          <DisclosurePanel keepMounted={false}>
            <Table aria-label={t("dashboard.chart.readingsLabel")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dashboard.chart.colTime")}</TableHead>
                  <TableHead numeric>{cpu}</TableHead>
                  <TableHead numeric>{memory}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readingRows(samples).map((row) =>
                  row.kind === "gap" ? (
                    <TableRow key={`gap-${String(row.after)}`}>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        {t("dashboard.chart.gap")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={row.sample.t}>
                      <TableCell className="tabular-nums">
                        {format.clock(row.sample.t)}
                      </TableCell>
                      <TableCell numeric>
                        {row.sample.cpu === null
                          ? t("common.notReported")
                          : format.percent(row.sample.cpu)}
                      </TableCell>
                      <TableCell numeric>
                        {row.sample.memory === null
                          ? t("common.notReported")
                          : format.percent(row.sample.memory)}
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </DisclosurePanel>
        </Disclosure>
      ) : null}
    </div>
  );
}
