// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  formatAgo,
  formatTime,
  INTERVAL_MS,
  mibPerSecond,
  NOW,
  percent,
  spanWords,
  systemSamples,
  toMiB,
  trafficSamples,
  type DemoSystemSample,
  type DemoTrafficSample,
} from "../../fixtures/live-samples";
import { BothDensities, Phone, StoryCard } from "../../fixtures/story-frames";
import { LiveFigure } from "../live-figure/live-figure";
import { LiveChart, type LiveChartProps } from "./live-chart";

const words = {
  formatAgo,
  formatTime,
  intervalMs: INTERVAL_MS,
  missingLabel: "No reading",
  emptyLabel:
    "Waiting for the first reading. Charts start when you open the page.",
  caption: ({ sampledMs, samples }: { sampledMs: number; samples: number }) =>
    samples === 0
      ? "Updated every 2 s. Nothing has been read yet."
      : `Updated every 2 s, showing the last ${spanWords(sampledMs)} read on this page.`,
};

const tableWords = (what: string) => ({
  summary: "Show the numbers as a table",
  caption: `${what} readings sampled every 2 seconds on this page, newest first`,
  timeHeader: "Time",
});

function Processor(
  props: Partial<LiveChartProps<DemoSystemSample>> & {
    data: readonly DemoSystemSample[];
  },
) {
  return (
    <LiveChart<DemoSystemSample>
      label="Processor"
      series={[{ id: "cpu", label: "In use", value: (s) => s.cpu }]}
      domain={[0, 100]}
      formatValue={percent}
      describe={({ sampledMs, series }) => {
        const s = series[0];
        return s?.now === null || s === undefined
          ? `Processor: no reading in the last ${spanWords(sampledMs)}.`
          : `Processor, sampled every 2 s over the last ${spanWords(sampledMs)} on this page: now ${percent(s.now)}, highest ${percent(s.high ?? 0)}, lowest ${percent(s.low ?? 0)}.`;
      }}
      table={tableWords("Processor")}
      {...words}
      {...props}
    />
  );
}

function Memory({ data }: { data: readonly DemoSystemSample[] }) {
  return (
    <LiveChart<DemoSystemSample>
      data={data}
      label="Memory"
      series={[
        {
          id: "mem",
          label: "In use",
          value: (s) => (s.memUsed === null ? null : s.memUsed / 1024 ** 3),
        },
      ]}
      domain={[0, 8]}
      formatValue={(v) => `${v.toFixed(1)}\u00a0GiB`}
      formatTick={(v) => `${v}`}
      describe={({ sampledMs, series }) =>
        `Memory in use over the last ${spanWords(sampledMs)}: now ${series[0]?.now?.toFixed(1) ?? "no reading"} GiB of 8 GiB.`
      }
      table={tableWords("Memory")}
      {...words}
    />
  );
}

function Network(
  props: Partial<LiveChartProps<DemoTrafficSample>> & {
    data: readonly DemoTrafficSample[];
  },
) {
  return (
    <LiveChart<DemoTrafficSample>
      label="Network, eth0"
      series={[
        {
          id: "rx",
          label: "In",
          value: (s) => toMiB(s.interfaces.get("eth0")?.rx),
        },
        {
          id: "tx",
          label: "Out",
          value: (s) => toMiB(s.interfaces.get("eth0")?.tx),
        },
      ]}
      formatValue={mibPerSecond}
      formatTick={(v) => `${v}`}
      describe={({ sampledMs, series }) =>
        `Network on eth0 over the last ${spanWords(sampledMs)}, in MiB/s: ` +
        series
          .map(
            (s) =>
              `${s.label} now ${s.now?.toFixed(1) ?? "no reading"}, highest ${s.high?.toFixed(1) ?? "none"}`,
          )
          .join("; ") +
        "."
      }
      table={tableWords("Network")}
      {...words}
      {...props}
    />
  );
}

/** A dashboard tile: the reading above its chart, as the lab composes it. */
function Tile({
  name,
  value,
  children,
}: {
  name: string;
  value: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-sm font-medium text-muted-foreground">{name}</p>
      {value}
      {children}
    </div>
  );
}

