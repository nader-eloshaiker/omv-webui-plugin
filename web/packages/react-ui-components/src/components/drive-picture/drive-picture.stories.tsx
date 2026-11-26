// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { KIND_NAME } from "../../fixtures/chart-fixtures";
import { DrivePicture } from "./drive-picture";
import type {
  DrivePictureShape,
  DrivePictureSize,
} from "./drive-picture-model";

const meta = {
  title: "Components/Drive picture",
  component: DrivePicture,
  args: { kind: "hdd", size: "tile" },
} satisfies Meta<typeof DrivePicture>;

export default meta;
type Story = StoryObj<typeof meta>;

const KINDS: readonly DrivePictureShape[] = ["hdd", "ssd", "nvme", "disk"];
const NAME: Record<DrivePictureShape, string> = {
  ...KIND_NAME,
  disk: "Kind not known",
};
const SIZES: readonly { size: DrivePictureSize; name: string }[] = [
  { size: "marker", name: "Marker" },
  { size: "tile", name: "Tile" },
  { size: "large", name: "Large" },
];

/**
 * Each kind at its three sizes, bottom-aligned and named, and the plain drive for a disk whose kind
 * was not read. The shape alone tells the kinds apart, in the text and divider inks only: no kind
 * takes a colour, and no drive has a light.
 */
export const Sheet: Story = {
  render: () => (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,14.5rem),1fr))] gap-x-8 gap-y-7 p-0">
      {KINDS.map((kind) => (
        <li key={kind} className="flex flex-col gap-3.5">
          <span className="text-body font-semibold text-foreground">
            {NAME[kind]}
          </span>
          <span className="flex flex-wrap items-end gap-x-5.5 gap-y-4">
            {SIZES.map((s) => (
              <span key={s.size} className="flex flex-col items-center gap-2">
                <span className="flex min-h-18 items-end justify-center">
                  <DrivePicture kind={kind} size={s.size} />
                </span>
                <span className="text-xs text-tertiary-foreground">
                  {s.name}
                </span>
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  ),
};

export const HardDisk: Story = { args: { kind: "hdd", size: "large" } };
export const Ssd: Story = { args: { kind: "ssd", size: "large" } };
export const NvmeStick: Story = { args: { kind: "nvme", size: "large" } };

/**
 * A disk whose kind was not read (asleep when the dashboard read the disks, or its Smart.getInformation
 * read failed): a plain body with a blank label, claiming no kind, in the hard disk's box.
 */
export const KindNotKnown: Story = { args: { kind: "disk", size: "large" } };

/** The marker beside its word, as in a key or a line of text. */
export const MarkerInText: Story = {
  render: () => (
    <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      {KINDS.map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <DrivePicture kind={kind} size="marker" />
          {NAME[kind]}
        </span>
      ))}
    </p>
  ),
};

/** On each ground a picture lands on: the page, a card and an inset. */
export const OnEachGround: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {[
        ["On the page", "bg-page"],
        ["On a card", "bg-surface ring-1 ring-border"],
        ["In an inset", "bg-muted"],
      ].map(([name, ground]) => (
        <div
          key={name}
          className={`flex flex-col gap-2 rounded-control p-3 ${ground ?? ""}`}
        >
          <span className="text-caption text-tertiary-foreground">{name}</span>
          <span className="flex items-end gap-3">
            {KINDS.map((kind) => (
              <DrivePicture key={kind} kind={kind} size="tile" />
            ))}
          </span>
        </div>
      ))}
    </div>
  ),
};
