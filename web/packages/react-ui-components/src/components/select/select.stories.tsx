// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field, FieldHint, FieldLabel } from "../field/field";
import {
  Select,
  SelectContent,
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
