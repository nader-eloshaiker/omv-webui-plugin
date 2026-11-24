// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { BothDensities, Phone, StoryCard } from "../../fixtures/story-frames";
import {
  CapacityRing,
  CapacityRingSkeleton,
  HealthRing,
  HealthRingSkeleton,
  ProgressRing,
  type HealthArea,
} from "./ring";

const HEALTHY: HealthArea[] = [
  { id: "disks", label: "Disks", status: "ok", statusLabel: "4 OK" },
  { id: "fs", label: "File systems", status: "ok", statusLabel: "3 OK" },
  { id: "services", label: "Services", status: "ok", statusLabel: "Running" },
  { id: "network", label: "Network", status: "ok", statusLabel: "Connected" },
];
const WARNING: HealthArea[] = [
  { id: "disks", label: "Disks", status: "warning", statusLabel: "1 warning" },
  {
    id: "fs",
    label: "File systems",
    status: "warning",
    statusLabel: "1 almost full",
  },
  { id: "services", label: "Services", status: "ok", statusLabel: "Running" },
  {
    id: "network",
    label: "Network",
    status: "unknown",
    statusLabel: "Not checked yet",
  },
];

function Capacities() {
  return (
    <div className="flex flex-wrap gap-x-10 gap-y-6">
      <CapacityRing
        label="data"
        value={2.2}
        max={3.6}
        figure="62%"
        valueText="2.2 TiB of 3.6 TiB used"
      >
        ext4 · mirror of sda and sdb
      </CapacityRing>
      <CapacityRing
        label="photos"
        value={3.1}
        max={3.6}
        figure="86%"
        valueText="3.1 TiB of 3.6 TiB used"
        threshold={{ status: "warning", label: "Almost full" }}
      >
        Btrfs · sdc
      </CapacityRing>
      <CapacityRing
        label="archive"
        value={null}
        max={0}
        figure=""
        valueText="No reading: not mounted"
      >
        XFS · USB disk
      </CapacityRing>
    </div>
  );
}

