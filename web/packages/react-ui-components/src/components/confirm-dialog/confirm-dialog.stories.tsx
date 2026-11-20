// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button } from "../button/button";
import { AlsoPendingNotice } from "../job-runner/job-runner";
import { ConfirmDialog, TypeToConfirmDialog } from "./confirm-dialog";

const meta = {
  title: "Components/Confirm dialog",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Opener({
  label,
  children,
}: {
  label: string;
  children: (open: boolean, setOpen: (o: boolean) => void) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="p-6">
      <Button variant="neutral" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {children(open, setOpen)}
    </div>
  );
}

function ApplyDemo() {
  return (
    <Opener label="Apply changes">
      {(open, setOpen) => (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Apply 3 pending changes?"
          description="SMB, SSH and Network restart. Applying the network change may end this connection; reload the page if it stops responding."
          confirmLabel="Apply changes"
          cancelLabel="Cancel"
          onConfirm={() => setOpen(false)}
        >
          <AlsoPendingNotice>
            Also pending from elsewhere: NFS
          </AlsoPendingNotice>
        </ConfirmDialog>
      )}
    </Opener>
  );
}

function DestructiveDemo({
  pending = false,
  error,
}: {
  pending?: boolean;
  error?: string;
}) {
  return (
    <Opener label="Delete shared folder">
      {(open, setOpen) => (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          variant="destructive"
          title="Delete shared folder media?"
          description="The folder's contents stay on the disk. 2 SMB shares and 1 rsync job use it and stop working."
          confirmLabel="Delete shared folder"
          cancelLabel="Cancel"
          pending={pending}
          error={error}
          onConfirm={() => setOpen(false)}
        />
      )}
    </Opener>
  );
}

function WipeDemo() {
  return (
    <Opener label="Wipe disk">
      {(open, setOpen) => (
        <TypeToConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Wipe disk /dev/sdb, WDC WD40EFRX, 3.6 TiB?"
          description="Everything on this disk is erased and cannot be recovered."
          confirmLabel="Wipe disk"
          cancelLabel="Cancel"
          confirmText="/dev/sdb"
          prompt="Type /dev/sdb to confirm."
          onConfirm={() => setOpen(false)}
        >
          <ul className="list-disc ps-5 text-base text-foreground">
            <li>File system data (ext4, 2.2 TiB used)</li>
            <li>Shared folders: media, photos</li>
          </ul>
        </TypeToConfirmDialog>
      )}
    </Opener>
  );
}

export const Plain: Story = { render: () => <ApplyDemo /> };
export const Destructive: Story = { render: () => <DestructiveDemo /> };
export const DestructivePending: Story = {
  render: () => <DestructiveDemo pending />,
};
export const DestructiveFailed: Story = {
  render: () => (
    <DestructiveDemo error="The shared folder is still referenced by the SMB share 'media'." />
  ),
};
export const TypeToConfirm: Story = { render: () => <WipeDemo /> };
