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

// ---- The services slice's entries (phase 5 services design 2.7) ----------------------------------

// A router link in the app; a plain anchor here. Named in full, since several sit side by side.
function routerLink(href: string, name: string) {
  return (
    <a
      href={href}
      aria-label={name}
      className="rounded-sm text-sm text-link underline underline-offset-2 hover:no-underline"
    >
      Open
    </a>
  );
}

const rsyncServerEntry = {
  id: "rsyncd-photos",
  kind: "Offered to the rsync server as",
  name: "Photos",
  action: routerLink("#/services/rsync/server", "Open the rsync server"),
};

/** Offered to the rsync server: the name it is offered as, and a link to the rsync server page. */
export const OfferedToRsyncServer: Story = {
  args: {
    referrers: [rsyncServerEntry],
    blockedAction: {
      label: "Delete shared folder",
      reason:
        "It is offered to the rsync server as Photos. Stop offering it first.",
    },
  },
};

/** Copy jobs: the job's name as written (its note), in the body face, with a link to its page. */
export const CopiedByCopyJobs: Story = {
  args: {
    referrers: [
      {
        id: "job-1",
        kind: "Copied by the copy job",
        name: "Photos to Backup",
        nameStyle: "text",
        action: routerLink(
          "#/services/rsync/jobs/1",
          "Open the copy job Photos to Backup",
        ),
      },
      {
        id: "job-2",
        kind: "Copied to by the copy job",
        name: "Phone uploads from the garage NAS every night",
        nameStyle: "text",
        action: routerLink(
          "#/services/rsync/jobs/2",
          "Open the copy job Phone uploads from the garage NAS every night",
        ),
      },
    ],
  },
};

/** A job named in a right-to-left language, isolated so the row's order holds. */
export const CopyJobWithRightToLeftName: Story = {
  args: {
    referrers: [
      {
        id: "job-rtl",
        kind: "Copied by the copy job",
        name: "نسخ الصور إلى القرص الاحتياطي",
        nameStyle: "text",
        action: routerLink(
          "#/services/rsync/jobs/3",
          "Open the copy job نسخ الصور إلى القرص الاحتياطي",
        ),
      },
    ],
  },
};

/** An entry that is only a sentence and its link: the home folders. */
export const HomeFoldersEntry: Story = {
  args: {
    referrers: [
      {
        id: "home",
        kind: "Holds the home folders of everyone on this NAS.",
        action: routerLink(
          "#/usermgmt/settings",
          "Open the home folders setting",
        ),
      },
    ],
  },
};

/** Used by an add-on: one sentence, no link (design 2.7). */
export const UsedByAnAddOn: Story = {
  args: {
    unknownUse: {
      message: "Used by an add-on's setting. Look in the classic interface.",
    },
    blockedAction: {
      label: "Delete shared folder",
      reason: "An add-on's setting still uses it.",
    },
  },
};

/** Every kind at once, and many copy jobs. */
export const ManyEntries: Story = {
  args: {
    referrers: [
      {
        id: "smb-media",
        kind: "Shared with Windows and Mac computers.",
        name: "media",
      },
      rsyncServerEntry,
      ...Array.from({ length: 12 }, (_, i) => {
        const name = `Media to backup disk ${String(i + 1)}`;
        return {
          id: `job-${String(i)}`,
          kind:
            i % 3 === 0
              ? "Copied to by the copy job"
              : "Copied by the copy job",
          name,
          nameStyle: "text" as const,
          action: routerLink(
            `#/services/rsync/jobs/${String(i)}`,
            `Open the copy job ${name}`,
          ),
        };
      }),
      {
        id: "home",
        kind: "Holds the home folders of everyone on this NAS.",
        action: routerLink(
          "#/usermgmt/settings",
          "Open the home folders setting",
        ),
      },
    ],
    blockedAction: {
      label: "Delete shared folder",
      reason:
        "Stop sharing it, stop offering it to the rsync server and delete the 12 copy jobs that use it first.",
    },
  },
};
