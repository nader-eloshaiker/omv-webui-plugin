// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, RefreshCw, Settings, Trash2 } from "lucide-react";
import * as React from "react";
import { Checkbox } from "../checkbox/checkbox";
import { Button, IconButton, SaveButton, type SavePhase } from "./button";

const meta = {
  title: "Components/Button",
  component: Button,
  args: { children: "Save" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: "primary" } };
// The accent outlined (rethink A2): a next step that is not the region's one filled primary, as the
// other rows that need the person on the dashboard. Shown beside the filled primary it defers to.
export const PrimaryOutline: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button>See what to do</Button>
        <span className="text-sm text-muted-foreground">
          Disk in bay 2 reports a problem
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primaryOutline">Free up space</Button>
        <span className="text-sm text-muted-foreground">
          Data drive is 91% full
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primaryOutline" disabled>
          Check again
        </Button>
        <span className="text-sm text-muted-foreground">
          Unavailable while a check runs
        </span>
      </div>
    </div>
  ),
};
export const Neutral: Story = {
  args: { variant: "neutral", children: "Cancel" },
};
export const Ghost: Story = { args: { variant: "ghost", children: "Refresh" } };
export const Destructive: Story = {
  args: { variant: "destructive", children: "Wipe disk" },
};

// Ink with no fill, as on the top bar: the pending count, the tasks and account menus.
export const Quiet: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-page p-2">
      <Button variant="quiet" size="sm" aria-label="3 pending changes">
        <span aria-hidden="true" className="tabular-nums">
          3
        </span>
        <span aria-hidden="true">pending</span>
      </Button>
      <IconButton
        label="Tasks: 1 running"
        icon={<RefreshCw />}
        variant="quiet"
      />
      <IconButton label="Account: admin" icon={<Settings />} variant="quiet" />
    </div>
  ),
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

// The save settle (foundation 7.2): press Save; the label slides out, a spinner shows while saving,
// then a tick draws and the button turns OK green with "Saved" for 1.5s. Reduced motion: the words
// change and nothing moves.
export const SaveSettle: Story = {
  render: function SaveSettleStory() {
    const [phase, setPhase] = React.useState<SavePhase>("idle");
    React.useEffect(() => {
      if (phase === "idle") {
        return undefined;
      }
      const timer = window.setTimeout(
        () => setPhase(phase === "saving" ? "saved" : "idle"),
        phase === "saving" ? 900 : 1500,
      );
      return () => window.clearTimeout(timer);
    }, [phase]);
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="neutral">Discard</Button>
        <SaveButton
          phase={phase}
          savingLabel="Saving…"
          savedLabel="Saved"
          onClick={() => setPhase("saving")}
        >
          Save sharing
        </SaveButton>
      </div>
    );
  },
};

// The destructive arm (foundation 7.2): unavailable, the confirm button is an outline; the moment the
// act becomes possible it fills with the destructive red from the start edge. Reduced motion: the
// fill appears.
export const DestructiveArm: Story = {
  render: function DestructiveArmStory() {
    const [armed, setArmed] = React.useState(false);
    return (
      <div className="flex flex-col items-start gap-3">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={armed}
            onCheckedChange={(checked) => setArmed(checked)}
          />
          I understand that every file on Backup is deleted
        </label>
        <div className="flex gap-2">
          <Button variant="neutral">Cancel</Button>
          <Button variant="destructive" disabled={!armed}>
            Delete Backup and its files
          </Button>
        </div>
      </div>
    );
  },
};
