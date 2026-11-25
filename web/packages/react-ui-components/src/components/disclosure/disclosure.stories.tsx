// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { CopyButton } from "../copy-button/copy-button";
import { TextareaField } from "../textarea-field/textarea-field";
import { Disclosure, DisclosurePanel, DisclosureTrigger } from "./disclosure";

const meta = {
  title: "Components/Disclosure",
  component: Disclosure,
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
} satisfies Meta<typeof Disclosure>;

export default meta;
type Story = StoryObj<typeof meta>;

const HINT =
  "These lines are added as they are to the SSH server's configuration file. A mistake can stop SSH from starting, so leave this empty unless you know you need it.";

export const Closed: Story = {
  render: () => (
    <Disclosure>
      <DisclosureTrigger>Advanced</DisclosureTrigger>
      <DisclosurePanel>
        <TextareaField mono label="Extra configuration lines" hint={HINT} />
      </DisclosurePanel>
    </Disclosure>
  ),
};

export const Open: Story = {
  render: () => (
    <Disclosure defaultOpen>
      <DisclosureTrigger>Advanced</DisclosureTrigger>
      <DisclosurePanel>
        <TextareaField mono label="Extra configuration lines" hint={HINT} />
      </DisclosurePanel>
    </Disclosure>
  ),
};

function CountedAdvanced() {
  const [value, setValue] = React.useState(
    "ClientAliveInterval 300\nMaxAuthTries 3",
  );
  const count = value.split("\n").filter((line) => line.trim() !== "").length;
  return (
    <Disclosure defaultOpen>
      <DisclosureTrigger>
        {count === 0
          ? "Advanced"
          : `Advanced (${String(count)} ${count === 1 ? "line" : "lines"} set)`}
      </DisclosureTrigger>
      <DisclosurePanel>
        <TextareaField
          mono
          label="Extra configuration lines"
          hint={HINT}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </DisclosurePanel>
    </Disclosure>
  );
}

/** The count is in the words, so a closed part still says it holds something. Edit the lines. */
export const WithCountInLabel: Story = { render: () => <CountedAdvanced /> };

const KEY =
  "AAAAC3NzaC1lZDI1NTE5AAAAIGq3x8Lr0Zk9vVxQm2uYtP4Jc7sWnE1fHbD6aR5oLmKz";

/** Inside running content: "Show full key" in Sky's link ink, a smaller target of 24px. */
export const Inline: Story = {
  render: () => (
    <div className="flex flex-col gap-1">
      <p className="font-medium">laptop-2024</p>
      <Disclosure>
        <p className="font-mono text-sm">
          {KEY.slice(0, 12)}…{KEY.slice(-12)}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <DisclosureTrigger variant="inline">Show full key</DisclosureTrigger>
          <CopyButton
            text={`ssh-ed25519 ${KEY} laptop-2024`}
            label="Copy key laptop-2024"
            copiedLabel="Copied"
            selectedLabel="Selected. Press Ctrl+C to copy."
            size="sm"
          >
            Copy key
          </CopyButton>
        </div>
        <DisclosurePanel>
          <p className="font-mono text-sm [overflow-wrap:anywhere]">
            ssh-ed25519 {KEY} laptop-2024
          </p>
        </DisclosurePanel>
      </Disclosure>
    </div>
  ),
};

/** Tab to the button: Enter and Space open and close it; focus stays on the button. */
export const Keyboard: Story = {
  render: () => (
    <Disclosure>
      <DisclosureTrigger autoFocus>Show all</DisclosureTrigger>
      <DisclosurePanel>
        <p className="text-muted-foreground">
          Family photos, scanned letters and the home videos from 2009 to 2024,
          sorted by year. Backed up to the second disk every night at 02:00.
        </p>
      </DisclosurePanel>
    </Disclosure>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Disclosure disabled>
      <DisclosureTrigger>Advanced</DisclosureTrigger>
      <DisclosurePanel>Hidden</DisclosurePanel>
    </Disclosure>
  ),
};
