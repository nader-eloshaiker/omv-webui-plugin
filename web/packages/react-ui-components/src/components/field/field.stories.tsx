// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Checkbox } from "../checkbox/checkbox";
import { NumberField } from "../number-field/number-field";
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
  FormColumn,
  Input,
} from "./field";

const meta = {
  title: "Components/Field",
  component: Field,
  // A narrow column by default; a story that shows a whole form sets `wide` and brings its own.
  decorators: [
    (Story, context) =>
      context.parameters.wide ? (
        Story()
      ) : (
        <div className="max-w-sm">{Story()}</div>
      ),
  ],
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

/**
 * Fields sized to what they hold (owner decision 5), in a form column capped at 640px: a name and a
 * password at 24ch, a port and a percentage at 8ch with the unit beside, an IPv4 address at 16ch, an email and an IPv6
 * address at 40ch, a time at 10ch, a select at the step of its longest option, and only the
 * description and the path across the column. On a narrow screen each grows to the column, never
 * beyond it.
 */
export const Widths: Story = {
  parameters: { wide: true },
  render: function WidthsStory() {
    const [port, setPort] = React.useState("22");
    const [full, setFull] = React.useState("85");
    return (
      <FormColumn>
        <Field>
          <FieldLabel>
            Name<FieldRequired>Required</FieldRequired>
          </FieldLabel>
          <FieldControl width="name" defaultValue="alex" />
          <FieldHint>
            They sign in with this name. It cannot be changed later.
          </FieldHint>
        </Field>
        <Field>
          <FieldLabel>Who they are</FieldLabel>
          <FieldControl defaultValue="Alex at home, the photos and the music" />
        </Field>
        <Field>
          <FieldLabel>Password</FieldLabel>
          <FieldControl
            width="name"
            type="password"
            defaultValue="correct horse battery"
          />
        </Field>
        <Field>
          <FieldLabel>Email address</FieldLabel>
          <FieldControl
            width="wide"
            type="email"
            defaultValue="alex@example.org"
          />
          <FieldHint>For messages from scheduled jobs.</FieldHint>
        </Field>
        <NumberField label="SSH port" value={port} onValueChange={setPort} />
        <NumberField
          label="Warn when it is this full"
          unit="%"
          value={full}
          onValueChange={setFull}
        />
        <Field>
          <FieldLabel>Fixed address (IPv4)</FieldLabel>
          <FieldControl
            width="address"
            defaultValue="192.0.2.50"
            className="font-mono"
          />
        </Field>
        <Field>
          <FieldLabel>Fixed address (IPv6)</FieldLabel>
          <FieldControl
            width="wide"
            defaultValue="2001:db8:85a3::8a2e:370:7334"
            className="font-mono"
          />
        </Field>
        <Field>
          <FieldLabel>Run at</FieldLabel>
          <FieldControl
            width="code"
            defaultValue="03:00"
            className="tabular-nums"
          />
        </Field>
        <Field>
          <FieldLabel>Check every</FieldLabel>
          <Select
            defaultValue="week"
            items={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
            ]}
          >
            <SelectTrigger width="code" />
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Folder on the drive</FieldLabel>
          <FieldControl
            defaultValue="/srv/dev-disk-by-uuid-1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d/photos/"
            className="font-mono"
          />
        </Field>
      </FormColumn>
    );
  },
};
