// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "./checkbox";

const meta = {
  title: "Components/Checkbox",
  component: Checkbox,
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2">
        <Checkbox />
        Send a notification when a disk reports a SMART error
      </label>
      <label className="flex items-center gap-2">
        <Checkbox defaultChecked />
        Enable SMART monitoring
      </label>
      <label className="flex items-center gap-2">
        <Checkbox indeterminate />
        Select all disks (2 of 4 selected)
      </label>
      <label className="flex items-center gap-2 text-subtle-foreground">
        <Checkbox disabled />
        Spin down when idle (this disk does not support it)
      </label>
      <label className="flex items-center gap-2 text-subtle-foreground">
        <Checkbox disabled defaultChecked />
        Write cache (set by the controller)
      </label>
    </div>
  ),
};
