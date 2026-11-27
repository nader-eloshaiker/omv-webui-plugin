// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  FactListItem,
  FactListLabel,
  FactListValue,
} from "../fact-list/fact-list";
import { NasFacts } from "../nas-facts/nas-facts";
import { Panel } from "./panel";
import { panelClass } from "./panel-class";

const NBSP = " ";

/**
 * The grounds a page region sits on: `raised` for what is read and moves as one, `plate` for a
 * drawing on its own sheet. A panel groups what the person reads as one; it is never a card by habit
 * (style guide 10, rule 7).
 */
const meta = {
  title: "Components/Panel",
  component: Panel,
  args: {
    title: "Disk temperatures",
    note: "Read at 10:31.",
  },
} satisfies Meta<typeof Panel>;
export default meta;
type Story = StoryObj<typeof meta>;

function Readings() {
  return (
    <ul className="grid gap-1 text-body text-foreground tabular-nums">
      <li>{`sda, hard disk: 36${NBSP}°C`}</li>
      <li>{`sdb, hard disk: 35${NBSP}°C`}</li>
      <li>{`nvme0n1, NVMe SSD: 41${NBSP}°C`}</li>
    </ul>
  );
}

/** Raised, titled: a `section` named by its title, the note beside it. */
export const Raised: Story = {
  render: (args) => (
    <Panel {...args}>
      <Readings />
    </Panel>
  ),
};

/** The plate: the muted ground with no shadow, the sheet the NAS map is drawn on. */
export const Plate: Story = {
  args: { ground: "plate", title: "Your NAS", note: undefined },
  render: (args) => (
    <Panel {...args}>
      <p className="text-body text-muted-foreground">
        Disks, the storage made of them and the shared folders on it, drawn as
        one map.
      </p>
    </Panel>
  ),
};

/** No title: a ground around a component that carries its own heading. */
export const Untitled: Story = {
  args: { title: undefined, note: undefined },
  render: (args) => (
    <Panel {...args}>
      <h2 className="mb-2 text-section text-foreground">What needs you</h2>
      <p className="text-body text-muted-foreground">
        Data drive is 92 % full, past its warning mark of 85 %.
      </p>
    </Panel>
  ),
};

/** The ground put on a region component itself, with `panelClass`, instead of wrapping it. */
export const OnARegion: Story = {
  render: () => (
    <NasFacts title="This NAS" className={panelClass()}>
      <FactListItem>
        <FactListLabel>Name</FactListLabel>
        <FactListValue variant="identifier">nas</FactListValue>
      </FactListItem>
      <FactListItem>
        <FactListLabel>Version</FactListLabel>
        <FactListValue>8.6.1-1</FactListValue>
      </FactListItem>
      <FactListItem>
        <FactListLabel>Running for</FactListLabel>
        <FactListValue>{`5${NBSP}h 25${NBSP}min`}</FactListValue>
      </FactListItem>
    </NasFacts>
  ),
};

/** A long title and note wrap; the note drops under the title rather than squeezing it. */
export const LongTitle: Story = {
  args: {
    title: "Processor, memory and the network port enp2s0 right now",
    note: "Since 10:31, a reading every 2 seconds, while this page is open.",
  },
  render: (args) => (
    <Panel {...args}>
      <Readings />
    </Panel>
  ),
};

/** Words that look like markup are shown as text. */
export const InertText: Story = {
  args: { title: "<b>Backup</b>", note: "<script>alert(1)</script>" },
  render: (args) => (
    <Panel {...args}>
      <Readings />
    </Panel>
  ),
};
