// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BothDensities, Phone, StoryCard } from "../../fixtures/story-frames";
import { DriveBay, type DriveSlot } from "./drive-bay";

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
/** After "View disk sdb": that slot rings twice (a still ring under reduced motion). */
export const Arrived: Story = { args: { slots: TROUBLE, arrived: "sdb" } };
export const AtPhoneWidth: Story = {
  args: { slots: TROUBLE },
  decorators: [(Story) => <Phone>{Story()}</Phone>],
};
export const Densities: Story = {
  args: { slots: TROUBLE },
  decorators: [(Story) => <BothDensities>{Story()}</BothDensities>],
};
