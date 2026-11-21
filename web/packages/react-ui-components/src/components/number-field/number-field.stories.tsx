// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { NumberField, type NumberFieldProps } from "./number-field";

const meta = {
  title: "Components/NumberField",
  component: NumberField,
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  args: { label: "Check every", value: "30", onValueChange: () => undefined },
} satisfies Meta<typeof NumberField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Holds the text, as a form would. */
function Controlled(props: Partial<NumberFieldProps> & { initial: string }) {
  const { initial, ...rest } = props;
  const [value, setValue] = React.useState(initial);
  return (
    <NumberField
      label="Check every"
      {...rest}
      value={value}
      onValueChange={setValue}
    />
  );
}

export const WithUnit: Story = {
  render: () => (
    <Controlled
      initial="30"
      unit="minutes"
      hint="How often the NAS checks each watched disk. Every 30 minutes suits most homes."
    />
  ),
};

export const WithoutUnit: Story = {
  render: () => <Controlled label="Times switched on" initial="1204" />,
};

/** Tab to it to see the ring. */
export const Focus: Story = {
  render: () => {
    function Focused() {
      const ref = React.useRef<HTMLInputElement>(null);
      React.useEffect(() => ref.current?.focus(), []);
      return (
        <Controlled initial="50" label="Warn at" unit="°C" inputRef={ref} />
      );
    }
    return <Focused />;
  },
};

export const Invalid: Story = {
  render: () => (
    <Controlled
      initial="0"
      label="Warn at"
      unit="°C"
      error="Enter a whole number from 1 to 100."
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <Controlled
      initial="5"
      label="Of at least"
      unit="°C"
      hint="Turn on Record temperature changes to set this."
      disabled
    />
  ),
};

/**
 * At 200% zoom the unit stays beside the input and the hint wraps under it; view this story with the
 * browser zoomed to check.
 */
export const Zoom200Note: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => (
    <Controlled
      initial="1800"
      unit="minutes"
      hint="Now every 45 seconds, set elsewhere. Saving rounds it to whole minutes."
    />
  ),
};