const meta = {
  title: "Charts/Rings",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** A few capacities side by side: blue until the threshold, then the warning fill with its pill. */
export const CapacityRings: Story = {
  render: () => (
    <StoryCard title="Storage" className="max-w-4xl">
      <Capacities />
    </StoryCard>
  ),
};

export const CapacitySizes: Story = {
  render: () => (
    <StoryCard className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-8">
        {(["sm", "md", "lg"] as const).map((size) => (
          <CapacityRing
            key={size}
            size={size}
            label={`data (${size})`}
            value={2.2}
            max={3.6}
            figure="62%"
            valueText="2.2 TiB of 3.6 TiB"
          />
        ))}
      </div>
    </StoryCard>
  ),
};

/** A healthy NAS: four areas, all OK, in words beside the ring. */
export const HealthHealthy: Story = {
  render: () => (
    <StoryCard className="max-w-xl">
      <HealthRing
        size="lg"
        label="Health of this NAS"
        figure="OK"
        areas={HEALTHY}
      />
    </StoryCard>
  ),
};

/** One warning disk, one almost-full file system, and an area not checked yet (dashed, never calm). */
export const HealthWithWarning: Story = {
  render: () => (
    <StoryCard className="max-w-xl">
      <HealthRing
        size="lg"
        label="Health of this NAS"
        figure={<span className="text-warning-label">2 issues</span>}
        areas={WARNING}
      />
    </StoryCard>
  ),
};

/** A ring with one critical area. */
export const HealthCritical: Story = {
  render: () => (
    <StoryCard className="max-w-xl">
      <HealthRing
        label="Health of this NAS"
        figure="1 problem"
        areas={[
          {
            id: "disks",
            label: "Disks",
            status: "critical",
            statusLabel: "1 failing",
          },
          { id: "fs", label: "File systems", status: "ok", statusLabel: "OK" },
          {
            id: "services",
            label: "Services",
            status: "stopped",
            statusLabel: "1 stopped",
          },
        ]}
      />
    </StoryCard>
  ),
};

export const Densities: Story = {
  render: () => (
    <BothDensities>
      <StoryCard>
        <HealthRing
          label="Health of this NAS"
          figure="2 issues"
          areas={WARNING}
        />
        <Capacities />
      </StoryCard>
    </BothDensities>
  ),
};

export const AtPhoneWidth: Story = {
  render: () => (
    <Phone>
      <StoryCard>
        <HealthRing
          label="Health of this NAS"
          figure="2 issues"
          areas={WARNING}
        />
        <Capacities />
      </StoryCard>
    </Phone>
  ),
};

/**
 * A missing file system is Critical without a reading: the dashed ring in the critical stroke with
 * its icon, and the pill. Beside it, a reading that failed (Unknown, no pill) for comparison.
 */
export const KnownBadWithoutReading: Story = {
  render: () => (
    <StoryCard title="Storage" className="max-w-4xl">
      <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
        <CapacityRing
          label="Backups"
          value={null}
          max={100}
          figure=""
          valueText="Not found. Its disk may be disconnected or have failed."
          threshold={{ status: "critical", label: "Critical" }}
        >
          Warns at 90%
        </CapacityRing>
        <CapacityRing
          label="Media"
          value={null}
          max={100}
          figure=""
          valueText="Could not read how full it is"
        >
          No warning level set
        </CapacityRing>
      </div>
    </StoryCard>
  ),
};

/**
 * Each ring opens its file system: the whole tile is the target, with the neutral hover, the focus
 * ring round the tile and a chevron. The system drive has no page here, so it is not a link.
 */
export const LinkTiles: Story = {
  render: () => (
    <StoryCard title="Storage" className="max-w-4xl">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-6 gap-y-3">
        <li>
          <CapacityRing
            label="Data"
            value={87}
            max={100}
            figure="87%"
            valueText="87% full · 120 GiB free of 916 GiB"
            threshold={{ status: "warning", label: "Warning" }}
            link={<a href="#/storage/filesystems/data" />}
            linkLabel="Open file system Data"
          >
            Warns at 85%
          </CapacityRing>
        </li>
        <li>
          <CapacityRing
            label="Backups"
            value={null}
            max={100}
            figure=""
            valueText="Not found. Its disk may be disconnected or have failed."
            threshold={{ status: "critical", label: "Critical" }}
            link={<a href="#/storage/filesystems/backups" />}
            linkLabel="Open file system Backups"
          >
            Warns at 90%
          </CapacityRing>
        </li>
        <li>
          <CapacityRing
            label="Photos and home videos of the family, 2009 to now"
            value={41}
            max={100}
            figure="41%"
            valueText="41% full · 2.1 TiB free of 3.6 TiB"
            link={<a href="#/storage/filesystems/photos" />}
            linkLabel="Open file system Photos and home videos of the family, 2009 to now"
          >
            No warning level set
          </CapacityRing>
        </li>
        <li>
          <CapacityRing
            label="System drive"
            value={23}
            max={100}
            figure="23%"
            valueText="23% full · 45 GiB free of 58 GiB"
          >
            Where openmediavault is installed
          </CapacityRing>
        </li>
      </ul>
    </StoryCard>
  ),
};

/** The first steps' progress: a ring and its figure only, named by the card title beside it. */
export const Progress: Story = {
  render: function ProgressStory() {
    const titleId = React.useId();
    return (
      <StoryCard className="max-w-xl">
        <div className="flex items-center gap-3">
          <ProgressRing
            aria-labelledby={titleId}
            value={1}
            max={2}
            valueText="1 of 2 done"
            figure="1/2"
          />
          <h3 id={titleId} className="text-section text-foreground">
            First steps
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          {(["xs", "sm", "md"] as const).map((size, i) => (
            <ProgressRing
              key={size}
              size={size}
              aria-label={`First steps (${size})`}
              value={i}
              max={2}
              valueText={`${String(i)} of 2 done`}
              figure={`${String(i)}/2`}
            />
          ))}
        </div>
      </StoryCard>
    );
  },
};

/** While the first reads are in flight: the tracks breathe, with bars where the words go. */
export const Loading: Story = {
  render: () => (
    <StoryCard title="Storage" className="max-w-4xl">
      <HealthRingSkeleton size="lg" areas={4} />
      <div
        aria-busy="true"
        className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-6"
      >
        <CapacityRingSkeleton />
        <CapacityRingSkeleton />
        <CapacityRingSkeleton />
        <CapacityRingSkeleton size="sm" />
      </div>
      <p role="status" className="sr-only">
        Loading the file systems…
      </p>
    </StoryCard>
  ),
};
