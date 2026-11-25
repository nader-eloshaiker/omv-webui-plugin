// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { BothDensities, Phone, StoryCard } from "../../fixtures/story-frames";
import { Button } from "../button/button";
import { DriveBay, DriveBaySkeleton, type DriveSlot } from "./drive-bay";

const HEALTHY: DriveSlot[] = [
  {
    id: "sda",
    device: "sda",
    kind: "hdd",
    status: "ok",
    statusLabel: "OK",
    role: "data",
  },
  {
    id: "sdb",
    device: "sdb",
    kind: "hdd",
    status: "ok",
    statusLabel: "OK",
    role: "data",
  },
  {
    id: "sdc",
    device: "sdc",
    kind: "hdd",
    status: "ok",
    statusLabel: "OK",
    role: "backup",
  },
  {
    id: "nvme0n1",
    device: "nvme0n1",
    kind: "ssd",
    status: "ok",
    statusLabel: "OK",
    role: "System",
  },
];
const TROUBLE: DriveSlot[] = [
  HEALTHY[0] as DriveSlot,
  {
    id: "sdb",
    device: "sdb",
    kind: "hdd",
    status: "warning",
    statusLabel: "Warning",
    role: "data",
  },
  {
    id: "sdc",
    device: "sdc",
    kind: "hdd",
    status: "critical",
    statusLabel: "Failing",
    role: "backup",
  },
  HEALTHY[3] as DriveSlot,
  {
    id: "sdd",
    device: "sdd",
    kind: "usb",
    status: "unknown",
    statusLabel: "Not checked",
    role: "USB copy",
  },
  {
    id: "sde",
    device: "sde",
    kind: "hdd",
    status: "ok",
    statusLabel: "OK",
    role: "Not used",
  },
];

const meta = {
  title: "Drawings/Drive bay",
  component: DriveBay,
  args: { "aria-label": "The disks in this NAS", name: "nas", slots: HEALTHY },
  decorators: [
    (Story) => <StoryCard className="max-w-3xl">{Story()}</StoryCard>,
  ],
} satisfies Meta<typeof DriveBay>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};
/** A warning disk, a failing one and a USB disk that is not checked: each with its light, icon and word. */
export const WarningDisk: Story = { args: { slots: TROUBLE } };
/**
 * After "View disk sdb": a ring appears round that slot once, holds still for about a second and
 * fades out (under reduced motion it is shown still, then removed without the fade). Reload the
 * story to see it again.
 */
export const Arrived: Story = { args: { slots: TROUBLE, arrived: "sdb" } };
export const AtPhoneWidth: Story = {
  args: { slots: TROUBLE },
  decorators: [(Story) => <Phone>{Story()}</Phone>],
};
export const Densities: Story = {
  args: { slots: TROUBLE },
  decorators: [(Story) => <BothDensities>{Story()}</BothDensities>],
};

/**
 * The dashboard's bay before a disk check: the disk list has no rotation rate, so every caddy has the
 * generic face; each slot links to its disk; the detail line gives the temperature or "Asleep".
 */
const UNCHECKED: DriveSlot[] = [
  { id: "sda", device: "sda", role: "System", detail: "34\u00a0°C" },
  { id: "sdb", device: "sdb", role: "Data", detail: "41\u00a0°C" },
  { id: "sdc", device: "sdc", role: "Data", detail: "Asleep" },
  { id: "sdd", device: "sdd", role: "Empty" },
  { id: "nvme0n1", device: "nvme0n1", role: "Pool tank", detail: "38\u00a0°C" },
].map((slot) => ({
  ...slot,
  kind: slot.device.startsWith("nvme") ? "ssd" : "disk",
  status: "unknown",
  statusLabel: "Not checked",
  link: <a href={`#/storage/disks/${slot.device}`} />,
}));

const CHECKED: DriveSlot[] = UNCHECKED.map((slot) => {
  if (slot.id === "sdb") {
    return { ...slot, status: "warning", statusLabel: "Warning" };
  }
  if (slot.id === "sdd") {
    return { ...slot, status: "unknown", statusLabel: "No reading" };
  }
  return { ...slot, status: "ok", statusLabel: "OK" };
});

export const LinkedWithDetails: Story = { args: { slots: UNCHECKED } };

/**
 * The disk check's result lands: the lights change from the hollow ring to their state in turn, a
 * slot at a time (at once under reduced motion). Press the button to run it again.
 */
export const CheckResultLands: Story = {
  render: function CheckStory(args) {
    const [checked, setChecked] = React.useState(false);
    return (
      <div className="flex flex-col items-start gap-3">
        <Button
          variant="neutral"
          onClick={() => {
            setChecked((c) => !c);
          }}
        >
          {checked ? "Forget the result" : "Check disk health"}
        </Button>
        <DriveBay {...args} slots={checked ? CHECKED : UNCHECKED} />
      </div>
    );
  },
};

/** While the disk list is read: caddy-shaped placeholders in the chassis. */
export const Loading: Story = {
  render: () => (
    <div aria-busy="true">
      <DriveBaySkeleton slots={4} />
      <p role="status" className="sr-only">
        Loading the disks…
      </p>
    </div>
  ),
};

/** Twelve slots, the most the dashboard shows, at a phone's width: they wrap four across. */
export const TwelveAtPhoneWidth: Story = {
  args: {
    slots: Array.from({ length: 12 }, (_, i) => ({
      id: `sd${String.fromCharCode(97 + i)}`,
      device: `sd${String.fromCharCode(97 + i)}`,
      kind: "disk" as const,
      status: i === 7 ? ("critical" as const) : ("ok" as const),
      statusLabel: i === 7 ? "Critical" : "OK",
      role: i === 0 ? "System" : "RAID md0",
      detail: i === 3 ? "Asleep" : `${String(30 + i)}\u00a0°C`,
      link: <a href={`#/storage/disks/sd${String.fromCharCode(97 + i)}`} />,
    })),
  },
  decorators: [(Story) => <Phone>{Story()}</Phone>],
};
