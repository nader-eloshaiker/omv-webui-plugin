// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  CommandPalette,
  CommandPaletteTrigger,
  type CommandItem,
} from "./command-palette";
import { useCommandKeys } from "./use-command-keys";

const meta = {
  title: "Components/Command palette",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => undefined;

const PAGES: CommandItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    group: "Go to",
    shortcut: ["g", "o"],
    onSelect: noop,
  },
  {
    id: "disks",
    label: "Disks",
    group: "Go to",
    hint: "Storage",
    shortcut: ["g", "d"],
    onSelect: noop,
  },
  {
    id: "smart",
    label: "Disk health",
    group: "Go to",
    hint: "Storage",
    onSelect: noop,
  },
  {
    id: "fs",
    label: "File systems",
    group: "Go to",
    hint: "Storage",
    shortcut: ["g", "f"],
    onSelect: noop,
  },
  {
    id: "shares",
    label: "Shared folders",
    group: "Go to",
    hint: "Storage",
    shortcut: ["g", "s"],
    onSelect: noop,
  },
  {
    id: "smb",
    label: "SMB/CIFS",
    group: "Go to",
    hint: "Services",
    onSelect: noop,
  },
  { id: "ssh", label: "SSH", group: "Go to", hint: "Services", onSelect: noop },
  {
    id: "users",
    label: "Users",
    group: "Go to",
    hint: "Users",
    shortcut: ["g", "u"],
    onSelect: noop,
  },
  {
    id: "cron",
    label: "Scheduled tasks",
    group: "Go to",
    hint: "System · classic interface",
    external: true,
    onSelect: noop,
  },
  {
    id: "compose",
    label: "Compose",
    group: "Go to",
    hint: "Services · classic interface",
    external: true,
    onSelect: noop,
  },
];

const APPLY: CommandItem = {
  id: "apply",
  label: "Apply 3 pending changes",
  group: "Do",
  hint: "SMB, SSH, Network interfaces",
  onSelect: noop,
};

function Demo({
  pending,
  startOpen,
}: {
  pending: boolean;
  startOpen: boolean;
}) {
  const [open, setOpen] = React.useState(startOpen);
  useCommandKeys({
    onOpenPalette: () => setOpen(true),
    jumps: {},
    enabled: !open,
  });
  return (
    <div className="flex flex-col items-start gap-3">
      <CommandPaletteTrigger
        label="Go to or do…"
        onClick={() => setOpen(true)}
      />
      <p className="text-caption text-tertiary-foreground">
        Press / or Ctrl+K (Cmd+K) to open it from anywhere.
      </p>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        items={pending ? [APPLY, ...PAGES] : PAGES}
        label="Go to or do"
        inputLabel="Search pages and actions"
        emptyMessage={(q) =>
          `Nothing matches “${q}”. Try a page name, like “disks”.`
        }
        closeLabel="Close"
        keysHint="↑ ↓ to move · Enter to go · g then a letter jumps from anywhere"
        externalLabel="classic interface"
      />
    </div>
  );
}

/** Every page, classic pages marked; the shortcut beside an item teaches it. */
export const Pages: Story = {
  render: () => <Demo pending={false} startOpen />,
};

/** With changes waiting, "Apply 3 pending changes" comes first. */
export const WithPendingAction: Story = {
  globals: { theme: "Dark" },
  render: () => <Demo pending startOpen />,
};

/** The trigger alone, as the top bar shows it. */
export const Trigger: Story = {
  render: () => <Demo pending={false} startOpen={false} />,
};
