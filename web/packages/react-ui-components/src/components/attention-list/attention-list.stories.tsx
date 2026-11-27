// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Phone } from "../../fixtures/story-frames";
import { Button } from "../button/button";
import { AttentionList, type AttentionItem } from "./attention-list";

const NBSP = "\u00a0";

const SDB: AttentionItem = {
  id: "sdb",
  health: "warning",
  healthLabel: "Warning",
  title: "Disk sdb reports a problem",
  detail: "Backup keeps working on its other disk, sdc. Plan to replace sdb.",
  actionLabel: "See what to do",
};
const FULL: AttentionItem = {
  id: "data",
  health: "warning",
  healthLabel: "Warning",
  title: "Data drive is almost full",
  detail: `92${NBSP}% used, 290${NBSP}GiB left. Photos, Music and Documents are on it.`,
  actionLabel: "See what uses space",
};
const RESTART: AttentionItem = {
  id: "restart",
  health: "warning",
  healthLabel: "Warning",
  title: "The NAS needs a restart",
  detail: "Updates finish installing when it restarts.",
  actionLabel: "Restart",
};
const CLOCK: AttentionItem = {
  id: "clock",
  health: "unknown",
  healthLabel: "Unknown",
  title: "The clocks differ by 4 days",
  detail: "Schedules and logs will show the wrong time.",
  actionLabel: "Check the time",
};
const FAILING: AttentionItem = {
  id: "sda",
  health: "critical",
  healthLabel: "Critical",
  title: "Disk sda is failing",
  detail:
    "Data drive and the 3 shared folders on it are at risk. Copy what matters to another drive now.",
  actionLabel: "See what to do",
};

/**
 * What needs the person (rethink 6.2 B): rows on the ground, worst first, the worst row's button the
 * filled accent and the others outlined; three, then "N more".
 */
const meta = {
  title: "Patterns/Attention list",
  component: AttentionList,
  args: {
    label: "What needs you",
    items: [SDB, FULL, RESTART, CLOCK],
    moreLabel: (n: number) => `${String(n)} more`,
    fewerLabel: "Show fewer",
  },
} satisfies Meta<typeof AttentionList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FourThings: Story = {};

/** A critical item given last still leads. */
export const CriticalFirst: Story = { args: { items: [RESTART, FAILING] } };

/** Another region holds the screen's filled accent: every button is outlined. */
export const NotTheAccent: Story = { args: { items: [SDB], accent: false } };

/** Text from the backend renders as text. */
export const InertText: Story = {
  args: {
    items: [
      { ...RESTART, title: "<img src=x onerror=alert(1)> needs a restart" },
    ],
  },
};

export const AtPhoneWidth: Story = {
  decorators: [(Story) => <Phone>{Story()}</Phone>],
};

/** A problem arrives and rises in at its place; when it resolves it folds away (7.6). */
export const ArrivesAndResolves: Story = {
  parameters: { matrix: false },
  render: function Arrives(args) {
    const [items, setItems] = React.useState<AttentionItem[]>([RESTART]);
    const has = items.some((i) => i.id === "sdb");
    return (
      <div className="flex flex-col gap-4">
        <Button
          variant="neutral"
          size="sm"
          className="self-start"
          onClick={() => {
            setItems(has ? [RESTART] : [RESTART, SDB]);
          }}
        >
          {has ? "It resolves" : "A problem arrives"}
        </Button>
        <AttentionList {...args} items={items} />
      </div>
    );
  },
};
