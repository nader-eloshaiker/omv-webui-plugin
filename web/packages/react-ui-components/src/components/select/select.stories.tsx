// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field, FieldHint, FieldLabel } from "../field/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "./select";

const meta = {
  title: "Components/Select",
  decorators: [(Story) => <div className="max-w-xs">{Story()}</div>],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SPIN_DOWN = [
  { value: "0", label: "Never" },
  { value: "20", label: "20 minutes" },
  { value: "60", label: "1 hour" },
  { value: "240", label: "4 hours" },
];

function Options() {
  return (
    <SelectContent>
      {SPIN_DOWN.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  );
}

export const InAField: Story = {
  render: () => (
    <Field>
      <FieldLabel>Spin-down time</FieldLabel>
      <Select items={SPIN_DOWN} defaultValue="20">
        <SelectTrigger />
        <Options />
      </Select>
      <FieldHint>
        How long a disk stays idle before it stops spinning.
      </FieldHint>
    </Field>
  ),
};

export const Placeholder: Story = {
  render: () => (
    <div className="flex flex-col gap-1">
      <Select items={SPIN_DOWN}>
        <SelectLabel>Spin-down time</SelectLabel>
        <SelectTrigger placeholder="Choose a time" />
        <Options />
      </Select>
    </div>
  ),
};

export const Open: Story = {
  render: () => (
    <Select items={SPIN_DOWN} defaultValue="60" defaultOpen>
      <SelectLabel>Spin-down time</SelectLabel>
      <SelectTrigger />
      <Options />
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Field disabled>
      <FieldLabel>Spin-down time</FieldLabel>
      <Select items={SPIN_DOWN} defaultValue="0" disabled>
        <SelectTrigger />
        <Options />
      </Select>
      <FieldHint>This disk does not support spinning down.</FieldHint>
    </Field>
  ),
};

// More than seven choices are grouped (5.3). The plain name first, the technical one in brackets.
const LOG_GROUPS = [
  {
    label: "The whole system",
    items: [
      { value: "syslog", label: "All system messages (syslog)" },
      { value: "messages", label: "General messages" },
      { value: "daemon", label: "Background services (daemon)" },
      { value: "auth", label: "Signing in and permissions (auth)" },
      { value: "boot", label: "Since the last start (boot)" },
      { value: "dmesg", label: "Hardware and drivers (kernel)" },
    ],
  },
  {
    label: "Storage, sharing and updates",
    items: [
      { value: "smartd", label: "Disk health monitoring (S.M.A.R.T.)" },
      { value: "smbdaudit", label: "File access over SMB/CIFS (audit)" },
      { value: "rsync", label: "Rsync jobs" },
      { value: "rsyncd", label: "Rsync server" },
      { value: "apt_term", label: "Software updates" },
    ],
  },
];
const LOG_ITEMS = LOG_GROUPS.flatMap((group) => group.items);

function GroupedOptions() {
  return (
    <SelectContent>
      {LOG_GROUPS.map((group) => (
        <SelectGroup key={group.label}>
          <SelectGroupLabel>{group.label}</SelectGroupLabel>
          {group.items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </SelectContent>
  );
}

export const Grouped: Story = {
  render: () => (
    <div className="flex flex-col gap-1">
      <Select items={LOG_ITEMS} defaultOpen>
        <SelectLabel>Log</SelectLabel>
        <SelectTrigger placeholder="Choose a log" />
        <GroupedOptions />
      </Select>
    </div>
  ),
};

export const GroupedChosen: Story = {
  render: () => (
    <div className="flex flex-col gap-1">
      <Select items={LOG_ITEMS} defaultValue="smbdaudit">
        <SelectLabel>Log</SelectLabel>
        <SelectTrigger placeholder="Choose a log" />
        <GroupedOptions />
      </Select>
    </div>
  ),
};

export const LongOptionText: Story = {
  decorators: [(Story) => <div className="max-w-[16rem]">{Story()}</div>],
  render: () => {
    const items = [
      {
        value: "long",
        label:
          "A plugin's log with a very long name that does not fit on one line of the list",
      },
      { value: "markup", label: "<b>Markup-looking</b> name, shown as text" },
    ];
    return (
      <div className="flex flex-col gap-1">
        <Select items={items} defaultValue="long" defaultOpen>
          <SelectLabel>Log</SelectLabel>
          <SelectTrigger />
          <SelectContent>
            <SelectGroup>
              <SelectGroupLabel>Plugins</SelectGroupLabel>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    );
  },
};
