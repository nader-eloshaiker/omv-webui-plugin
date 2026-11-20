// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "./switch";

const meta = { title: "Components/Switch", component: Switch } satisfies Meta<
  typeof Switch
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2">
        <Switch defaultChecked />
        SSH service
      </label>
      <label className="flex items-center gap-2">
        <Switch />
        Allow the root user to sign in over SSH
      </label>
      <label className="flex items-center gap-2 text-subtle-foreground">
        <Switch disabled />
        Wake-on-LAN (this network card does not support it)
      </label>
      <label className="flex items-center gap-2 text-subtle-foreground">
        <Switch disabled defaultChecked />
        Web interface (cannot be turned off here)
      </label>
    </div>
  ),
};
