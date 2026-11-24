// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Checkbox } from "./checkbox";

const meta = {
  title: "Components/Checkbox",
  component: Checkbox,
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: function StatesStory() {
    const storyId = React.useId();
    return (
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
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2">
            <Checkbox
              disabled
              aria-describedby={`${storyId}-spin-down-reason`}
            />
            Spin down when idle
          </label>
          <p
            id={`${storyId}-spin-down-reason`}
            className="ps-6 text-sm text-muted-foreground"
          >
            This disk does not support spinning down.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2">
            <Checkbox
              disabled
              defaultChecked
              aria-describedby={`${storyId}-cache-reason`}
            />
            Write cache
          </label>
          <p
            id={`${storyId}-cache-reason`}
            className="ps-6 text-sm text-muted-foreground"
          >
            Set by the disk controller and cannot be changed here.
          </p>
        </div>
      </div>
    );
  },
};
