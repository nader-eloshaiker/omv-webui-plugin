// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../button/button";
import { Field, FieldControl, FieldHint, FieldLabel } from "../field/field";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

const meta = {
  title: "Components/Dialog",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Form: Story = {
  render: () => (
    <div className="p-6">
      <Dialog defaultOpen>
        <DialogTrigger render={<Button variant="neutral" />}>
          Add shared folder
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add shared folder</DialogTitle>
            <DialogDescription>
              Saving adds it to the pending changes; nothing is applied yet.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldControl placeholder="e.g. media" />
            <FieldHint>The name clients see on the network.</FieldHint>
          </Field>
          <DialogFooter>
            <DialogClose render={<Button variant="neutral" />}>
              Cancel
            </DialogClose>
            <Button>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  ),
};
