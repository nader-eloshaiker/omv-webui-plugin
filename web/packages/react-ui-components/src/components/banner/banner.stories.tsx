// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LockOpen } from "lucide-react";
import * as React from "react";
import { Button } from "../button/button";
import { ConfirmDialog } from "../confirm-dialog/confirm-dialog";
import { NoticeBanner } from "./notice-banner";
import { PendingBanner, type PendingBannerProps } from "./pending-banner";

const meta = {
  title: "Components/Banner",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const pending: PendingBannerProps = {
  label: "Pending changes",
  message: "3 pending changes: SMB, SSH, Network",
  applyLabel: "Apply 3 changes",
  undoLabel: "Undo 3 changes",
  onApply: () => undefined,
  onUndo: () => undefined,
  showProgress: { label: "Show progress", onShow: () => undefined },
};

export const Pending: Story = { render: () => <PendingBanner {...pending} /> };

export const Applying: Story = {
  render: () => (
    <PendingBanner
      {...pending}
      state="applying"
      applyingMessage="Applying changes to SMB, SSH, Network…"
    />
  ),
};

export const ApplyFailed: Story = {
  render: () => (
    <PendingBanner
      {...pending}
      state="failed"
      failedMessage="Applying the changes failed: SMB could not be restarted. 3 changes are still pending."
      retryLabel="Try applying again"
    />
  ),
};

// The band never undoes on its own: Undo opens a plain confirmation naming what is lost, with focus on
// Cancel and no typing (owner's decision, 2026-11-20).
function UndoHookUp() {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <PendingBanner {...pending} onUndo={() => setOpen(true)} />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Undo 3 changes?"
        description="The saved changes to SMB, SSH and Network are discarded. The running settings stay as they are."
        confirmLabel="Undo 3 changes"
        cancelLabel="Cancel"
        onConfirm={() => setOpen(false)}
      />
    </>
  );
}

export const UndoAsksFirst: Story = { render: () => <UndoHookUp /> };

export const LongList: Story = {
  render: () => (
    <div className="max-w-md">
      <PendingBanner
        {...pending}
        message="9 pending changes: SMB, SSH, Network, NFS, Rsync, Scheduled jobs, Notifications, Power management, Certificates"
        applyLabel="Apply 9 changes"
        undoLabel="Undo 9 changes"
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
          Use a secure connection (HTTPS)
        </Button>
      }
    >
      This connection is not encrypted. Passwords you type here can be read by
      others on the network.
    </NoticeBanner>
  ),
};
