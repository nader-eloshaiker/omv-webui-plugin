// SPDX-License-Identifier: GPL-3.0-or-later
// "Right now" (dashboard spec 8): processor, memory and one network port, live, for administrators
// only. The samples are the shell's System.getInformation and interface replies for this session
// (live/liveSamples.ts); while this card is mounted the shell reads every 2 s, on other pages every
// 10 s, never while the tab is hidden (live/liveDemand.ts), and every read is a background call, so
// watching never keeps an idle session alive (UI-14).
//
// The names, figures and sub-lines render at once from the main chunk. The plots and the readings
// table come from one lazily imported module (dashboard/liveCharts.tsx), the only one that imports
// the chart library, so it never enters the entry chunk (UI-11). While it loads, each plot is a
// skeleton of its exact height; if it cannot be loaded, the plot says so with "Try again" and the
// figures keep working. A figure never shows 0 for a reading it does not have.
import type {
  NetworkDevice,
  SystemInformation,
} from "@omv-webui/react-api-omv/generated";
import {
  Button,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  Identifier,
  LiveFigure,
  LivePlotSkeleton,
  LiveTile,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  highestRate,
  interfaceRates,
  LIVE_WINDOW_MS,
  liveInterface,
  rateNumber,
  rateUnit,
  readingRows,
} from "../../dashboard/liveModel.ts";
import { formatBytes, wholePercent } from "../../format/format.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useDashboardConnection } from "../../hooks/useDashboardConnection.ts";
import { useLiveSamples } from "../../live/useLive.ts";
import { standing } from "../../network/connection.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { DashboardCard } from "../molecules/DashboardCard.tsx";

const loadCharts = () => import("../../dashboard/liveCharts.tsx");

type Parts = ReturnType<typeof lazyParts>;

/** The four parts from one import of the chunk: a dynamic import, so it is a chunk of its own. */
const lazyParts = () => ({
  Processor: lazy(() =>
    loadCharts().then((m) => ({ default: m.ProcessorChart })),
  ),
  Memory: lazy(() => loadCharts().then((m) => ({ default: m.MemoryChart }))),
  Network: lazy(() => loadCharts().then((m) => ({ default: m.NetworkChart }))),
  Readings: lazy(() => loadCharts().then((m) => ({ default: m.LiveReadings }))),
});

/**
 * One set of parts per attempt, made when this module loads (nothing is imported until a part is
 * drawn). A lazy part keeps its failure, so "Try again" moves to the next set, which imports the
 * chunk anew; after the last there is nothing left to try, and the button goes.
 */
const ATTEMPTS: [Parts, ...Parts[]] = [
  lazyParts(),
  lazyParts(),
  lazyParts(),
  lazyParts(),
];
/** Catches a chunk that could not be loaded (a stale cache after an upgrade), so the card stays. */
class ChunkBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ChartFailed({ onRetry }: { onRetry: (() => void) | undefined }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-26 flex-col items-center justify-center gap-2 rounded-control border border-dashed border-border-control px-4 text-center text-sm text-muted-foreground">
      <p>{t("dashboard.live.chartFailed")}</p>
      {onRetry === undefined ? null : (
        <Button variant="neutral" size="sm" onClick={onRetry}>
          {t("common.tryAgain")}
        </Button>
      )}
    </div>
  );
}

/**
 * The three tiles lay out alike: in a row, the name and figure take one fixed column and the plot
 * the rest, and the sub-line runs under both, so a long load line never narrows one plot and no two
 * plots differ in width.
 */
const TILE =
  "@xs/tile:[&>div]:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] [&_[data-part=sub]]:col-span-full";

const percentFigure = (value: number): string => {
  const whole = wholePercent(value);
  return whole === "under1" ? "<1" : String(whole);
};

