// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Checkbox } from "../checkbox/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../select/select";
import { Switch } from "../switch/switch";
import {
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  FieldRequired,
  Input,
} from "./field";

const meta = {
  title: "Components/Field",
  component: Field,
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHint: Story = {
  render: () => (
    <Field>
      <FieldLabel>Shared folder name</FieldLabel>
      <FieldControl placeholder="e.g. media" />
      <FieldHint>The name clients see on the network.</FieldHint>
    </Field>
  ),
};

export const Required: Story = {
  render: () => (
    <Field>
      <FieldLabel>
        Host name<FieldRequired>Required</FieldRequired>
      </FieldLabel>
      <FieldControl defaultValue="nas" />
    </Field>
  ),
};

export const Invalid: Story = {
  render: () => (
    <Field invalid>
      <FieldLabel>Port</FieldLabel>
      <FieldControl
        defaultValue="70000"
        inputMode="numeric"
        className="tabular-nums"
      />
      <FieldHint>The port the SSH service listens on.</FieldHint>
      <FieldError>Enter a port between 1 and 65535.</FieldError>
    </Field>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Field disabled>
      <FieldLabel>Workgroup</FieldLabel>
      <FieldControl defaultValue="WORKGROUP" />
      <FieldHint>Turn on SMB to change this.</FieldHint>
    </Field>
  ),
};

export const MarkupLookingValue: Story = {
  render: () => (
    <Field>
      <FieldLabel>Comment</FieldLabel>
      <FieldControl
        defaultValue={'<img src=x onerror="alert(1)"> stays text'}
      />
      <FieldHint>{"<b>Hints are text too</b>"}</FieldHint>
    </Field>
  ),
};

export const SearchInput: Story = {
  render: () => (
    <Input aria-label="Search shared folders" placeholder="Search" />
  ),
};

export const Controls: Story = {
  render: function ControlsStory() {
    const storyId = React.useId();
    return (
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-2">
          <Checkbox defaultChecked />
          Enable SMART monitoring
        </label>
        <label className="flex items-center gap-2">
          <Checkbox indeterminate />
          Select all disks
        </label>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2">
            <Checkbox
              disabled
              aria-describedby={`${storyId}-controls-spin-reason`}
            />
            Spin down when idle
          </label>
          <p
            id={`${storyId}-controls-spin-reason`}
            className="ps-6 text-sm text-muted-foreground"
          >
            This disk does not support spinning down.
          </p>
        </div>
        <label className="flex items-center gap-2">
          <Switch defaultChecked />
          SSH service
        </label>
        <label className="flex items-center gap-2">
          <Switch />
          Allow root login
        </label>
        <Field>
          <FieldLabel>Spin-down time</FieldLabel>
          <Select
            defaultValue="20"
            items={[
              { value: "0", label: "Never" },
              { value: "20", label: "20 minutes" },
              { value: "60", label: "1 hour" },
            ]}
          >
            <SelectTrigger />
            <SelectContent>
              <SelectItem value="0">Never</SelectItem>
              <SelectItem value="20">20 minutes</SelectItem>
              <SelectItem value="60">1 hour</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    );
  },
};
