// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import type * as React from "react";
import { BothDensities, Phone } from "../../fixtures/story-frames";
import { CapacityMeter } from "./capacity-meter";

/**
 * The capacity meter stays beside the `Waffle` (journal 2026-11-26) and should not become a waffle
 * variant. The waffle is one reading only, the share of a whole in percent against the admin's warning
 * mark, which it draws as a gap. This meter takes any amount out of any `max`, and it has the "no
 * reading" and loading forms, which the waffle lacks. Space used on a file system is the waffle's job.
 * When the file system pages move to it, this meter's compact cells (the `cells` prop in compact
 * density) do the same work as `Waffle size="cell"`, and are the part to retire.
 */
const meta = {
  title: "Components/Capacity meter",
  component: CapacityMeter,
  decorators: [
    // The compact form is drawn in a wider frame, as a table's usage column gives it.
    (Story, { parameters }) => (
      <div
        className={`${parameters.compact ? "max-w-xl" : "max-w-xs"} rounded-card border border-border bg-surface p-4`}
      >
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

const GROUNDS = [
  { name: "On the page", className: "bg-page" },
  { name: "On a card", className: "bg-surface ring-1 ring-border" },
  { name: "In an inset", className: "bg-muted" },
] as const;

/**
 * Filled, never outlined (style guide 5.6): the amount in the usage blue, the rest in the empty
 * slate, on each ground a meter lands on. Past the threshold the amount takes the warning stroke, with
 * its word.
 */
export const OnEachGround: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      {GROUNDS.map((ground) => (
        <div
          key={ground.name}
          className={`flex flex-col gap-3 rounded-control p-3 ${ground.className}`}
        >
          <p className="text-caption text-tertiary-foreground">{ground.name}</p>
          <CapacityMeter {...args} />
          <CapacityMeter
            {...args}
            label="File system: photos"
            value={3.1}
            valueText="3.1 TiB of 3.6 TiB (86%)"
            threshold={{ status: "warning", label: "Almost full" }}
          />
        </div>
      ))}
    </div>
  ),
};

/** The compact form sits in a table cell of a 36px row: the bar and the figure on one line. */
function UsageCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center px-3 py-1.5">{children}</div>
  );
}

// The cell replaces the frame's padding, as a table cell's own padding would.
const compactDecorators: Story["decorators"] = [
  (Story) => (
    <div className="-m-4">
      <UsageCell>{Story()}</UsageCell>
    </div>
  ),
];

export const CompactBelowLevel: Story = {
  parameters: { compact: true },
  decorators: compactDecorators,
  args: {
    variant: "compact",
    label: "Usage of data",
    value: 2.2,
    valueText: "62% full, 1.4 TiB free of 3.6 TiB",
  },
};
export const CompactWarning: Story = {
  parameters: { compact: true },
  decorators: compactDecorators,
  args: {
    variant: "compact",
    label: "Usage of photos",
    value: 3.1,
    valueText: "86% full, 512 GiB free of 3.6 TiB",
    threshold: { status: "warning", label: "Warning" },
  },
};
export const CompactCriticalFull: Story = {
  parameters: { compact: true },
  decorators: compactDecorators,
  args: {
    variant: "compact",
    label: "Usage of backup",
    value: 3.6,
    valueText: "100% full, 0 B free of 3.6 TiB",
    threshold: { status: "critical", label: "Critical" },
  },
};
export const CompactNoReading: Story = {
  parameters: { compact: true },
  decorators: compactDecorators,
  args: {
    variant: "compact",
    label: "Usage of archive",
    value: null,
    valueText: "No reading",
  },
};
export const CompactLoading: Story = {
  parameters: { compact: true },
  decorators: compactDecorators,
  args: {
    variant: "compact",
    label: "Usage of data",
    value: null,
    loading: true,
    valueText: "Loading…",
  },
};

/** Several compact meters as a usage column; under 640px each figure wraps under its bar. */
export const CompactInAColumn: Story = {
  parameters: { compact: true },
  decorators: [
    (Story) => (
      <div className="-m-4 flex flex-col divide-y divide-border">{Story()}</div>
    ),
  ],
  render: () => (
    <>
      <UsageCell>
        <CapacityMeter
          variant="compact"
          label="Usage of data"
          value={2.2}
          max={3.6}
          valueText="62% full, 1.4 TiB free of 3.6 TiB"
        />
      </UsageCell>
      <UsageCell>
        <CapacityMeter
          variant="compact"
          label="Usage of photos"
          value={3.1}
          max={3.6}
          valueText="86% full, 512 GiB free of 3.6 TiB"
          threshold={{ status: "warning", label: "Warning" }}
        />
      </UsageCell>
      <UsageCell>
        <CapacityMeter
          variant="compact"
          label="Usage of backup"
          value={3.6}
          max={3.6}
          valueText="100% full, 0 B free of 3.6 TiB"
          threshold={{ status: "critical", label: "Critical" }}
        />
      </UsageCell>
      <UsageCell>
        <CapacityMeter
          variant="compact"
          label="Usage of archive"
          value={null}
          max={0}
          valueText="No reading"
        />
      </UsageCell>
    </>
  ),
};

/** A healthy NAS and one almost full, comfortable and compact: compact counts the amount in cells. */
export const Densities: Story = {
  parameters: { compact: true },
  render: (args) => (
    <BothDensities>
      <div className="flex flex-col gap-4">
        <CapacityMeter {...args} />
        <CapacityMeter
          {...args}
          label="File system: photos"
          value={3.1}
          valueText="3.1 TiB of 3.6 TiB (86%)"
          threshold={{ status: "warning", label: "Almost full" }}
        />
        <CapacityMeter
          {...args}
          variant="compact"
          label="Usage of data"
          valueText="62% full, 1.4 TiB free"
        />
      </div>
    </BothDensities>
  ),
};

export const AtPhoneWidth: Story = {
  parameters: { compact: true },
  render: (args) => (
    <Phone>
      <div className="flex flex-col gap-4">
        <CapacityMeter {...args} />
        <CapacityMeter
          {...args}
          label="File system: media-archive-2019-and-older"
          value={3.1}
          valueText="3.1 TiB of 3.6 TiB (86%); over the 85% threshold"
          threshold={{ status: "warning", label: "Almost full" }}
        />
      </div>
    </Phone>
  ),
};
