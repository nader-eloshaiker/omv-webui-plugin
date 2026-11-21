// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { NumberField } from "../number-field/number-field";
import { RadioGroupField, RadioOption } from "./radio-group-field";

const meta = {
  title: "Components/RadioGroupField",
  component: RadioGroupField,
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  args: {
    legend: "How to wipe",
    value: "quick",
    onValueChange: () => undefined,
    children: null,
  },
} satisfies Meta<typeof RadioGroupField>;

export default meta;
type Story = StoryObj<typeof meta>;

function WipeMethod({
  initial = "quick",
  error,
  disabled,
  autoFocus,
}: {
  initial?: string;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = React.useState(initial);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (autoFocus) {
      ref.current?.querySelector<HTMLElement>('[role="radio"]')?.focus();
    }
  }, [autoFocus]);
  return (
    <div ref={ref}>
      <RadioGroupField
        legend="How to wipe"
        value={value}
        onValueChange={setValue}
        error={error}
        disabled={disabled}
      >
        <RadioOption
          value="quick"
          label="Quick wipe (recommended)"
          hint="Erases the partition table and the start and end of the disk, so the NAS sees it as empty. Takes a few seconds."
        />
        <RadioOption
          value="secure"
          label="Secure wipe"
          hint="Overwrites the whole disk once, so the old files cannot be recovered. Takes many hours."
        />
      </RadioGroupField>
    </div>
  );
}

export const Default: Story = { render: () => <WipeMethod /> };

/** The second option chosen. */
export const Checked: Story = { render: () => <WipeMethod initial="secure" /> };

/** Tab to the group to see the ring; the arrow keys move between options. */
export const Focus: Story = { render: () => <WipeMethod autoFocus /> };

export const Invalid: Story = {
  render: () => <WipeMethod initial="" error="Choose how to wipe the disk." />,
};

export const WholeGroupDisabled: Story = {
  render: () => <WipeMethod disabled />,
};

function SleepingDisks() {
  const [value, setValue] = React.useState("standby");
  return (
    <RadioGroupField
      legend="When a disk is asleep at check time"
      hint="A disk that is asleep at every check is not checked until it is awake at one."
      value={value}
      onValueChange={setValue}
    >
      <RadioOption
        value="never"
        label="Check it anyway; the check wakes the disk up"
      />
      <RadioOption
        value="sleep"
        label="Skip only disks in deep sleep; a disk that has only spun down is woken up"
      />
      <RadioOption
        value="standby"
        label="Skip the check, so the disk stays asleep (recommended)"
      />
      <RadioOption
        value="idle"
        label="Skip also while the disk is spinning but resting; checks happen only while it is busy"
        hint="Not available: this disk does not report when it is resting."
        disabled
      />
    </RadioGroupField>
  );
}

/** An option that cannot be chosen gives its reason in its hint. */
export const OptionDisabledWithReason: Story = {
  render: () => <SleepingDisks />,
};

export const LongTextAt320px: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => <SleepingDisks />,
};

function TemperatureLimit() {
  const [value, setValue] = React.useState("own");
  const [limit, setLimit] = React.useState("45");
  return (
    <RadioGroupField
      legend="Temperature limit for this disk"
      value={value}
      onValueChange={setValue}
    >
      <RadioOption value="same" label="Same as for all disks (50 °C)" />
      <RadioOption value="own" label="Its own limit">
        {value === "own" ? (
          <NumberField
            label="Limit"
            unit="°C"
            hint="Recorded at this temperature, and emailed at 50 °C."
            value={limit}
            onValueChange={setLimit}
          />
        ) : null}
      </RadioOption>
    </RadioGroupField>
  );
}

/** A field that belongs to one option sits under it, indented to its label. */
export const WithNestedField: Story = { render: () => <TemperatureLimit /> };

/** Markup-looking text renders as text. */
export const MarkupLookingText: Story = {
  args: {
    legend: "<b>Not bold</b>",
    children: (
      <>
        <RadioOption value="quick" label={'<img src=x onerror="alert(1)">'} />
        <RadioOption value="secure" label="Secure wipe" />
      </>
    ),
  },
};