const meta = {
  title: "Charts/Live chart",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const healthy = systemSamples(30);
const traffic = trafficSamples(30);

/** A healthy NAS after a minute on the dashboard: three tiles, each a reading over its chart. */
export const HealthyDashboard: Story = {
  render: () => (
    <StoryCard title="Right now" className="max-w-5xl">
      <div className="grid gap-gutter md:grid-cols-3">
        <Tile
          name="Processor"
          value={
            <LiveFigure
              value={healthy.at(-1)?.cpu ?? null}
              format={(v) => v.toFixed(0)}
              unit="%"
              missing="No reading"
            />
          }
        >
          <Processor data={healthy} table={false} />
        </Tile>
        <Tile
          name="Memory"
          value={
            <LiveFigure
              value={(toMiB(healthy.at(-1)?.memUsed) ?? 0) / 1024}
              format={(v) => v.toFixed(1)}
              unit="GiB"
              missing="No reading"
            />
          }
        >
          <Memory data={healthy} />
        </Tile>
        <Tile
          name="Network"
          value={
            <LiveFigure
              value={toMiB(traffic.at(-1)?.interfaces.get("eth0")?.rx)}
              format={(v) => v.toFixed(1)}
              unit="MiB/s in"
              missing="No reading"
            />
          }
        >
          <Network data={traffic} table={false} />
        </Tile>
      </div>
    </StoryCard>
  ),
};

/** The Performance page: a large chart with two lines, each named at its newest point, and its own dash. */
export const LargeTwoSeries: Story = {
  render: () => (
    <StoryCard title="Network" className="max-w-4xl">
      <Network
        data={trafficSamples(150)}
        size="large"
        windowMs={300_000}
        narrowWindowMs={60_000}
      />
    </StoryCard>
  ),
};

/** A busy NAS with an alert line the caller supplies (the value here is only an example). */
export const BusyWithAlert: Story = {
  render: () => (
    <StoryCard title="Processor" className="max-w-3xl">
      <Processor
        data={systemSamples(30, { busy: true })}
        size="large"
        alerts={[{ value: 90, label: "Busy above 90%", short: "90%" }]}
      />
    </StoryCard>
  ),
};

/** The first session: nothing sampled yet. Never drawn as a calm flat line. */
export const EmptyFirstSession: Story = {
  render: () => (
    <StoryCard title="Processor" className="max-w-md">
      <Processor data={[]} />
    </StoryCard>
  ),
};

/** Only 14 s sampled so far: the caption says 14 s, and the line fills from the right. */
export const StillFilling: Story = {
  render: () => (
    <StoryCard title="Processor" className="max-w-md">
      <Processor data={systemSamples(8)} />
    </StoryCard>
  ),
};

/** Gaps: two readings that came back without a figure, and a pause while the tab was hidden. */
export const GapInTheSamples: Story = {
  render: () => (
    <div className="grid max-w-4xl gap-gutter md:grid-cols-2">
      <StoryCard title="Processor">
        <Processor data={systemSamples(30, { missing: [12, 13, 20] })} />
      </StoryCard>
      <StoryCard title="Network">
        <Network data={trafficSamples(30, { pause: [8, 17] })} />
      </StoryCard>
    </div>
  ),
};

/** At 390px the window is half a minute, so the line stays readable. */
export const AtPhoneWidth: Story = {
  render: () => (
    <Phone>
      <StoryCard title="Processor">
        <Processor data={healthy} />
      </StoryCard>
    </Phone>
  ),
};

/** Comfortable and compact: compact has mono axis figures and readouts. */
export const Densities: Story = {
  render: () => (
    <BothDensities>
      <StoryCard title="Processor">
        <Tile
          name="In use"
          value={
            <LiveFigure
              value={healthy.at(-1)?.cpu ?? null}
              format={(v) => v.toFixed(0)}
              unit="%"
              missing="No reading"
            />
          }
        >
          <Processor data={healthy} />
        </Tile>
      </StoryCard>
    </BothDensities>
  ),
};

/** A sample every 2 s, as the session store delivers them: the line glides one step per sample. */
export const LiveUpdating: Story = {
  render: function Render() {
    const [data, setData] = React.useState(() => systemSamples(30));
    React.useEffect(() => {
      const timer = window.setInterval(() => {
        setData((previous) => {
          const next = systemSamples(previous.length + 1).at(-1);
          const last = previous.at(-1);
          if (!next || !last) {
            return previous;
          }
          const t = last.t + INTERVAL_MS;
          return [...previous.slice(-299), { ...next, t }];
        });
      }, INTERVAL_MS);
      return () => {
        window.clearInterval(timer);
      };
    }, []);
    return (
      <StoryCard title="Processor" className="max-w-md">
        <LiveFigure
          value={data.at(-1)?.cpu ?? null}
          format={(v) => v.toFixed(0)}
          unit="%"
          missing="No reading"
        />
        <Processor data={data} />
        <p className="text-caption text-tertiary-foreground">
          Started {formatTime(NOW)} UTC
        </p>
      </StoryCard>
    );
  },
};
