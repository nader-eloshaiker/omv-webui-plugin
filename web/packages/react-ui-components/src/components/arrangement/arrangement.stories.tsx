// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BothDensities, Phone, StoryCard } from "../../fixtures/story-frames";
import { Arrangement, type ArrangementOption } from "./arrangement";

const OPTIONS: ArrangementOption[] = [
  {
    id: "mirror",
    kind: "mirror",
    disks: 2,
    title: "Mirror",
    usable: "Half the space: 3.6\u00a0TiB from two 3.6\u00a0TiB disks",
    survives: "Keeps working when one disk fails",
    whenFailing: "Nothing is lost: the other disk has every block.",
    current: true,
  },
  {
    id: "stripe",
    kind: "stripe",
    disks: 2,
    title: "Stripe",
    usable: "All the space: 7.2\u00a0TiB from two 3.6\u00a0TiB disks",
    survives: "Any disk failing loses everything",
    whenFailing:
      "Half of every file was on the failed disk: all of it is lost.",
  },
  {
    id: "parity",
    kind: "parity",
    disks: 3,
    title: "Parity (RAID 5, RAID-Z1)",
    usable: "Two thirds: 7.2\u00a0TiB from three 3.6\u00a0TiB disks",
    survives: "Keeps working when one disk fails",
    whenFailing:
      "Nothing is lost: the missing blocks are rebuilt from parity (P).",
  },
];

const meta = {
  title: "Drawings/Arrangement",
  component: Arrangement,
  args: {
    options: OPTIONS,
    question: "What happens if a disk fails?",
    showFailingLabel: "Show a disk failing",
    hideFailingLabel: "Bring the disk back",
    currentLabel: "pool uses this",
    parityLetter: "P",
  },
  decorators: [
    (Story) => <StoryCard className="max-w-5xl">{Story()}</StoryCard>,
  ],
} satisfies Meta<typeof Arrangement>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Compare: Story = {};
/** One disk greyed and crossed; only the stripe's blocks go dashed red, because only there is data lost. */
export const DiskFailing: Story = { args: { defaultFailing: true } };
/** Before creating a pool of four disks: the parity layout with the real count. */
export const FourDiskParity: Story = {
  args: {
    options: [
      {
        id: "parity4",
        kind: "parity",
        disks: 4,
        title: "Parity across four disks",
        usable: "Three quarters: 10.9\u00a0TiB from four 3.6\u00a0TiB disks",
        survives: "Keeps working when one disk fails",
        whenFailing:
          "Nothing is lost: the missing blocks are rebuilt from parity (P).",
      },
    ],
  },
};
export const AtPhoneWidth: Story = {
  decorators: [(Story) => <Phone>{Story()}</Phone>],
};
export const Densities: Story = {
  decorators: [(Story) => <BothDensities>{Story()}</BothDensities>],
};
