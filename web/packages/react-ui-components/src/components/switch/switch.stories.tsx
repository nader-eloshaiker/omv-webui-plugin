// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "./switch";

const meta = {
  title: "Components/Switch",
  component: Switch,
} satisfies Meta<typeof Switch>;

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
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2">
          <Switch disabled aria-describedby="wol-reason" />
          Wake-on-LAN
        </label>
        <p id="wol-reason" className="ps-11 text-sm text-muted-foreground">
          This network card does not support it.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2">
          <Switch disabled defaultChecked aria-describedby="web-reason" />
          Web interface
        </label>
        <p id="web-reason" className="ps-11 text-sm text-muted-foreground">
          It serves this page, so it cannot be turned off here.
        </p>
      </div>
    </div>
  ),
};
