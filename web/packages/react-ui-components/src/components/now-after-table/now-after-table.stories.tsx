// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Identifier } from "../text/identifier";
import { NowAfterTable, type NowAfterRow } from "./now-after-table";

// The English words of phase 5 network design 1.4 and 1.9.
const labels = {
  name: "What changes",
  setting: "Setting",
  now: "Now",
  after: "After",
  unchanged: "Unchanged",
};

const INTERFACE: NowAfterRow[] = [
  {
    id: "method",
    label: "How the NAS gets its IPv4 address",
    now: "Automatically from the router (DHCP)",
    after: "A fixed address I choose",
    changed: true,
  },
  {
    id: "address",
    label: "IPv4 address",
    now: "192.0.2.10/24",
    after: "192.0.2.20/24",
    changed: true,
  },
  {
    id: "gateway",
    label: "Router address",
    now: "192.0.2.1",
    after: "192.0.2.1",
    changed: false,
  },
  {
    id: "address6",
    label: "IPv6 address",
    now: "2001:db8::10/64",
    after: "2001:db8::10/64",
    changed: false,
  },
  {
    id: "dns",
    label: "Name servers",
    now: "192.0.2.1",
    // A list, one per line (design 0.2): a node, since a string is one identifier.
    after: (
      <span className="flex flex-col">
        <Identifier dir="ltr">192.0.2.53</Identifier>
        <Identifier dir="ltr">198.51.100.53</Identifier>
      </span>
    ),
    changed: true,
  },
];

const meta = {
  title: "Components/NowAfterTable",
  component: NowAfterTable,
  decorators: [(Story) => <div className="max-w-3xl">{Story()}</div>],
  args: { rows: INTERFACE, labels },
} satisfies Meta<typeof NowAfterTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An interface's change: the rows that change, and its address rows whether they change or not. */
export const InterfaceChange: Story = {};

/** The name of this NAS. */
export const NameChange: Story = {
  args: {
    rows: [
      {
        id: "hostname",
        label: "Name of this NAS",
        now: "nas",
        after: "backup-nas",
        changed: true,
      },
      {
        id: "domain",
        label: "Domain",
        now: "example.org",
        after: "example.org",
        changed: false,
      },
    ],
  },
};

/** Long values wrap anywhere in their column. */
export const LongValues: Story = {
  args: {
    rows: [
      {
        id: "search",
        label: "Search domains",
        now: "office.example.org",
        after:
          "storage.basement.office.example.org storage.upstairs.office.example.org",
        changed: true,
      },
      {
        id: "address6",
        label: "IPv6 address",
        now: "2001:db8:85a3:0:0:8a2e:370:7334/64",
        after: "2001:db8:85a3::8a2e:370:7335/64",
        changed: true,
      },
      {
        id: "mac",
        label: "Hardware address",
        now: "00:00:5e:00:53:01",
        after: "00:00:5e:00:53:01",
        changed: false,
      },
    ],
  },
};

/**
 * Under 640px (Storybook's "mobile1" viewport, 320px) the columns stack, "Now" first, each value
 * labelled; nothing scrolls sideways.
 */
export const StackedAt320px: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

/** Text that looks like markup renders as text. */
export const HostileValue: Story = {
  args: {
    rows: [
      {
        id: "note",
        label: "Note",
        now: '<img src=x onerror="alert(1)">',
        after: "Office network",
        changed: true,
      },
    ],
  },
};
