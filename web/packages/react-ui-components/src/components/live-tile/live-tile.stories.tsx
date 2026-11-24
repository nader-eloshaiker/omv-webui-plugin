// SPDX-License-Identifier: GPL-3.0-or-later
// A story may draw the plot with LiveChart from the chart folder; the component itself never does, so
// it stays in the main entry without Recharts (entry-boundary.test.ts skips stories).
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  formatAgo,
  formatTime,
  INTERVAL_MS,
  mibPerSecond,
  percent,
  spanWords,
  systemSamples,
  toMiB,
  trafficSamples,
  type DemoSystemSample,
  type DemoTrafficSample,
} from "../../fixtures/live-samples";
import { Phone, StoryCard } from "../../fixtures/story-frames";
import { LiveChart } from "../charts/live-chart";
import { LiveFigure } from "../live-figure/live-figure";
import { LivePlotSkeleton, LiveTile } from "./live-tile";

const words = {
  formatAgo,
  formatTime,
  intervalMs: INTERVAL_MS,
  missingLabel: "No reading",
  emptyLabel: "Waiting for the first reading…",
  caption: ({ sampledMs }: { sampledMs: number }) =>
    `Showing the last ${spanWords(sampledMs)}`,
  table: false as const,
};

const system = systemSamples(30);
const traffic = trafficSamples(30);
const newest = system.at(-1);
const newestTraffic = traffic.at(-1)?.interfaces.get("eth0");

function ProcessorPlot({ data }: { data: readonly DemoSystemSample[] }) {
  return (
    <LiveChart<DemoSystemSample>
      data={data}
      label="Processor"
      series={[{ id: "cpu", label: "In use", value: (s) => s.cpu }]}
      domain={[0, 100]}
      formatValue={percent}
      describe={({ sampledMs, series }) =>
        `Processor over the last ${spanWords(sampledMs)}: now ${percent(series[0]?.now ?? 0)}.`
      }
      {...words}
    />
  );
}

function MemoryPlot({ data }: { data: readonly DemoSystemSample[] }) {
  return (
    <LiveChart<DemoSystemSample>
      data={data}
      label="Memory"
      series={[{ id: "mem", label: "In use", value: (s) => s.memory }]}
      domain={[0, 100]}
      formatValue={percent}
      describe={({ sampledMs, series }) =>
        `Memory over the last ${spanWords(sampledMs)}: now ${percent(series[0]?.now ?? 0)}.`
      }
      {...words}
    />
  );
}

function NetworkPlot({ data }: { data: readonly DemoTrafficSample[] }) {
  return (
    <LiveChart<DemoTrafficSample>
      data={data}
      label="Network on eth0"
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
      describe={({ sampledMs }) =>
        `Network on eth0 over the last ${spanWords(sampledMs)}.`
      }
      {...words}
    />
  );
}

const oneDecimal = (v: number) => v.toFixed(1);
const whole = (v: number) => (v < 1 ? "<1" : v.toFixed(0));

function Tiles({
  layout,
}: {
  layout?: React.ComponentProps<typeof LiveTile>["layout"];
}) {
  return (
    <>
      <LiveTile
        layout={layout}
        name="Processor"
        figure={
          <LiveFigure
            value={newest?.cpu ?? null}
            format={whole}
            unit="%"
            missing="No reading"
          />
        }
        plot={<ProcessorPlot data={system} />}
      >
        Average load 0.23 · 0.09 · 0.02
      </LiveTile>
      <LiveTile
        layout={layout}
        name="Memory"
        figure={
          <LiveFigure
            value={newest?.memory ?? null}
            format={whole}
            unit="%"
            missing="No reading"
          />
        }
        plot={<MemoryPlot data={system} />}
      >
        2.9 GiB of 8 GiB in use
      </LiveTile>
      <LiveTile
        layout={layout}
        name={
          <>
            Network · <code className="font-mono">eth0</code>
          </>
        }
        figure={
          <>
            <LiveFigure
              size="readout"
              value={toMiB(newestTraffic?.rx)}
              format={oneDecimal}
              unit="In"
              missing="No reading"
            />
            <LiveFigure
              size="readout"
              value={toMiB(newestTraffic?.tx)}
              format={oneDecimal}
              unit="Out, MiB/s"
              missing="No reading"
            />
          </>
        }
        plot={<NetworkPlot data={traffic} />}
      />
    </>
  );
}

