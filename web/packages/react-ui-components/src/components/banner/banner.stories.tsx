// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LockOpen } from "lucide-react";
import { Button } from "../button/button";
import { NoticeBanner } from "./notice-banner";
import { PendingBanner } from "./pending-banner";

const meta = {
  title: "Components/Banner",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const pending = {
  label: "Pending changes",
  message: "3 pending changes: SMB, SSH, Network",
  applyLabel: "Apply",
  revertLabel: "Revert",
  onApply: () => undefined,
  onRevert: () => undefined,
};

export const Pending: Story = { render: () => <PendingBanner {...pending} /> };

export const PendingApplying: Story = {
  render: () => (
    <PendingBanner
      {...pending}
      applying
      applyingMessage="Applying changes to SMB, SSH, Network..."
    />
  ),
};

export const PendingLongList: Story = {
  render: () => (
    <div className="max-w-md">
      <PendingBanner
        {...pending}
        message="9 pending changes: SMB, SSH, Network, NFS, Rsync, Scheduled jobs, Notifications, Power management, Certificates"
      />
    </div>
  ),
};

export const UnencryptedConnection: Story = {
  render: () => (
    <NoticeBanner
      label="Connection notice"
      icon={<LockOpen />}
      action={
        <Button variant="neutral" size="sm">
          Turn on HTTPS
        </Button>
      }
    >
      This connection is not encrypted. Passwords you type here can be read by
      others on the network.
    </NoticeBanner>
  ),
};
