// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  LineChart,
  type LineChartPoint,
  type LineChartSeriesSummary,
} from "./line-chart";

// Fixed readings, so a story looks the same on every run: what a dashboard page sampling every 20 s
// has collected since it was opened. The newest sample is at 14:12.
const STEP = 20_000;
const END = Date.UTC(2026, 10, 21, 14, 12, 0);
const TEN_MINUTES = 10 * 60_000;

function sampled(values: readonly (number | null)[]): LineChartPoint[] {
  return values.map((value, i) => ({
    t: END - (values.length - 1 - i) * STEP,
    value,
  }));
}

// Six and a half minutes of CPU load: an idle box, a scrub starting, settling.
const cpu = [
  4, 6, 5, 7, 5, 4, 9, 22, 38, 41, 44, 39, 42, 47, 45, 40, 36, 31, 27, 24,
];
const memory = [
  38, 38, 39, 39, 39, 40, 41, 45, 49, 52, 53, 53, 54, 54, 55, 55, 55, 54, 54,
  54,
];

const describeSeries = ({ label, latest, min, max }: LineChartSeriesSummary) =>
  `${label}: ${latest} now, lowest ${min}, highest ${max} in this window.`;

const time = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const meta = {
  title: "Components/Line chart",
  component: LineChart,
  decorators: [
    (Story) => (
      <div className="max-w-xl rounded-card border border-border bg-surface p-4">
        {Story()}
      </div>
    ),
  ],
  args: {
    "aria-label": "CPU and memory use, last 10 minutes",
    windowMs: TEN_MINUTES,
    formatTime: (t: number) => time.format(t),
    describeSeries,
    emptyLabel:
      "Collecting readings. The chart starts after the second one, in about 20 seconds.",
    series: [
      { id: "cpu", label: "CPU", points: sampled(cpu) },
      { id: "memory", label: "Memory", points: sampled(memory) },
    ],
  },
} satisfies Meta<typeof LineChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoSeries: Story = {};

export const OneSeries: Story = {
  args: {
    "aria-label": "CPU use, last 10 minutes",
    series: [{ id: "cpu", label: "CPU", points: sampled(cpu) }],
  },
};

/** The page has just opened: one reading, so there is no line yet. */
export const Empty: Story = {
  args: {
    series: [
      { id: "cpu", label: "CPU", points: sampled([4]) },
      { id: "memory", label: "Memory", points: sampled([38]) },
    ],
  },
};

/** A minute of readings did not arrive (the browser tab slept): the lines break, nothing is bridged. */
export const Gap: Story = {
  args: {
    series: [
      {
        id: "cpu",
        label: "CPU",
        points: [
          ...sampled(cpu.slice(0, 8)).map((p) => ({
            ...p,
            t: p.t - 13 * STEP,
          })),
          ...sampled(cpu.slice(10)),
        ],
      },
      {
        id: "memory",
        label: "Memory",
        points: [
          ...sampled(memory.slice(0, 8)).map((p) => ({
            ...p,
            t: p.t - 13 * STEP,
          })),
          ...sampled(memory.slice(10)),
        ],
      },
    ],
  },
};

/** One reading failed (`value: null`) between two that did not: the lone sample is a marker. */
export const FailedReading: Story = {
  args: {
    "aria-label": "CPU use, last 10 minutes",
    series: [
      {
        id: "cpu",
        label: "CPU",
        points: sampled([
          ...cpu.slice(0, 12),
          null,
          44,
          null,
          ...cpu.slice(15),
        ]),
      },
    ],
  },
};

/** The most a chart may carry; each line has its own dash and marker as well as its colour. */
export const FourSeries: Story = {
  args: {
    "aria-label": "Load per CPU core, last 10 minutes",
    series: [
      { id: "core0", label: "Core 0", points: sampled(cpu) },
      {
        id: "core1",
        label: "Core 1",
        points: sampled(cpu.map((v) => Math.max(0, v - 12))),
      },
      {
        id: "core2",
        label: "Core 2",
        points: sampled(cpu.map((v, i) => (v + i * 3) % 90)),
      },
      {
        id: "core3",
        label: "Core 3",
        points: sampled(memory.map((v) => v + 20)),
      },
    ],
  },
};

/** Close values: the end labels move apart rather than overlap. */
export const CloseValues: Story = {
  args: {
    series: [
      { id: "cpu", label: "CPU", points: sampled(cpu.map((v) => v + 28)) },
      { id: "memory", label: "Memory", points: sampled(memory) },
    ],
  },
};

/** A temperature on its own domain and formatter. */
export const Temperature: Story = {
  args: {
    "aria-label": "CPU temperature, last 10 minutes",
    domain: [20, 90],
    yTicks: [20, 40, 60, 80],
    formatValue: (v: number) => `${Math.round(v)} °C`,
    series: [
      {
        id: "temp",
        label: "Package",
        points: sampled(cpu.map((v) => 38 + v * 0.6)),
      },
    ],
  },
};

/** At the narrowest layout the plot gives way to the labels, never the other way round. */
export const Narrow: Story = {
  decorators: [(Story) => <div className="w-72">{Story()}</div>],
};

export const Dark: Story = {
  globals: { theme: "Dark" },
  decorators: [
    (Story) => (
      <div className="dark rounded-card bg-surface p-4 text-foreground">
        {Story()}
      </div>
    ),
  ],
};

/** A series name that looks like markup is drawn as text. */
export const MarkupInLabel: Story = {
  args: {
    "aria-label": "Disk load, last 10 minutes",
    series: [{ id: "x", label: "<b>sda</b>", points: sampled(cpu) }],
  },
};
