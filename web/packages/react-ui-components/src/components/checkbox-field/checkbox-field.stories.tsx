// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { CheckboxField } from "./checkbox-field";

const meta = {
  title: "Components/CheckboxField",
  component: CheckboxField,
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  args: { label: "Turn on SSH" },
} satisfies Meta<typeof CheckboxField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {
  args: {
    label: "Allow port forwarding",
    hint: "Lets someone signed in pass other network traffic through the NAS. Leave it off unless you use it.",
  },
};

export const Checked: Story = {
  args: {
    label: "Turn on SSH",
    hint: "Each person also needs SSH access on their own account, which is set under Users.",
    defaultChecked: true,
  },
};

/** Tab to it to see the ring around the box; Space toggles it. */
export const Focus: Story = {
  args: { label: "Compress data", autoFocus: true },
};

export const DisabledWithReason: Story = {
  args: {
    label: "Allow the root account to sign in",
    hint: "Turn on SSH to change this.",
    disabled: true,
  },
};

export const DisabledChecked: Story = {
  args: {
    label: "Allow signing in with a key",
    hint: "Set by the system and cannot be changed here.",
    disabled: true,
    defaultChecked: true,
  },
};

export const Invalid: Story = {
  args: {
    label: "I understand that the data on this disk will be lost",
    error: "Tick this to continue.",
  },
};

function SigningIn() {
  const [password, setPassword] = React.useState(true);
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-base font-semibold">Signing in</legend>
      <CheckboxField
        label="Allow signing in with a password"
        checked={password}
        onCheckedChange={setPassword}
      />
      <CheckboxField
        label="Allow signing in with a key"
        hint="A key is a file on your computer that proves who you are, with no password to guess. Keys are added to each account under Users."
        defaultChecked
      />
      <CheckboxField
        label="Allow the root account to sign in, which gives full control of the NAS to anyone who knows its password"
        hint="root is the built-in account with full control of the NAS. It is safer to leave this off and sign in with your own account."
      />
    </fieldset>
  );
}

/** A fieldset of settings as the SSH form lays them out, with a long label that wraps. */
export const InAFieldset: Story = { render: () => <SigningIn /> };

export const MarkupLookingLabel: Story = {
  args: {
    label: "<b>Share</b> <img src=x> stays text",
    hint: "<i>Hints are text too</i>",
  },
};
