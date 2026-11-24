// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { BothDensities, StoryCard } from "../../fixtures/story-frames";
import { LiveFigure } from "./live-figure";

const meta = {
  title: "Charts/Live figure",
  component: LiveFigure,
  args: {
    value: 12.4,
    format: (v: number) => v.toFixed(1),
    unit: "MiB/s",
    missing: "No reading",
  },
} satisfies Meta<typeof LiveFigure>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Figure: Story = {};
export const Readout: Story = { args: { size: "readout" } };
export const Inline: Story = {
  args: { size: "inline", value: 43, format: (v) => v.toFixed(0), unit: "%" },
};
/** A reading that came back without a figure says so; it is never 0. */
export const Missing: Story = { args: { value: null } };

/** Comfortable in Inter; compact in Roboto Mono, Instrument's readouts. */
export const Densities: Story = {
  render: (args) => (
    <BothDensities>
      <StoryCard title="Network in">
        <LiveFigure {...args} />
      </StoryCard>
    </BothDensities>
  ),
};

/** A new reading every 2 s: the figure glides to it in tabular figures (at once under reduced motion). */
export const Gliding: Story = {
  render: function Render(args) {
    const values = [12.4, 31.9, 28.2, 4.6, 18.0];
    const [i, setI] = React.useState(0);
    React.useEffect(() => {
      const timer = window.setInterval(() => {
        setI((n) => (n + 1) % values.length);
      }, 2000);
      return () => {
        window.clearInterval(timer);
      };
    }, [values.length]);
    return <LiveFigure {...args} value={values[i] ?? null} />;
  },
};
