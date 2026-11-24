// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import type * as React from "react";
import {
  INTERVAL_MS,
  mibPerSecond,
  percent,
  systemSamples,
  toMiB,
  trafficSamples,
} from "../../fixtures/live-samples";
import { BothDensities, Phone, StoryCard } from "../../fixtures/story-frames";
import { LiveFigure } from "../live-figure/live-figure";
import { Sparkline } from "./sparkline";

const system = systemSamples(30);
const traffic = trafficSamples(30);

function Row({
  name,
  figure,
  children,
}: {
  name: string;
  figure: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)_7rem] items-center gap-3">
      <span className="text-sm font-medium text-muted-foreground">{name}</span>
      {children}
      <span className="text-end">{figure}</span>
    </div>
  );
}

function Rows({
  cpuData = system,
  netData = traffic,
}: {
  cpuData?: typeof system;
  netData?: typeof traffic;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Row
        name="Processor"
        figure={
          <LiveFigure
            size="readout"
            value={cpuData.at(-1)?.cpu ?? null}
            format={(v) => v.toFixed(0)}
            unit="%"
            missing="No reading"
          />
        }
      >
        <Sparkline
          data={cpuData}
          value={(s) => s.cpu}
          domain={[0, 100]}
          intervalMs={INTERVAL_MS}
          describe={({ now, peak }) =>
            now === null
              ? "Processor: no reading yet"
              : `Processor: ${percent(now)} now, peak ${percent(peak ?? now)} in the last minute`
          }
        />
      </Row>
      <Row
        name="Network in"
        figure={
          <LiveFigure
            size="readout"
            value={toMiB(netData.at(-1)?.interfaces.get("eth0")?.rx)}
            format={(v) => v.toFixed(1)}
            unit="MiB/s"
            missing="No reading"
          />
        }
      >
        <Sparkline
          data={netData}
          value={(s) => toMiB(s.interfaces.get("eth0")?.rx)}
          intervalMs={INTERVAL_MS}
          describe={({ now, peak }) =>
            now === null
              ? "Network in: no reading yet"
              : `Network in: ${mibPerSecond(now)} now, peak ${mibPerSecond(peak ?? now)}`
          }
        />
      </Row>
    </div>
  );
}

const meta = {
  title: "Charts/Sparkline",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** A fixed scale for a share, a nice maximum for throughput; the figure beside it glides. */
export const Healthy: Story = {
  render: () => (
    <StoryCard className="max-w-xl">
      <Rows />
    </StoryCard>
  ),
};

/** Missing readings and a pause in sampling are gaps; a lone reading between two gaps is a dot. */
export const GapInTheSamples: Story = {
  render: () => (
    <StoryCard className="max-w-xl">
      <Rows
        cpuData={systemSamples(30, { missing: [10, 11, 13, 14] })}
        netData={trafficSamples(30, { pause: [12, 20] })}
      />
    </StoryCard>
  ),
};

/** Nothing sampled yet: a dashed baseline and "no reading", never a calm flat line. */
export const EmptyFirstSession: Story = {
  render: () => (
    <StoryCard className="max-w-xl">
      <Rows cpuData={[]} netData={[]} />
    </StoryCard>
  ),
};

export const Densities: Story = {
  render: () => (
    <BothDensities>
      <StoryCard>
        <Rows />
      </StoryCard>
    </BothDensities>
  ),
};

export const AtPhoneWidth: Story = {
  render: () => (
    <Phone>
      <StoryCard>
        <Rows />
      </StoryCard>
    </Phone>
  ),
};
