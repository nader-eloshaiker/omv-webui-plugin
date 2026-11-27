// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { HealthList, HealthListItem, HealthListSkeleton } from "./health-list";

const meta = {
  title: "Components/Health list",
  component: HealthList,
  decorators: [
    (Story) => (
      <div className="max-w-md rounded-card border border-border bg-surface p-4">
        {Story()}
      </div>
    ),
  ],
} satisfies Meta<typeof HealthList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Disks: Story = {
  render: () => (
    <HealthList>
      <HealthListItem
        status="critical"
        statusLabel="Critical"
        name="/dev/sda"
        nameVariant="identifier"
        detail="Example HDD 4TB, 3.6 TiB, 41 °C"
        reason="Many damaged areas (bad sectors). It may fail soon. Copy your data off it and replace it."
      />
      <HealthListItem
        status="warning"
        statusLabel="Warning"
        name="/dev/sdb"
        nameVariant="identifier"
        detail="Example HDD 4TB, 3.6 TiB"
        reason="It was once used outside its safe limits, for example too hot. It reports no problem now."
        note="Monitoring off"
      />
      <HealthListItem
        status="unknown"
        statusLabel="Unknown"
        name="/dev/sdc"
        nameVariant="identifier"
        detail="VMware Virtual SATA Hard Drive, 8.0 GiB"
        reason="Its health could not be read."
        note="Monitoring off"
      />
      <HealthListItem
        status="ok"
        statusLabel="OK"
        name="/dev/nvme0n1"
        nameVariant="identifier"
        detail="VMware Virtual NVMe Disk, 20.0 GiB, 30 °C"
      />
    </HealthList>
  ),
};

export const Services: Story = {
  render: () => (
    <HealthList>
      <HealthListItem
        status="critical"
        statusLabel="Critical"
        name="SSH"
        reason="On, but not running."
      />
      <HealthListItem
        status="pending"
        statusLabel="Not applied yet"
        name="NFS"
        reason="Changed settings are waiting to be applied."
      />
      <HealthListItem status="ok" statusLabel="OK" name="SMB/CIFS" />
    </HealthList>
  ),
};

export const LongNames: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => (
    <HealthList>
      <HealthListItem
        status="critical"
        statusLabel="Critical"
        name="/dev/disk/by-uuid/00000000-0000-4000-8000-000000000031"
        nameVariant="identifier"
        reason="Missing. Its disk may be disconnected or have failed."
      />
      <HealthListItem
        status="ok"
        statusLabel="OK"
        name="A plugin's service with a long translated title from the server"
      />
      <HealthListItem
        status="unknown"
        statusLabel="Unknown"
        name="<b>markup-looking</b> name, shown as text"
        reason="Health reading not recognised."
      />
    </HealthList>
  ),
};

export const Loading: Story = {
  render: () => <HealthListSkeleton rows={3} />,
};
