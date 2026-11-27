// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  FRONT_BAYS,
  FRONT_BOARD,
  FRONT_GROUPS,
  FRONT_HOST,
  FRONT_LABELS,
  NEW_FRONT_GROUPS,
} from "../../fixtures/nas-front-fixtures";
import { Phone } from "../../fixtures/story-frames";
import { Button } from "../button/button";
import { NasFront } from "./nas-front";
import { nasFrontGroups } from "./nas-front-model";

const meta = {
  title: "Components/NAS front",
  component: NasFront,
  args: {
    host: FRONT_HOST,
    bays: FRONT_BAYS,
    board: FRONT_BOARD,
    groups: FRONT_GROUPS,
    size: "large",
    label: FRONT_LABELS.large,
  },
} satisfies Meta<typeof NasFront>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Wide enough for the large drawing at full size, as the welcome's column gives it. */
function Wide({ children }: { children: React.ReactNode }) {
  return <div className="w-full max-w-[40rem]">{children}</div>;
}

/** Replays a motion by mounting the drawing again, as Show me around does on the page. */
function Replay({
  label,
  children,
}: {
  label: string;
  children: (key: number) => React.ReactNode;
}) {
  const [run, setRun] = React.useState(0);
  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        variant="neutral"
        size="sm"
        onClick={() => {
          setRun((n) => n + 1);
        }}
      >
        {label}
      </Button>
      {children(run)}
    </div>
  );
}

/**
 * The welcome's drawing of a NAS in use: five disks in their bays with their words, the NVMe stick in
 * its M.2 slot on the board, and the brackets naming what each run of disks makes, sde not in use.
 */
export const Large: Story = {
  render: (args) => (
    <Wide>
      <NasFront {...args} />
    </Wide>
  ),
};

/** A new NAS: every disk ready for storage, under one dashed bracket. */
export const LargeNewNas: Story = {
  args: { groups: NEW_FRONT_GROUPS },
  render: Large.render,
};

/** No NVMe stick: the chassis has the bays alone, and no board. */
export const LargeWithoutNvme: Story = {
  args: { board: [] },
  render: Large.render,
};

/** Four disks in two mirrors, the drawing scaling its bays to the columns. */
export const LargeFourDisks: Story = {
  args: (() => {
    const bays = FRONT_BAYS.slice(0, 4);
    return {
      bays,
      board: [],
      groups: nasFrontGroups(bays, (_, i) =>
        i < 2
          ? { id: "photos", name: "Photos mirror", tech: "RAID 1" }
          : { id: "backup", name: "Backup mirror", tech: "RAID 1" },
      ),
    };
  })(),
  render: Large.render,
};

/** The first visit: the disks rise into their bays, the stick goes down into its socket, the brackets draw. */
export const LargeAssembling: Story = {
  args: { assemble: true },
  render: (args) => (
    <Replay label="Play the first visit">
      {(run) => (
        <Wide>
          <NasFront key={run} {...args} />
        </Wide>
      )}
    </Replay>
  ),
};

/** At a phone's width the drawing tightens: smaller gaps, shorter bays, no kind and size. */
export const LargeNarrow: Story = {
  render: (args) => (
    <Phone>
      <NasFront {...args} />
    </Phone>
  ),
};

/** Words longer than a bay wrap under it; text that looks like markup is shown as text. */
export const LargeLongWords: Story = {
  args: {
    host: "nas-living-room",
    bays: FRONT_BAYS.map((bay, i) =>
      i === 0 ? { ...bay, detail: "<b>Not read</b>" } : bay,
    ),
    groups: nasFrontGroups(FRONT_BAYS, (_, i) =>
      i < 4
        ? {
            id: "media",
            name: "Family photos and home videos",
            tech: "ZFS pool, RAID-Z1",
          }
        : { id: "unused", name: "Not in use", dashed: true },
    ),
  },
  render: Large.render,
};

/** Beside a later answer, before the disk health check: each caddy dashed in the Unknown stroke. */
export const SmallBeforeCheck: Story = {
  args: {
    size: "small",
    checked: false,
    groups: [],
    label: FRONT_LABELS.before,
  },
};

/** After the check, the result having come with the page: each caddy in the drawing's own line. */
export const SmallAfterCheck: Story = {
  args: {
    size: "small",
    checked: true,
    groups: [],
    label: FRONT_LABELS.after,
  },
};

/** The result arriving while the page is open: each solid outline wipes over its dashed one in turn. */
export const SmallResultLanding: Story = {
  args: {
    size: "small",
    checked: true,
    landed: true,
    groups: [],
    label: FRONT_LABELS.after,
  },
  render: (args) => (
    <Replay label="Play the result arriving">
      {(run) => <NasFront key={run} {...args} />}
    </Replay>
  ),
};

/** The small drawing without an NVMe stick. */
export const SmallWithoutNvme: Story = {
  args: {
    size: "small",
    checked: false,
    board: [],
    groups: [],
    label: FRONT_LABELS.before,
  },
};
