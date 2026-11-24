// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BothDensities, Phone, StoryCard } from "../../fixtures/story-frames";
import { CapacityRing, HealthRing, type HealthArea } from "./ring";

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
