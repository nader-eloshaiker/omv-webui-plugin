// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SecretField } from "./secret-field";

const meta = {
  title: "Components/Secret field",
  component: SecretField,
  args: { label: "Password", revealLabel: "Show password" },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof SecretField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = {
  args: {
    hint: "At least 12 characters. It is never shown again after saving.",
  },
};

export const StoredSecret: Story = {
  args: {
    label: "Shared secret",
    revealLabel: "Show shared secret",
    hint: "Used by the rsync server to check clients.",
    stored: {
      setLabel: "Set",
      changeLabel: "Change shared secret",
      keepLabel: "Keep the current one",
    },
  },
};

export const WithError: Story = {
  args: { error: "Use at least 12 characters." },
};

export const Disabled: Story = { args: { disabled: true } };
