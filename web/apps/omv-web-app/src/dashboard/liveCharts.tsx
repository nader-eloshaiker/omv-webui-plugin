// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's live plots and their readings table (dashboard spec 8.1). The only module of the
// page that imports `@omv-webui/react-ui-components/charts`, and the page imports it lazily, so
// Recharts loads in a chunk of its own and never in the entry chunk of the index route (UI-11). The
// names, figures and sub-lines of the tiles are drawn by the page from the main chunk, so they work
// while this loads and if it cannot be loaded.
//
// Each plot is one image with a text alternative (now, highest, lowest over the span really sampled)
// and no table of its own: the card has one table for all three. A missing reading is a gap, never 0.
import {
  ChartTable,
  LiveChart,
  SERIES_DASH,
  Swatch,
  toneFor,
  type ChartTableColumn,
  type LiveChartSummary,
} from "@omv-webui/react-ui-components/charts";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format/useFormat.ts";
import type { SystemSample } from "../live/liveSamples.ts";
import {
  LIVE_INTERVAL_MS,
  LIVE_MAX_GAP_MS,
  LIVE_NARROW_WINDOW_MS,
  LIVE_WINDOW_MS,
  rateNumber,
  type RateRow,
  type ReadingRow,
} from "./liveModel.ts";

/** The words and timing every plot of the card shares. */
function useCommon() {
  const { t } = useTranslation();
  const format = useFormat();
  const span = (summary: LiveChartSummary) =>
    t("dashboard.live.seconds", {
      count: Math.round(summary.sampledMs / 1000),
    });
  return {
    span,
    props: {
      intervalMs: LIVE_INTERVAL_MS,
      windowMs: LIVE_WINDOW_MS,
      narrowWindowMs: LIVE_NARROW_WINDOW_MS,
      maxGapMs: LIVE_MAX_GAP_MS,
      formatAgo: (seconds: number) =>
        seconds === 0
          ? t("dashboard.live.now")
          : t("dashboard.live.seconds", { count: seconds }),
      formatTime: format.clock,
      emptyLabel: t("dashboard.live.waiting"),
      missingLabel: t("dashboard.live.noReading"),
      table: false as const,
      ground: "surface" as const,
      size: "tile" as const,
    },
  };
}

