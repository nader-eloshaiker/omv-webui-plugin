// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../button/button";
import { ExternalLink } from "../external-link/external-link";
import { UsedByPanel } from "./used-by-panel";

const meta = {
  title: "Patterns/Used by",
  component: UsedByPanel,
  decorators: [(Story) => <div className="max-w-lg">{Story()}</div>],
  args: {
    title: "Used by",
    emptyText: "Nothing uses this shared folder.",
    referrers: [],
  },
} satisfies Meta<typeof UsedByPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// Every row's control is named in full: three "Open" buttons side by side would be indistinguishable.
function open(name: string) {
  return (
    <Button variant="ghost" size="sm" aria-label={`Open ${name}`}>
      Open
    </Button>
  );
}

const blocked = {
  label: "Delete shared folder",
  reason: "Remove the 2 shares and the rsync job that use it first.",
};

export const Referrers: Story = {
  args: {
    referrers: [
      {
        id: "smb-1",
        kind: "SMB share",
        name: "media",
        action: open("SMB share media"),
      },
      {
        id: "nfs-1",
        kind: "NFS share",
        name: "/export/media",
        action: open("NFS share /export/media"),
      },
      {
        id: "rsync-1",
        kind: "Rsync job",
        name: "nightly-to-backup-nas-in-the-garage-cupboard",
        action: open("Rsync job nightly-to-backup-nas-in-the-garage-cupboard"),
      },
    ],
    blockedAction: blocked,
  },
};

export const NothingUsesIt: Story = {};

export const Loading: Story = {
  args: { loading: { label: "Checking what uses this shared folder…" } },
};

export const CouldNotCheck: Story = {
  args: {
    error: {
      message:
        "Could not check whether anything uses this shared folder. Until it is checked, do not delete it.",
      serverMessage: {
        label: "Message from the server",
        text: "The request timed out after 30 seconds.",
      },
      retryLabel: "Check again",
      onRetry: () => undefined,
    },
  },
};

export const PartlyChecked: Story = {
  args: {
    referrers: [
      {
        id: "smb-1",
        kind: "SMB share",
        name: "media",
        action: open("SMB share media"),
      },
    ],
    partial: {
      message:
        "Rsync jobs could not be checked, so this list may be incomplete.",
      retryLabel: "Check again",
      onRetry: () => undefined,
    },
    blockedAction: {
      ...blocked,
      reason: "Remove the share that uses it first.",
    },
  },
};

export const UsedByUnknown: Story = {
  args: {
    unknownUse: {
      message: "Used by an add-on or setting this interface does not show yet.",
      classicLink: (
        <ExternalLink
          href="/#/storage/shared-folders"
          newTabLabel="(opens in a new tab)"
        >
          See it in the classic interface
        </ExternalLink>
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

// A shared folder's own SMB share (phase 5 shares design 0.7): a named entry with what it is and no
// link, since the folder's page shows the share in its own section.
export const SharedWithWindowsAndMac: Story = {
  args: {
    referrers: [
      {
        id: "smb-media",
        kind: "Shared with Windows and Mac computers.",
        name: "media",
      },
    ],
    blockedAction: {
      label: "Delete shared folder",
      reason: "Stop sharing it with Windows and Mac computers first.",
    },
  },
};

// Used by something this page cannot read yet, said in words with no link (shares design 0.7, P15).
export const UsedByUnknownWithoutLink: Story = {
  args: {
    unknownUse: {
      message:
        "Used by a setting this page does not show: an NFS share, a backup job, the Rsync server, the home folders setting or an add-on. Look in the classic interface.",
    },
  },
};
