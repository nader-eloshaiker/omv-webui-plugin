// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus } from "lucide-react";
import { Button } from "../button/button";
import { Identifier } from "../text/identifier";
import { EmptyState } from "./empty-state";

const meta = {
  title: "Components/Empty state",
  component: EmptyState,
  decorators: [
    (Story) => (
      <div className="max-w-lg rounded-card border border-border bg-surface">
        {Story()}
      </div>
    ),
  ],
  args: { children: "" },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    title: "No shared folders yet",
    children:
      "A shared folder is a place on a disk that people and services can use.",
    action: (
      <Button>
        <Plus aria-hidden="true" />
        Add shared folder
      </Button>
    ),
  },
};

export const Filtered: Story = {
  args: {
    variant: "filtered",
    children: (
      <>
        No shared folders match <Identifier>photos-2019</Identifier>.
      </>
    ),
    action: <Button variant="neutral">Clear the search</Button>,
  },
};

export const CouldNotRead: Story = {
  args: {
    variant: "error",
    title: "Could not read the disks",
    children:
      "The list of disks did not load. Nothing was changed. Try again; if it keeps failing, the server's message below helps a search or a support request.",
    serverMessage: {
      label: "Message from the server",
      text: "Failed to execute command 'export PATH=/bin:/sbin:/usr/bin:/usr/sbin; smartctl --xall /dev/sdb': exit code 2",
    },
    action: <Button variant="neutral">Try again</Button>,
  },
};