/** Processor or memory in use, percent, over the last minute. */
function PercentChart({
  data,
  label,
  value,
}: {
  data: readonly SystemSample[];
  label: string;
  value: (row: SystemSample) => number | null;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const { span, props } = useCommon();
  return (
    <LiveChart
      {...props}
      data={data}
      series={[{ id: "inUse", label: t("dashboard.live.inUse"), value }]}
      label={label}
      domain={[0, 100]}
      ticks={[0, 50, 100]}
      formatValue={format.percent}
      formatTick={(v) => `${String(v)}%`}
      caption={() => t("dashboard.live.inUse")}
      describe={(summary) => {
        const figures = summary.series[0];
        if (
          figures === undefined ||
          figures.now === null ||
          figures.high === null ||
          figures.low === null
        ) {
          return t("dashboard.live.describeEmpty", { series: label });
        }
        return t("dashboard.live.describeOne", {
          series: label,
          span: span(summary),
          now: format.percent(figures.now),
          high: format.percent(figures.high),
          low: format.percent(figures.low),
        });
      }}
    />
  );
}

export function ProcessorChart({ data }: { data: readonly SystemSample[] }) {
  const { t } = useTranslation();
  return (
    <PercentChart
      data={data}
      label={t("dashboard.live.cpu")}
      value={(row) => row.cpu}
    />
  );
}

export function MemoryChart({ data }: { data: readonly SystemSample[] }) {
  const { t } = useTranslation();
  return (
    <PercentChart
      data={data}
      label={t("dashboard.live.memory")}
      value={(row) => row.memory}
    />
  );
}

/** In and Out of one interface, in the unit the card chose for the window. */
export function NetworkChart({
  rows,
  name,
  divisor,
  unit,
}: {
  rows: readonly RateRow[];
  /** The interface: "enp2s0". */
  name: string;
  divisor: number;
  /** "MiB/s". */
  unit: string;
}) {
  const { t } = useTranslation();
  const { span, props } = useCommon();
  const inLabel = t("dashboard.live.in");
  const outLabel = t("dashboard.live.out");
  const withUnit = (v: number) => `${rateNumber(v, 1)}\u00a0${unit}`;
  const figure = (v: number | null) =>
    v === null ? t("dashboard.live.noReading") : withUnit(v);
  return (
    <LiveChart
      {...props}
      data={rows}
      series={[
        {
          id: "in",
          label: inLabel,
          value: (row) => (row.rx === null ? null : row.rx / divisor),
        },
        {
          id: "out",
          label: outLabel,
          value: (row) => (row.tx === null ? null : row.tx / divisor),
        },
      ]}
      label={t("dashboard.live.network")}
      emptyLabel={t("dashboard.live.waitingRate")}
      domain="nice"
      formatValue={withUnit}
      formatTick={(v) => rateNumber(v, 1)}
      caption={() => (
        // The key: each line's colour and dash beside its name.
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <Swatch tone={toneFor(0, 2)} dash={SERIES_DASH[0]} />
            {inLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Swatch tone={toneFor(1, 2)} dash={SERIES_DASH[1]} />
            {outLabel}
          </span>
        </span>
      )}
      describe={(summary) => {
        const [rx, tx] = summary.series;
        return t("dashboard.live.describeNetwork", {
          name,
          span: span(summary),
          inNow: figure(rx?.now ?? null),
          inHigh: figure(rx?.high ?? null),
          outNow: figure(tx?.now ?? null),
          outHigh: figure(tx?.high ?? null),
        });
      }}
    />
  );
}

/**
 * The numbers behind the three plots, newest first, with a "No readings" row where the lines break
 * (spec 8.2). A plain table, rendered only while its disclosure is open.
 */
export function LiveReadings({
  rows,
  network,
}: {
  rows: readonly ReadingRow[];
  /** The Network tile's interface and unit, when it has one. */
  network: { divisor: number; unit: string } | null;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const missing = t("dashboard.live.noReading");
  const percent = (v: number | null) =>
    v === null ? missing : format.percent(v);
  const rate = (v: number | null) =>
    v === null || network === null
      ? missing
      : `${rateNumber(v, network.divisor)}\u00a0${network.unit}`;
  const reading = <K extends "cpu" | "memory" | "rx" | "tx">(
    row: ReadingRow,
    key: K,
    show: (v: number | null) => string,
  ) => (row.kind === "gap" ? "" : show(row[key]));
  const columns: ChartTableColumn<ReadingRow>[] = [
    {
      id: "time",
      header: t("dashboard.chart.colTime"),
      cell: (row) =>
        row.kind === "gap" ? t("dashboard.chart.gap") : format.clock(row.t),
    },
    {
      id: "cpu",
      header: t("dashboard.live.cpu"),
      numeric: true,
      cell: (row) => reading(row, "cpu", percent),
    },
    {
      id: "memory",
      header: t("dashboard.live.memory"),
      numeric: true,
      cell: (row) => reading(row, "memory", percent),
    },
  ];
  if (network !== null) {
    columns.push(
      {
        id: "in",
        header: `${t("dashboard.live.network")} · ${t("dashboard.live.in")}`,
        numeric: true,
        cell: (row) => reading(row, "rx", rate),
      },
      {
        id: "out",
        header: `${t("dashboard.live.network")} · ${t("dashboard.live.out")}`,
        numeric: true,
        cell: (row) => reading(row, "tx", rate),
      },
    );
  }
  return (
    <ChartTable
      rows={rows}
      rowKey={(row) =>
        row.kind === "gap" ? `gap-${String(row.after)}` : String(row.t)
      }
      columns={columns}
      caption={t("dashboard.live.tableLabel")}
    />
  );
}
