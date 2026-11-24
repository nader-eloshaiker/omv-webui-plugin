// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Phone, StoryCard } from "../../fixtures/story-frames";
import { DeletePicture } from "./delete-picture";

const meta = {
  title: "Drawings/Delete picture",
  component: DeletePicture,
  args: {
    item: "Photos",
    dependents: [
      { id: "smb", label: "Windows share" },
      { id: "job", label: "Copy job: nightly to backup" },
    ],
    caption:
      "Photos and its files are deleted; the Windows share and the copy job that use it stop working.",
  },
  decorators: [
    (Story) => (
      <StoryCard title="Delete Photos and its files" className="max-w-lg">
        {Story()}
      </StoryCard>
    ),
  ],
} satisfies Meta<typeof DeletePicture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TwoDependents: Story = {};
export const ManyDependents: Story = {
  args: {
    dependents: [
      { id: "smb", label: "Windows share" },
      { id: "nfs", label: "Linux share (NFS)" },
      { id: "job", label: "Copy job: nightly to backup" },
      { id: "home", label: "Home folders of 4 people" },
    ],
    caption:
      "Photos and its files are deleted; its Windows and Linux shares, the nightly copy job and 4 home folders stop working.",
  },
};
/** Nothing uses it: only the crossed folder. */
export const NothingDepends: Story = {
  args: {
    dependents: [],
    caption: "Photos and its files are deleted. Nothing else uses it.",
  },
};
export const AtPhoneWidth: Story = {
  decorators: [(Story) => <Phone>{Story()}</Phone>],
};
