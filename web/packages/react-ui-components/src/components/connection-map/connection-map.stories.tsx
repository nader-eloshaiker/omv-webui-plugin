// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BothDensities, Phone, StoryCard } from "../../fixtures/story-frames";
import { ConnectionMap, type ConnectionMapColumn } from "./connection-map";

const open = () => {
  // A story stands in for the router.
};

function storage(warning: boolean): ConnectionMapColumn[] {
  return [
    {
      id: "disks",
      title: "Disks",
      nodes: [
        { id: "sda", label: "sda", detail: "3.6 TiB · 38 °C", feeds: ["data"] },
        warning
          ? {
              id: "sdb",
              label: "sdb",
              detail: "3.6 TiB · 47 °C",
              status: "warning",
              statusLabel: "Warning",
              feeds: ["data"],
            }
          : {
              id: "sdb",
              label: "sdb",
              detail: "3.6 TiB · 39 °C",
              feeds: ["data"],
            },
        {
          id: "sdc",
          label: "sdc",
          detail: "7.3 TiB · 36 °C",
          feeds: ["backup"],
        },
        {
          id: "sdd",
          label: "sdd",
          detail: "1.8 TiB · USB",
          status: "unknown",
          statusLabel: "Not checked",
          feeds: ["archive"],
        },
      ],
    },
    {
      id: "fs",
      title: "File systems",
      nodes: [
        {
          id: "data",
          label: "data",
          detail: "62% full · ext4, mirror",
          feeds: ["photos", "music", "family-documents"],
          ...(warning
            ? { status: "warning" as const, statusLabel: "Disk warning" }
            : {}),
        },
        {
          id: "backup",
          label: "backup",
          detail: "15% full · ZFS",
          feeds: ["copies"],
        },
        {
          id: "archive",
          label: "archive",
          detail: "22% full · XFS",
          feeds: [],
        },
      ],
    },
    {
      id: "folders",
      title: "Shared folders",
      nodes: [
        {
          id: "photos",
          label: "Photos",
          detail: "Windows, Mac and Linux",
          feeds: ["smb", "nfs"],
          onSelect: open,
        },
        {
          id: "music",
          label: "Music",
          detail: "Windows and Mac",
          feeds: ["smb"],
          onSelect: open,
        },
        {
          id: "family-documents",
          label: "Family documents and scanned letters",
          detail: "Windows and Mac",
          feeds: ["smb"],
          onSelect: open,
        },
        {
          id: "copies",
          label: "Copies",
          detail: "Not shared",
          feeds: [],
          off: true,
          onSelect: open,
        },
      ],
    },
    {
      id: "sharing",
      title: "Shared with",
      nodes: [
        {
          id: "smb",
          label: "Windows and Mac",
          detail: "SMB · running",
          feeds: ["family", "guests"],
        },
        {
          id: "nfs",
          label: "Linux and Unix",
          detail: "NFS · running",
          feeds: ["family"],
        },
      ],
    },
    {
      id: "people",
      title: "People",
      nodes: [
        { id: "family", label: "family", detail: "4 people · read and write" },
        { id: "guests", label: "guests", detail: "Read only" },
      ],
    },
  ];
}

const feedsLabel = (names: readonly string[]) => `→ ${names.join(", ")}`;

const meta = {
  title: "Diagrams/Connection map",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** A healthy NAS. Point at or tab to any node: its lineage lights and the rest dims. Only folders open. */
export const Healthy: Story = {
  render: () => (
    <StoryCard title="How your storage is shared" className="max-w-6xl">
      <ConnectionMap
        aria-label="How your storage is shared"
        columns={storage(false)}
        feedsLabel={feedsLabel}
        keyboardHint="Use the arrow keys to move between items."
      />
    </StoryCard>
  ),
};

/** A warning disk: the lines to it, and from it to what it holds, take the warning colour, with its icon and word. */
export const WarningDisk: Story = {
  render: () => (
    <StoryCard title="How your storage is shared" className="max-w-6xl">
      <ConnectionMap
        aria-label="How your storage is shared"
        columns={storage(true)}
        feedsLabel={feedsLabel}
        keyboardHint="Use the arrow keys to move between items."
      />
    </StoryCard>
  ),
};

/** A folder's own share map: from the disks to the people who can reach it. */
export const OneFolder: Story = {
  render: () => (
    <StoryCard title="Who can reach Photos" className="max-w-4xl">
      <ConnectionMap
        aria-label="Who can reach Photos"
        feedsLabel={feedsLabel}
        columns={[
          {
            id: "fs",
            title: "Lives on",
            nodes: [
              {
                id: "data",
                label: "data",
                detail: "ext4 on sda and sdb",
                feeds: ["photos"],
              },
            ],
          },
          {
            id: "folder",
            title: "Folder",
            nodes: [
              {
                id: "photos",
                label: "Photos",
                detail: "/Photos",
                feeds: ["smb", "nfs"],
              },
            ],
          },
          {
            id: "how",
            title: "How",
            nodes: [
              {
                id: "smb",
                label: "Windows and Mac",
                detail: "SMB",
                feeds: ["family"],
                onSelect: open,
              },
              {
                id: "nfs",
                label: "Linux and Unix",
                detail: "NFS",
                feeds: ["family"],
                onSelect: open,
              },
            ],
          },
          {
            id: "who",
            title: "Who",
            nodes: [
              { id: "family", label: "family", detail: "Read and write" },
            ],
          },
        ]}
      />
    </StoryCard>
  ),
};

/** At 390px the lines drop; each node says in words what it feeds. */
export const AtPhoneWidth: Story = {
  render: () => (
    <Phone>
      <StoryCard title="How your storage is shared">
        <ConnectionMap
          aria-label="How your storage is shared"
          columns={storage(true)}
          feedsLabel={feedsLabel}
        />
      </StoryCard>
    </Phone>
  ),
};

export const Densities: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <BothDensities>
        <StoryCard>
          <ConnectionMap
            aria-label="How your storage is shared"
            columns={storage(true).slice(0, 3)}
            feedsLabel={feedsLabel}
          />
        </StoryCard>
      </BothDensities>
    </div>
  ),
};

/** Names that look like markup are drawn as text. */
export const MarkupLookingNames: Story = {
  render: () => (
    <StoryCard className="max-w-3xl">
      <ConnectionMap
        aria-label="Map"
        feedsLabel={feedsLabel}
        columns={[
          {
            id: "a",
            title: "File systems",
            nodes: [{ id: "x", label: "<b>data</b>", feeds: ["y"] }],
          },
          {
            id: "b",
            title: "Shared folders",
            nodes: [{ id: "y", label: "<img src=x onerror=alert(1)>" }],
          },
        ]}
      />
    </StoryCard>
  ),
};
