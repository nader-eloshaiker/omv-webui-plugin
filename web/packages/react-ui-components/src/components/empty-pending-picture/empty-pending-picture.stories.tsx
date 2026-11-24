// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BothDensities, Phone, StoryCard } from "../../fixtures/story-frames";
import { EmptyPendingPicture } from "./empty-pending-picture";

const meta = {
  title: "Drawings/Empty pending",
  component: EmptyPendingPicture,
  args: {
    children:
      "Nothing is waiting. When you save a setting, it waits here until you apply it, so you can change several things and apply them together.",
  },
  decorators: [
    (Story) => (
      <StoryCard title="Changes waiting" className="max-w-xl">
        {Story()}
      </StoryCard>
    ),
  ],
} satisfies Meta<typeof EmptyPendingPicture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const AtPhoneWidth: Story = {
  decorators: [(Story) => <Phone>{Story()}</Phone>],
};
export const Densities: Story = {
  decorators: [(Story) => <BothDensities>{Story()}</BothDensities>],
};
