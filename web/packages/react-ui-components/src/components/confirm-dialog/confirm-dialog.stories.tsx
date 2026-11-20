// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button } from "../button/button";
import { Identifier } from "../text/identifier";
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
    <Opener label="Apply 3 changes">
      {(open, setOpen) => (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Apply 3 changes?"
          description="SMB, SSH and Network restart. The network change moves the NAS to a new address, so this page stops responding: open the NAS at 192.0.2.20 afterwards."
          confirmLabel="Apply 3 changes"
          cancelLabel="Cancel"
          onConfirm={() => setOpen(false)}
        />
      )}
    </Opener>
  );
}

function UndoDemo() {
  return (
    <Opener label="Undo 3 changes">
      {(open, setOpen) => (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Undo 3 changes?"
          description="The saved changes to SMB, SSH and Network are discarded. The running settings stay as they are."
          confirmLabel="Undo 3 changes"
          cancelLabel="Cancel"
          onConfirm={() => setOpen(false)}
        />
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
    <Opener label="Delete shared folder…">
      {(open, setOpen) => (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          variant="destructive"
          title={
            <>
              Delete the shared folder <Identifier>old-scans</Identifier>?
            </>
          }
          description="Nothing uses it. The folder and its files stay on the disk; only the shared folder entry is removed."
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
    <Opener label="Wipe disk…">
      {(open, setOpen) => (
        <TypeToConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={
            <>
              Wipe disk <Identifier>/dev/sdc</Identifier>, WDC WD40EFRX, serial{" "}
              <Identifier>WD-EXAMPLE0001</Identifier>, 3.6{" "}TiB?
            </>
          }
          description="Everything on this disk is erased and cannot be recovered. Nothing in this system uses it: it has no file system that is mounted or shared."
          confirmLabel="Wipe disk"
          cancelLabel="Cancel"
          confirmText="/dev/sdc"
          prompt="Type /dev/sdc to confirm."
          onConfirm={() => setOpen(false)}
        />
      )}
    </Opener>
  );
}

export const Plain: Story = { render: () => <ApplyDemo /> };
export const UndoChanges: Story = { render: () => <UndoDemo /> };
export const Destructive: Story = { render: () => <DestructiveDemo /> };
export const DestructivePending: Story = {
  render: () => <DestructiveDemo pending />,
};
export const DestructiveFailed: Story = {
  render: () => (
    <DestructiveDemo error="The shared folder could not be deleted: the server did not answer within 30 seconds. Try again." />
  ),
};
export const TypeToConfirm: Story = { render: () => <WipeDemo /> };
