// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExternalLink } from "lucide-react";
import { Button } from "../button/button";
import { UsedByPanel } from "./used-by-panel";

const meta = {
  title: "Patterns/Used by",
  component: UsedByPanel,
  decorators: [(Story) => <div className="max-w-lg">{Story()}</div>],
  args: {
    title: "Used by",
    emptyText: "Nothing uses this shared folder. It can be deleted.",
    referrers: [],
  },
} satisfies Meta<typeof UsedByPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const open = (
  <Button variant="ghost" size="sm">
    Open
  </Button>
);

export const Referrers: Story = {
  args: {
    referrers: [
      { id: "smb-1", kind: "SMB share", name: "media", action: open },
      { id: "nfs-1", kind: "NFS share", name: "/export/media", action: open },
      {
        id: "rsync-1",
        kind: "Rsync job",
        name: "nightly to backup-nas",
        action: open,
      },
    ],
    blockedAction: {
      label: "Delete shared folder",
      reason: "Remove the 2 shares and the rsync job that use it first.",
    },
  },
};

export const NothingUsesIt: Story = {};

export const UsedByUnknown: Story = {
  args: {
    unknownUse: {
      message: "Used by an add-on or setting this interface does not show yet.",
      classicLink: (
        <a
          href="/#/storage/shared-folders"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-action-label underline underline-offset-2"
        >
          See it in the classic interface
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </a>
      ),
    },
    blockedAction: {
      label: "Delete shared folder",
      reason: "Something this interface does not show yet still uses it.",
    },
  },
};

export const HostileName: Story = {
  args: {
    referrers: [
      {
        id: "smb-x",
        kind: "SMB share",
        name: '<img src=x onerror="alert(1)">',
      },
    ],
  },
};
