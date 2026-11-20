// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextareaField } from "./textarea-field";

const HINT =
  "These lines are added as they are to the SSH server's configuration file. A mistake can stop SSH from starting, so leave this empty unless you know you need it.";

const meta = {
  title: "Components/TextareaField",
  component: TextareaField,
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
  args: { label: "Extra configuration lines", hint: HINT, mono: true },
} satisfies Meta<typeof TextareaField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Filled: Story = {
  args: {
    defaultValue:
      "ClientAliveInterval 300\nClientAliveCountMax 2\nMaxAuthTries 3",
  },
};

export const Focus: Story = {
  args: { autoFocus: true, defaultValue: "AllowGroups ssh" },
};

export const Invalid: Story = {
  args: {
    defaultValue: "Port 22",
    error: "Set the port in the Port field above, not here.",
  },
};

export const Disabled: Story = {
  args: {
    defaultValue: "MaxSessions 4",
    disabled: true,
    hint: "Turn on SSH to change this.",
  },
};

/** Starts at 4 lines, grows as lines are added, and scrolls past 12. Type to see it grow. */
export const AutoGrowToMaximum: Story = {
  args: {
    defaultValue: Array.from(
      { length: 16 },
      (_, line) => `# Line ${String(line + 1)} of a long block of options`,
    ).join("\n"),
  },
};

/** Prose, not configuration: the interface face, with spell checking left on. */
export const Prose: Story = {
  args: {
    label: "Description",
    hint: "A note about this shared folder, such as what it holds.",
    mono: false,
    rows: 3,
    maxRows: 6,
    defaultValue:
      "Family photos and home videos. <b>Markup</b> stays text. מחשב הגיבוי",
    dir: "auto",
  },
};