export function LiveCard({
  info,
  stale,
  updatedAt,
  devices,
  className,
  index,
}: {
  /** System.getInformation, for the processor's core count. */
  info: SystemInformation | undefined;
  /** The shell's last read of the figures failed: the lines stop, the card says since when. */
  stale: boolean;
  updatedAt: number;
  /** Network.enumerateDevicesList, for the interface the Network tile shows. */
  devices: readonly NetworkDevice[] | undefined;
  className?: string;
  index?: number;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const live = useLiveSamples();
  const [attempt, setAttempt] = useState(0);
  const [readingsOpen, setReadingsOpen] = useState(false);
  const last = attempt >= ATTEMPTS.length - 1;
  const retry = last
    ? undefined
    : () => {
        setAttempt((a) => Math.min(a + 1, ATTEMPTS.length - 1));
      };
  const parts = ATTEMPTS[attempt] ?? ATTEMPTS[0];
  const { Processor, Memory, Network, Readings } = parts;
  const plot = (node: ReactNode) => (
    <ChunkBoundary key={attempt} fallback={<ChartFailed onRetry={retry} />}>
      <Suspense fallback={<LivePlotSkeleton />}>{node}</Suspense>
    </ChunkBoundary>
  );

  // The interface this page most likely uses, else the first connected one (spec 8.2).
  const connection = useDashboardConnection(devices);
  const thisPage =
    devices
      ?.map((d) => d.devicename)
      .find((name) => standing(connection, name) === "this") ?? null;
  const iface = devices === undefined ? null : liveInterface(devices, thisPage);
  const rates = iface === null ? [] : interfaceRates(live.traffic, iface);
  const { unit: unitId, divisor } = rateUnit(
    highestRate(rates, LIVE_WINDOW_MS),
  );
  const unit = t(`dashboard.live.unit.${unitId}`);

  const newest = live.system.at(-1);
  const newestRate = rates.at(-1);
  const missing = t("dashboard.live.noReading");
  const percentUnit = t("dashboard.live.percent");

  const load = (v: number | null | undefined) =>
    v === null || v === undefined ? undefined : v.toFixed(2);
  const one = load(newest?.load1);
  const five = load(newest?.load5);
  const fifteen = load(newest?.load15);
  const cores = info?.cpuCores ?? null;
  const memUsed = newest?.memUsed ?? null;
  const memTotal = newest?.memTotal ?? null;

  const span = live.systemSpan;
  const meta = (
    <>
      <span>
        {span === null
          ? t("dashboard.live.waiting")
          : t("dashboard.live.caption", {
              span: t("dashboard.live.seconds", {
                count: Math.round(span.ms / 1000),
              }),
            })}
      </span>
      <span role="status" className="basis-full empty:hidden">
        {stale && updatedAt > 0
          ? t("dashboard.live.stale", { time: format.clock(updatedAt) })
          : ""}
      </span>
    </>
  );

  let network: ReactNode;
  if (devices === undefined) {
    network = (
      <LiveTile
        className={TILE}
        name={t("dashboard.live.network")}
        figure={<Skeleton className="w-24 text-lg" />}
        plot={<LivePlotSkeleton />}
      />
    );
  } else if (iface === null) {
    network = (
      <LiveTile
        className={TILE}
        name={t("dashboard.live.network")}
        figure={
          <span className="text-base text-muted-foreground">
            {t("dashboard.live.noInterface")}
          </span>
        }
        plot={null}
      >
        <Link to="/network/interfaces" className={routerLinkClass}>
          {t("dashboard.network.link")}
        </Link>
      </LiveTile>
    );
  } else {
    const waiting = t("dashboard.live.waitingRate");
    network = (
      <LiveTile
        className={TILE}
        name={t("dashboard.live.network")}
        figure={
          newestRate === undefined ? (
            <span className="text-base font-medium text-muted-foreground">
              {waiting}
            </span>
          ) : (
            <>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-sm text-muted-foreground">
                  {t("dashboard.live.in")}
                </span>
                <LiveFigure
                  size="readout"
                  value={
                    newestRate.rx === null ? null : newestRate.rx / divisor
                  }
                  format={(v) => rateNumber(v, 1)}
                  missing={missing}
                />
              </span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-sm text-muted-foreground">
                  {t("dashboard.live.out")}
                </span>
                <LiveFigure
                  size="readout"
                  value={
                    newestRate.tx === null ? null : newestRate.tx / divisor
                  }
                  format={(v) => rateNumber(v, 1)}
                  unit={unit}
                  missing={missing}
                />
              </span>
            </>
          )
        }
        plot={plot(
          <Network rows={rates} name={iface} divisor={divisor} unit={unit} />,
        )}
      >
        <Identifier>{iface}</Identifier>
      </LiveTile>
    );
  }

  return (
    <DashboardCard
      title={t("dashboard.live.title")}
      meta={meta}
      className={className}
      index={index}
    >
      <div className="@container/live">
        <div className="grid gap-x-gutter gap-y-6 @min-[35rem]/live:grid-cols-3">
          <LiveTile
            className={TILE}
            name={t("dashboard.live.cpu")}
            figure={
              <LiveFigure
                value={newest?.cpu ?? null}
                format={percentFigure}
                unit={percentUnit}
                missing={missing}
              />
            }
            plot={plot(<Processor data={live.system} />)}
          >
            <p className="tabular-nums">
              {one === undefined || five === undefined || fifteen === undefined
                ? `${t("dashboard.live.load")} · ${t("common.notReported")}`
                : `${t("dashboard.live.load")} ${t("dashboard.live.loadValue", { one, five, fifteen })}`}
            </p>
            <Disclosure>
              <DisclosureTrigger variant="inline">
                {t("dashboard.live.loadWhat")}
              </DisclosureTrigger>
              <DisclosurePanel>
                <p>
                  {cores === null
                    ? t("dashboard.live.loadHintNoCores")
                    : t("dashboard.live.loadHint", { cores })}
                </p>
              </DisclosurePanel>
            </Disclosure>
          </LiveTile>
          <LiveTile
            className={TILE}
            name={t("dashboard.live.memory")}
            figure={
              <LiveFigure
                value={newest?.memory ?? null}
                format={percentFigure}
                unit={percentUnit}
                missing={missing}
              />
            }
            plot={plot(<Memory data={live.system} />)}
          >
            <p className="tabular-nums">
              {memUsed === null || memTotal === null
                ? t("common.notReported")
                : t("dashboard.live.memoryValue", {
                    used: formatBytes(memUsed),
                    total: formatBytes(memTotal),
                  })}
            </p>
          </LiveTile>
          {network}
        </div>
      </div>
      {live.system.length > 0 ? (
        <Disclosure open={readingsOpen} onOpenChange={setReadingsOpen}>
          <DisclosureTrigger variant="inline">
            {readingsOpen
              ? t("dashboard.chart.hideReadings")
              : t("dashboard.chart.showReadings")}
          </DisclosureTrigger>
          <DisclosurePanel keepMounted={false}>
            {plot(
              <Readings
                rows={readingRows(live.system, rates, LIVE_WINDOW_MS)}
                network={iface === null ? null : { divisor, unit }}
              />,
            )}
          </DisclosurePanel>
        </Disclosure>
      ) : null}
    </DashboardCard>
  );
}
