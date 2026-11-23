// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Identifier } from "../text/identifier";
import { DirectionSummary } from "./direction-summary";

// A shared folder's name, as the app draws it: text, medium weight, isolated, a router link where it
// is not the page itself (phase 5 services design 0.2). A plain anchor stands in for the router link.
function Folder({ name }: { name: string }) {
  return (
    <a
      href="#/storage/shared-folders"
      dir="auto"
      className="rounded-sm font-medium text-action-label underline underline-offset-2 hover:no-underline"
    >
      {name}
    </a>
  );
}

function Remote({ path, host }: { path: string; host: string }) {
  return (
    <span>
      <Identifier>{path}</Identifier> on <Identifier>{host}</Identifier>
    </span>
  );
}

const meta = {
  title: "Patterns/DirectionSummary",
  component: DirectionSummary,
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
  args: {
    fromLabel: "From",
    toLabel: "To",
    from: <Folder name="Photos" />,
    to: <Folder name="Backup" />,
    sentence: "Copies the files of Photos into Backup, both on this NAS.",
  },
} satisfies Meta<typeof DirectionSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both sides shared folders on this NAS. */
export const Local: Story = {};

/** From this NAS to another computer. */
export const Push: Story = {
  args: {
    from: <Folder name="Photos" />,
    to: <Remote path="/srv/copies/photos/" host="backup.example.org" />,
    sentence: (
      <>
        Copies Photos from this NAS to{" "}
        <Identifier>/srv/copies/photos/</Identifier> on{" "}
        <Identifier>backup.example.org</Identifier>.
      </>
    ),
  },
};

/** From another computer to this NAS. */
export const Pull: Story = {
  args: {
    from: <Remote path="Documents/" host="rsync://198.51.100.20" />,
    to: <Folder name="Office archive" />,
    sentence: (
      <>
        Copies <Identifier>Documents/</Identifier> on{" "}
        <Identifier>rsync://198.51.100.20</Identifier> to Office archive on this
        NAS.
      </>
    ),
  },
};

/** 200-character names wrap; nothing is cut short. */
export const LongNames: Story = {
  args: {
    from: (
      <Folder name="Family photos and videos from every holiday since 2009, sorted by year and then by trip, including the scans of the old slides from grandmother's attic and the wedding albums" />
    ),
    to: (
      <Remote
        path="/srv/dev-disk-by-uuid-7d3a5c1e-9b2f-4e8a-a1c0-3f6d2b8e9c41/copies/family-photos-and-videos/"
        host="offsite-backup-nas-in-the-garage-cupboard.home.example.org"
      />
    ),
    sentence:
      "Copies Family photos and videos from every holiday since 2009 from this NAS to the folder on offsite-backup-nas-in-the-garage-cupboard.home.example.org.",
  },
};

/** Right-to-left names in an English page: each name isolated, the arrow still left to right. */
export const RightToLeftNames: Story = {
  args: {
    from: <Folder name="صور العائلة" />,
    to: <Folder name="نسخة احتياطية" />,
    sentence: (
      <>
        Copies the files of <bdi>صور العائلة</bdi> into <bdi>نسخة احتياطية</bdi>
        , both on this NAS.
      </>
    ),
  },
};

/** A right-to-left page: the line runs right to left and the arrow points left. */
export const RightToLeftPage: Story = {
  args: {
    dir: "rtl",
    lang: "ar",
    fromLabel: "من",
    toLabel: "إلى",
    from: <Folder name="صور العائلة" />,
    to: <Folder name="نسخة احتياطية" />,
    sentence:
      "ينسخ ملفات صور العائلة إلى نسخة احتياطية، كلاهما على هذا الجهاز.",
  },
};

/** 320px wide. */
export const Narrow: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  args: {
    from: <Folder name="Photos" />,
    to: <Remote path="/srv/copies/photos/" host="backup.example.org" />,
    sentence:
      "Copies Photos from this NAS to /srv/copies/photos/ on backup.example.org.",
  },
};

/** Without the From and To words on the line, the sentence alone says the direction. */
export const WithoutLineWords: Story = {
  args: { fromLabel: undefined, toLabel: undefined },
};

/** Names that look like markup render as text. */
export const HostileNames: Story = {
  args: {
    from: <Folder name='<img src=x onerror="alert(1)">' />,
    to: <Folder name="<script>alert(2)</script>" />,
    sentence:
      'Copies the files of <img src=x onerror="alert(1)"> into <script>alert(2)</script>, both on this NAS.',
  },
};
