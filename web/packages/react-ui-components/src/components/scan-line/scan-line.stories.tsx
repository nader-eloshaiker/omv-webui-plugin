// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { scanAreas } from "../../fixtures/nas-front-fixtures";
import { Phone } from "../../fixtures/story-frames";
import { ScanLine, type ScanLineArea } from "./scan-line";

const meta = {
  title: "Components/Scan line",
  component: ScanLine,
  args: {
    label: "The NAS at a glance",
    areas: scanAreas({ checked: false }),
  },
} satisfies Meta<typeof ScanLine>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A later visit before the disk health check: the disks Not checked in the Unknown ink, the rest OK,
 * each with its short count.
 */
export const BeforeCheck: Story = {};

/** After the check: every area OK. */
export const AfterCheck: Story = {
  args: { areas: scanAreas({ checked: true }) },
};

/** Something needs the person: the Data drive past its warning mark. */
export const StorageAlmostFull: Story = {
  args: { areas: scanAreas({ checked: true, almostFull: true }) },
};

/** A new NAS: only the system drive, and no shared folders yet. */
export const NewNas: Story = {
  args: { areas: scanAreas({ checked: false, newNas: true }) },
};

/** A disk failing its health check, and the network down: the Critical and Unknown inks. */
export const DiskFailing: Story = {
  args: {
    areas: scanAreas({ checked: true }).map((area): ScanLineArea =>
      area.id === "disks"
        ? {
            ...area,
            tone: "critical",
            status: "Failing",
            value: "sdb reports bad sectors",
          }
        : area.id === "network"
          ? {
              ...area,
              tone: "unknown",
              status: "Not connected",
              value: "enp2s0",
            }
          : area,
    ),
  },
};

/** At a phone's width the areas sit two by two. */
export const Narrow: Story = {
  render: (args) => (
    <Phone>
      <ScanLine {...args} />
    </Phone>
  ),
};

/**
 * Each value is a link to its part of the page: pressing one scrolls there, moves focus to it and
 * rings it once with the arrival highlight. The story renders four times, so its targets carry ids
 * of their own in each panel.
 */
export const JumpsToItsPart: Story = {
  render: (args) => <WithTargets {...args} />,
};

function WithTargets(args: React.ComponentProps<typeof ScanLine>) {
  const id = React.useId();
  const disks = `${id}-disks`;
  const map = `${id}-map`;
  const areas = args.areas.map((area) => ({
    ...area,
    targetId: area.id === "disks" ? disks : map,
  }));
  return (
    <div className="flex flex-col gap-gutter">
      <ScanLine {...args} areas={areas} />
      <div
        id={map}
        tabIndex={-1}
        className="rounded-card p-card text-muted-foreground outline-hidden surface-raised"
      >
        The map of your NAS
      </div>
      <div
        id={disks}
        tabIndex={-1}
        className="rounded-card p-card text-muted-foreground outline-hidden surface-raised"
      >
        The disk temperatures
      </div>
    </div>
  );
}
