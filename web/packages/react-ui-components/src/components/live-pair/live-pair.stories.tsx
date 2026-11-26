// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  livePairArgs,
  liveReadings,
  type Activity,
} from "../../fixtures/chart-fixtures";
import { Phone } from "../../fixtures/story-frames";
import { Button } from "../button/button";
import { MotionScope } from "../motion/motion-scope";
import { LivePair } from "./live-pair";

/** The still set: a computer copies files to the NAS in readings 6 to 17 and again from 26 on. */
const busyPlan = (i: number): Activity =>
  (i >= 6 && i < 18) || i >= 26 ? "copy-in" : "idle";
const idlePlan = (): Activity => "idle";

const BUSY = liveReadings(40, busyPlan);

const meta = {
  title: "Components/Live pair",
  component: LivePair,
  args: livePairArgs(BUSY),
} satisfies Meta<typeof LivePair>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Near idle: the processor low, memory steady, a trickle each way on the 1 MiB/s minimum scales. */
export const Idle: Story = {
  args: livePairArgs(liveReadings(40, idlePlan, { seed: 3 })),
};

/**
 * Busy: a copy in at up to about 90 MiB/s with about 1 MiB/s going out. Each half has its own scale
 * (100 and 2 MiB/s), so the traffic out is not flattened.
 */
export const Busy: Story = {};

/**
 * A tiny out: 0.1 MiB/s against a copy in. On its own 1 MiB/s scale it stands a tenth of its half
 * clear of the baseline instead of lying on it.
 */
export const TinyOut: Story = {
  args: livePairArgs({
    ...BUSY,
    sent: BUSY.sent.map((p) => ({ ...p, v: 0.1 })),
  }),
};

/** Paused: no reading is taken, so the charts stand still at the last one and the caption says so. */
export const Paused: Story = {
  args: livePairArgs(liveReadings(30, busyPlan), { paused: true }),
};

/** Paused for 20 seconds and played again: the lines break where no reading was taken, never joined. */
export const GapAfterAPause: Story = {
  args: livePairArgs(
    liveReadings(40, busyPlan, {
      skip: Array.from({ length: 10 }, (_, i) => 18 + i),
    }),
  ),
};

/** The page has been open for longer than the window: the chart says "Last 2 minutes". */
export const FullWindow: Story = {
  args: livePairArgs(liveReadings(80, busyPlan)),
};

/** As the page opens: one reading, and no network rate yet (a rate needs two counter readings). */
export const FirstReading: Story = {
  args: livePairArgs(liveReadings(1, idlePlan)),
};

/** Before the first reply: no line and no end labels, only the scales and the words. */
export const NoReadingYet: Story = {
  args: livePairArgs(liveReadings(0, idlePlan)),
};

/**
 * Take a reading: both charts shift left by one step over the glide duration, the end labels and a
 * changed scale glide to their values. Nothing moves until a reading arrives.
 */
function TakeReadings() {
  const [count, setCount] = React.useState(30);
  const readings = liveReadings(count, busyPlan);
  return (
    <div className="flex flex-col items-start gap-4">
      <Button
        variant="neutral"
        size="sm"
        onClick={() => {
          setCount((c) => c + 1);
        }}
      >
        Take a reading
      </Button>
      <LivePair className="self-stretch" {...livePairArgs(readings)} />
    </div>
  );
}

export const NewReading: Story = {
  render: () => <TakeReadings />,
};

/** The same under reduced motion: every new reading is drawn in place, with no shift and no glide. */
export const ReducedMotion: Story = {
  render: () => (
    <MotionScope reduced>
      <TakeReadings />
    </MotionScope>
  ),
};

/** At 390px the two charts stack, each at the full width. */
export const At390px: Story = {
  render: (args) => (
    <Phone>
      <LivePair {...args} />
    </Phone>
  ),
};