const meta = {
  title: "Components/Live tile",
  component: LiveTile,
  parameters: { layout: "padded" },
} satisfies Meta<typeof LiveTile>;
export default meta;
type Story = StoryObj<typeof meta>;

/** "Right now" at medium width: three tiles across, each narrow enough to stack. */
export const ThreeAcross: Story = {
  args: { name: "", figure: null, plot: null },
  render: () => (
    <StoryCard title="Right now" className="max-w-4xl">
      <div className="grid gap-gutter sm:grid-cols-3">
        <Tiles />
      </div>
    </StoryCard>
  ),
};

/**
 * "Right now" in the five-column card of a wide page: the tiles are wide enough for a row each,
 * the name and figure at the start and the plot filling the rest (`layout="auto"` decides).
 */
export const RowsInANarrowColumn: Story = {
  args: { name: "", figure: null, plot: null },
  render: () => (
    <StoryCard title="Right now" className="max-w-md">
      <div className="flex flex-col gap-gutter">
        <Tiles />
      </div>
    </StoryCard>
  ),
};

/** The chart chunk is still loading: the plot's exact height breathes; the name and figure are there. */
export const PlotLoading: Story = {
  args: { name: "", figure: null, plot: null },
  render: () => (
    <StoryCard title="Right now" className="max-w-4xl">
      <div className="grid gap-gutter sm:grid-cols-3">
        {["Processor", "Memory"].map((name) => (
          <LiveTile
            key={name}
            name={name}
            figure={
              <LiveFigure
                value={12}
                format={whole}
                unit="%"
                missing="No reading"
              />
            }
            plot={<LivePlotSkeleton />}
          >
            {name === "Processor"
              ? "Average load 0.23 · 0.09 · 0.02"
              : "347.8 MiB of 3.8 GiB in use"}
          </LiveTile>
        ))}
        <LiveTile
          name="Network · eth0"
          figure={
            <LiveFigure
              value={null}
              format={oneDecimal}
              missing="Waiting for a second reading"
            />
          }
          plot={<LivePlotSkeleton />}
        />
      </div>
    </StoryCard>
  ),
};

/** A fresh sign-in: no sample yet, so the figures say so in words and the plots wait. */
export const NoReadingYet: Story = {
  args: { name: "", figure: null, plot: null },
  render: () => (
    <StoryCard title="Right now" className="max-w-4xl">
      <div className="grid gap-gutter sm:grid-cols-3">
        <LiveTile
          name="Processor"
          figure={
            <LiveFigure
              value={null}
              format={whole}
              unit="%"
              missing="No reading"
            />
          }
          plot={<ProcessorPlot data={[]} />}
        />
        <LiveTile
          name="Memory"
          figure={
            <LiveFigure
              value={null}
              format={whole}
              unit="%"
              missing="No reading"
            />
          }
          plot={<MemoryPlot data={[]} />}
        />
        <LiveTile
          name="Network · eth0"
          figure={
            <LiveFigure
              value={null}
              format={oneDecimal}
              missing="Waiting for a second reading"
            />
          }
          plot={<NetworkPlot data={[]} />}
        />
      </div>
    </StoryCard>
  ),
};

/** At 390px the tiles stack, each with its name and figure above the plot. */
export const AtPhoneWidth: Story = {
  args: { name: "", figure: null, plot: null },
  render: () => (
    <Phone>
      <StoryCard title="Right now">
        <Tiles />
      </StoryCard>
    </Phone>
  ),
};
