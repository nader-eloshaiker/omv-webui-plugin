// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BellRing, ExternalLink, KeyRound, Lock, Play } from "lucide-react";
import * as React from "react";
import { Phone } from "../../fixtures/story-frames";
import { Button } from "../button/button";
import {
  FactListItem,
  FactListLabel,
  FactListValue,
} from "../fact-list/fact-list";
import { Icon } from "../icon/icon";
import { NasFacts } from "../nas-facts/nas-facts";
import { Panel } from "../panel/panel";
import { Shortcuts, ShortcutsItem } from "../shortcuts/shortcuts";
import { FirstSteps, type FirstStep } from "./first-steps";

const NBSP = "\u00a0";

const STEPS: FirstStep[] = [
  {
    id: "name",
    title: "Name the NAS",
    detail: "Your computers see it as nas on your network.",
    actionLabel: "Rename",
    done: true,
  },
  {
    id: "password",
    title: "Change the factory password",
    detail: "The factory password may still work.",
    actionLabel: "Change",
    done: false,
  },
  {
    id: "https",
    title: "Turn on secure sign-in",
    detail:
      "Then your password never crosses the network in the clear (HTTPS).",
    actionLabel: "Turn on",
    done: false,
  },
  {
    id: "alerts",
    title: "Get alerts by email",
    detail:
      "The NAS writes to you when a disk starts to fail, before files are lost.",
    actionLabel: "Set up",
    done: false,
  },
];

/**
 * The dashboard's footer (rethink 6.2 E): first steps as a checklist (a tick or an empty circle, no
 * numbers), or Shortcuts in their place, beside This NAS. Compact density drops each step's line.
 */
const meta = {
  title: "Patterns/First steps",
  component: FirstSteps,
  args: {
    title: "First steps",
    progress: (done: number, total: number) =>
      `${String(done)} of ${String(total)} done`,
    stateLabels: { done: "done", notDone: "not done" },
    steps: STEPS,
  },
} satisfies Meta<typeof FirstSteps>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The current step's button is the screen's filled accent. */
export const ExistingNas: Story = {};

/** Something else holds the filled accent: the current step is outlined. */
export const Outlined: Story = { args: { accent: "outline" } };

export const AtPhoneWidth: Story = {
  decorators: [(Story) => <Phone>{Story()}</Phone>],
};

/** A step done while the page is open draws its tick (7.2, "A first step lands"). */
export const AStepLands: Story = {
  parameters: { matrix: false },
  render: function Lands(args) {
    const [done, setDone] = React.useState(1);
    return (
      <div className="flex flex-col gap-4">
        <Button
          variant="neutral"
          size="sm"
          className="self-start"
          onClick={() => {
            setDone((d) => (d >= STEPS.length ? 1 : d + 1));
          }}
        >
          Finish the next step
        </Button>
        <FirstSteps
          {...args}
          steps={STEPS.map((s, i) => ({ ...s, done: i < done }))}
        />
      </div>
    );
  },
};

/** When the steps are done or tips are off: what the map does not offer, as text actions. */
export const ShortcutsInTheirPlace: Story = {
  render: () => (
    <Shortcuts title="Shortcuts">
      <ShortcutsItem icon={<KeyRound />}>
        Change the factory password
      </ShortcutsItem>
      <ShortcutsItem icon={<Lock />}>Turn on secure sign-in</ShortcutsItem>
      <ShortcutsItem icon={<BellRing />}>Get alerts by email</ShortcutsItem>
      <ShortcutsItem icon={<Icon name="person" mark="create" size={20} />}>
        Add a person
      </ShortcutsItem>
      <ShortcutsItem icon={<Icon name="group" mark="create" size={20} />}>
        Add a group
      </ShortcutsItem>
      <ShortcutsItem
        icon={<ExternalLink />}
        render={<a href="#classic" target="_blank" rel="noopener noreferrer" />}
      >
        Open the classic interface
      </ShortcutsItem>
    </Shortcuts>
  ),
};

function Facts({ layout }: { layout?: "grid" | "row" }) {
  return (
    <NasFacts
      title="This NAS"
      layout={layout}
      action={
        <Button variant="plain" size="sm">
          <Play aria-hidden="true" />
          Show me around
        </Button>
      }
    >
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
      <FactListItem>
        <FactListLabel>Time on the NAS</FactListLabel>
        <FactListValue>Thu 19 Nov, 11:50</FactListValue>
      </FactListItem>
      <FactListItem span="full">
        <FactListLabel>Updates</FactListLabel>
        <FactListValue>33 to install</FactListValue>
      </FactListItem>
    </NasFacts>
  );
}

/** This NAS: facts from System.getInformation in two columns, label over value. */
export const ThisNas: Story = {
  render: () => (
    <div className="max-w-md">
      <Facts />
    </div>
  ),
};

/** This NAS alone across the width, when the steps moved up on a new NAS. */
export const ThisNasInARow: Story = { render: () => <Facts layout="row" /> };

/** The footer as the page lays it out: 8 of 12 for the steps, 4 of 12 for the facts. */
export const Footer: Story = {
  render: (args) => (
    <div className="@container/page">
      <div className="grid grid-cols-1 gap-x-14 gap-y-9 @min-[60rem]/page:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <FirstSteps {...args} />
        <Facts />
      </div>
    </div>
  ),
};

/** A new NAS's four first steps, none done yet. */
const NEW_NAS_STEPS: FirstStep[] = [
  {
    id: "storage",
    title: "Add storage",
    detail: "Storage is a disk made ready to keep files.",
    actionLabel: "Add storage",
    done: false,
  },
  {
    id: "folder",
    title: "Add a shared folder",
    detail: "Your computers open it like any folder, for example Photos.",
    actionLabel: "Add a shared folder",
    done: false,
  },
  {
    id: "https",
    title: "Turn on secure sign-in",
    detail:
      "Then your password never crosses the network in the clear (HTTPS).",
    actionLabel: "Turn on",
    done: false,
  },
  {
    id: "alerts",
    title: "Get alerts by email",
    detail:
      "The NAS writes to you when a disk starts to fail, before files are lost.",
    actionLabel: "Set up",
    done: false,
  },
];

/**
 * Across, on a new NAS: the four steps laid across the full row on a raised panel, each with its
 * words over its button, the buttons on one line. It takes 60rem of the list's own width, so this
 * story follows the toolbar for theme and density instead of drawing four panels side by side.
 */
export const Across: Story = {
  parameters: { matrix: false },
  args: { layout: "across", steps: NEW_NAS_STEPS },
  render: (args) => (
    <Panel>
      <FirstSteps {...args} />
    </Panel>
  ),
};

/** Across with the first step done: its tick, and the next step's button takes the accent. */
export const AcrossOneDone: Story = {
  parameters: { matrix: false },
  args: {
    layout: "across",
    steps: NEW_NAS_STEPS.map((s, i) => ({ ...s, done: i === 0 })),
  },
  render: (args) => (
    <Panel>
      <FirstSteps {...args} />
    </Panel>
  ),
};

/** Across in a narrower region (each of the four panels here, or a phone): the list as usual. */
export const AcrossWhenNarrow: Story = {
  args: { layout: "across", steps: NEW_NAS_STEPS },
  render: (args) => (
    <Panel className="max-w-2xl">
      <FirstSteps {...args} />
    </Panel>
  ),
};
