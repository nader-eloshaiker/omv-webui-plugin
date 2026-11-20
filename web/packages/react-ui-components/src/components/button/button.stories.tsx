// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, RefreshCw, Settings, Trash2 } from "lucide-react";
import { Button, IconButton } from "./button";

const meta = {
  title: "Components/Button",
  component: Button,
  args: { children: "Save" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: "primary" } };
export const Neutral: Story = {
  args: { variant: "neutral", children: "Cancel" },
};
export const Ghost: Story = { args: { variant: "ghost", children: "Refresh" } };
export const Destructive: Story = {
  args: { variant: "destructive", children: "Wipe disk" },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="neutral">
        Table toolbar (28px)
      </Button>
      <Button size="md">Default (32px)</Button>
      <Button size="lg">Sign in (40px)</Button>
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button>
        <Plus aria-hidden="true" />
        Add shared folder
      </Button>
      <Button variant="neutral">
        <RefreshCw aria-hidden="true" />
        Refresh
      </Button>
    </div>
  ),
};

export const IconOnly: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <IconButton label="Settings for /dev/sda" icon={<Settings />} />
      <IconButton
        label="Delete user backup-operator"
        icon={<Trash2 />}
        variant="neutral"
      />
      <IconButton
        label="Refresh the disk list"
        icon={<RefreshCw />}
        size="icon-sm"
      />
    </div>
  ),
};

// A disabled control says why, in muted text linked to it (style guide 5.3), and stays reachable by
// keyboard so the reason is heard.
export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(
        [
          ["primary", "Save", "Nothing has changed yet."],
          ["neutral", "SMART details", "Select one disk to see its details."],
          ["ghost", "Refresh", "The list refreshes itself every 30 seconds."],
          [
            "destructive",
            "Wipe disk",
            "Type the device name to confirm first.",
          ],
        ] as const
      ).map(([variant, label, reason]) => (
        <div key={label} className="flex flex-wrap items-center gap-3">
          <Button
            variant={variant}
            disabled
            focusableWhenDisabled
            aria-describedby={`reason-${variant}`}
          >
            {label}
          </Button>
          <span
            id={`reason-${variant}`}
            className="text-sm text-muted-foreground"
          >
            {reason}
          </span>
        </div>
      ))}
    </div>
  ),
};

export const Loading: Story = { args: { loading: true, children: "Saving…" } };

export const LongLabel: Story = {
  args: {
    variant: "neutral",
    children: "Open the classic interface for scheduled jobs and notifications",
  },
};

// A translated label longer than the space: the button grows and wraps instead of spilling out.
export const WrapsAtNarrowWidth: Story = {
  render: () => (
    <div className="w-[18rem] rounded-card border border-border p-3">
      <Button variant="neutral">
        Gemeinsamen Ordner und alle zugehörigen Freigaben jetzt hinzufügen
      </Button>
    </div>
  ),
};
