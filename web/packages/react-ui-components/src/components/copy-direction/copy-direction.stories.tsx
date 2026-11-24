// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Phone, StoryCard } from "../../fixtures/story-frames";
import { CopyDirection } from "./copy-direction";

const meta = {
  title: "Drawings/Copy direction",
  component: CopyDirection,
  args: {
    from: "Photos",
    to: "backup.example.org",
    sentence: "Copies Photos from this NAS to backup.example.org.",
    detail: "Every night at 02:00",
  },
  decorators: [
    (Story) => <StoryCard className="max-w-xl">{Story()}</StoryCard>,
  ],
} satisfies Meta<typeof CopyDirection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The dash travels twice on arrival, then rests as a plain arrow: the job is not running. */
export const Push: Story = {};
export const Pull: Story = {
  args: {
    from: "/srv/exports/scans on scanner.example.org",
    to: "Family documents and scanned letters",
    sentence:
      "Copies /srv/exports/scans on scanner.example.org to Family documents and scanned letters on this NAS.",
    detail: "Every hour",
  },
};
export const AtPhoneWidth: Story = {
  args: Pull.args,
  decorators: [(Story) => <Phone>{Story()}</Phone>],
};
