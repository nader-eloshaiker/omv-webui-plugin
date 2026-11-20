// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CapacityMeter } from "./capacity-meter";

const meta = {
  title: "Components/Capacity meter",
  component: CapacityMeter,
  decorators: [
    (Story) => (
      <div className="max-w-xs rounded-card border border-border bg-surface p-4">
        {Story()}
      </div>
    ),
  ],
  args: {
    label: "File system: data",
    value: 2.2,
    max: 3.6,
    valueText: "2.2 TiB of 3.6 TiB (62%)",
  },
} satisfies Meta<typeof CapacityMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {};
export const Empty: Story = {
  args: { value: 0, valueText: "0 B of 3.6 TiB (0%)" },
};
export const OverWarning: Story = {
  args: {
    label: "File system: photos",
    value: 3.1,
    valueText: "3.1 TiB of 3.6 TiB (86%); over the 85% threshold",
    threshold: { status: "warning", label: "Warning" },
  },
};
export const OverCritical: Story = {
  args: {
    label: "File system: backup",
    value: 3.5,
    valueText: "3.5 TiB of 3.6 TiB (96%); over the 90% threshold",
    threshold: { status: "critical", label: "Critical" },
  },
};
export const NoReading: Story = {
  args: {
    label: "File system: archive",
    value: null,
    valueText: "No reading: the file system is not mounted.",
  },
};
export const Loading: Story = {
  args: { value: null, loading: true, valueText: "Loading…" },
};
