// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, userEvent, within } from "storybook/test";
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

const WHAT_GOES = {
  title: "What goes",
  items: [
    "Their account and password: alex can no longer sign in here, or open shared folders from their computers.",
    "Their administrator rights.",
    "Their SSH sign-in.",
    "Their membership of family, photography.",
    "Their email address on this NAS, alex@example.org.",
  ],
};

const WHAT_STAYS = {
  title: "What stays",
  items: [
    "Their files, wherever they are on the NAS. The files keep their old owner, who is then shown as a number. A person you add later may be given the same number and so become the owner of these files.",
    "Their home folder, alex in the homes folder, with everything in it. If you add a person called alex again, they get this folder.",
  ],
};

/** Delete a person (phase 5 users design 7.3): the lists, the access checkbox, then the typed name. */
function DeletePersonDemo({ ticked = true }: { ticked?: boolean }) {
  const [checked, setChecked] = React.useState(ticked);
  return (
    <Opener label="Delete alex…">
      {(open, setOpen) => (
        <TypeToConfirmDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            setChecked(ticked);
          }}
          title={
            <>
              Delete <Identifier>alex</Identifier>?
            </>
          }
          sections={[WHAT_GOES, WHAT_STAYS]}
          checkbox={{
            label:
              "Also take alex off the access lists of 2 shared folders: Photos, Music.",
            hint: "If you leave this, those folders keep an entry for alex, and a person you add later with the same name gets that access.",
            note: "After this, nobody can open Photos from other computers: alex was the only one with access.",
            checked,
            onCheckedChange: setChecked,
          }}
          confirmLabel="Delete person"
          cancelLabel="Cancel"
          confirmText="alex"
          prompt="Type alex to confirm."
          onConfirm={() => setOpen(false)}
        >
          <p className="text-sm text-foreground">
            Scheduled jobs, the Rsync server or add-ons set to use alex stop
            working for them. This page cannot list them; look in the classic
            interface.
          </p>
        </TypeToConfirmDialog>
      )}
    </Opener>
  );
}

/** Delete a group (11.2): destructive, no typed name, a sentence, and the access checkbox. */
function DeleteGroupDemo({ members = true }: { members?: boolean }) {
  const [checked, setChecked] = React.useState(true);
  return (
    <Opener label="Delete the group family…">
      {(open, setOpen) => (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          variant="destructive"
          title={
            <>
              Delete the group <Identifier>family</Identifier>?
            </>
          }
          description={
            members
              ? "2 people are taken out of it: alex, sam. They stay on the NAS, but lose the access the group gave them: Photos (Read and write), Music (Read only)."
              : "Nobody is in it."
          }
          checkbox={{
            label:
              "Also take family off the access lists of 2 shared folders: Photos, Music.",
            hint: "If you leave this, those folders keep an entry for family, and a group you add later with the same name gets that access.",
            checked,
            onCheckedChange: setChecked,
          }}
          confirmLabel="Delete group"
          cancelLabel="Cancel"
          onConfirm={() => setOpen(false)}
        />
      )}
    </Opener>
  );
}

/** A plain (not destructive) confirmation with lists. */
function PlainWithListsDemo() {
  return (
    <Opener label="Apply 2 changes">
      {(open, setOpen) => (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Apply 2 changes?"
          description="Computers that are connected now may need to connect again."
          sections={[
            {
              title: "What restarts",
              items: ["Windows and Mac sharing (SMB)", "Network discovery"],
            },
          ]}
          confirmLabel="Apply 2 changes"
          cancelLabel="Cancel"
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
export const PlainWithLists: Story = { render: () => <PlainWithListsDemo /> };
/** Lists, the access checkbox ticked (its note shown), and the typed name, not yet typed. */
export const DeletePerson: Story = { render: () => <DeletePersonDemo /> };
export const DeletePersonCheckboxNotTicked: Story = {
  render: () => <DeletePersonDemo ticked={false} />,
};
/** The name typed: the confirm button becomes available. */
export const DeletePersonTyped: Story = {
  render: () => <DeletePersonDemo />,
  play: async () => {
    // The dialog is portalled out of the story's canvas, so it is found from the document.
    const body = within(document.body);
    await userEvent.type(
      await body.findByRole("textbox", { name: "Type alex to confirm." }),
      "alex",
    );
    await expect(
      body.getByRole("button", { name: "Delete person" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  },
};
export const DeleteGroup: Story = { render: () => <DeleteGroupDemo /> };
export const DeleteGroupWithoutMembers: Story = {
  render: () => <DeleteGroupDemo members={false} />,
};
/**
 * 320px (Storybook's "mobile1" viewport): the lists, the checkbox and its note wrap inside the
 * dialog, which scrolls within the screen's height.
 */
export const DeletePersonNarrow: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <DeletePersonDemo />,
};
