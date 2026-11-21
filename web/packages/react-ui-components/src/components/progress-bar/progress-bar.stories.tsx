// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusPill } from "../status/status";
import { Identifier } from "../text/identifier";
import { ProgressBar } from "./progress-bar";

// Render functions rather than `args`: the bar's name is a union (a visible label, or an aria-label,
// or aria-labelledby), which Storybook's args typing cannot express.
const meta = {
  title: "Components/Progress bar",
  decorators: [
    (Story) => (
      <div className="max-w-md rounded-card border border-border bg-surface p-4">
        {Story()}
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** A sync with the percentage and the time left, as an array's page shows it. */
export const KnownWithTimeLeft: Story = {
  render: () => (
    <ProgressBar
      label="Synchronising RAID md0"
      value={45}
      valueText="45.0% done, about 2 hours left"
    />
  ),
};

/** The server gave a percentage but no finish time. */
export const KnownWithoutTimeLeft: Story = {
  render: () => (
    <ProgressBar
      label="Rebuilding onto /dev/sdc"
      value={87.3}
      valueText="87.3% done"
    />
  ),
};

/**
 * A check, whose progress is not known: a third-width bar that pulses. Under
 * `prefers-reduced-motion` the same bar stands still and the words say it is working.
 */
export const Indeterminate: Story = {
  render: () => (
    <ProgressBar label="Checking RAID md1" value={null} valueText="Working…" />
  ),
};

/**
 * In a 36px table row at 320px: the state pill, its reason, and the compact bar under the reason with
 * the same figures as text. The reason names the bar, so it carries no label of its own.
 */
export const CompactInNarrowRow: Story = {
  render: () => (
    <div className="flex w-80 max-w-full flex-col gap-1 border-y border-border py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusPill status="warning">Warning</StatusPill>
        <span id="md0-reason" className="min-w-0 text-sm text-foreground">
          Synchronising its disks. Its files can be used, but it is not fully
          protected until this ends.
        </span>
      </div>
      <ProgressBar
        aria-labelledby="md0-reason"
        value={45}
        valueText="45.0% done, about 2 hours left"
        size="compact"
      />
    </div>
  ),
};

/** Compact and indeterminate, for an array being checked, in the same narrow width. */
export const CompactIndeterminate: Story = {
  render: () => (
    <div className="flex w-80 max-w-full flex-col gap-1 border-y border-border py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusPill status="ok">OK</StatusPill>
        <span id="md1-reason" className="min-w-0 text-sm text-foreground">
          Being checked. This can take hours.
        </span>
      </div>
      <ProgressBar
        aria-labelledby="md1-reason"
        value={null}
        valueText="Working…"
        size="compact"
      />
    </div>
  ),
};

/** Long words wrap under the bar and never widen it or hide behind a tooltip. */
export const LongValueText: Story = {
  render: () => (
    <div className="w-80 max-w-full">
      <ProgressBar
        label={
          <>
            Being reshaped to use the added disks:{" "}
            <Identifier>
              /dev/md/archive-of-family-photos-and-home-videos
            </Identifier>
          </>
        }
        value={3.2}
        valueText="3.2% done, about 1 day 14 hours left. Do not turn off the NAS until this ends; the array keeps serving its files meanwhile, more slowly than usual."
      />
    </div>
  ),
};

/** Markup-looking words render as text. */
export const MarkupLookingText: Story = {
  render: () => (
    <ProgressBar
      aria-label="Synchronising"
      value={12}
      valueText={'<img src=x onerror="alert(1)"> 12.0% done'}
      size="compact"
    />
  ),
};
