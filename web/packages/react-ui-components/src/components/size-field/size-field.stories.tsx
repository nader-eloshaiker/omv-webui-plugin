// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { SizeField, type SizeFieldProps } from "./size-field";

const UNITS = [
  { value: "G", label: "GiB" },
  { value: "T", label: "TiB" },
] as const;

const HINT =
  "A limit keeps one file system from filling the pool for the others.";

const meta = {
  title: "Components/SizeField",
  component: SizeField,
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  args: {
    label: "Up to",
    value: "500",
    onValueChange: () => undefined,
    unit: "G",
    units: UNITS,
    onUnitChange: () => undefined,
    unitLabel: "Unit",
  },
} satisfies Meta<typeof SizeField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Holds the number and the unit, as a form would. */
function Controlled(
  props: Partial<SizeFieldProps> & { initial: string; initialUnit?: string },
) {
  const { initial, initialUnit = "G", ...rest } = props;
  const [value, setValue] = React.useState(initial);
  const [unit, setUnit] = React.useState(initialUnit);
  return (
    <SizeField
      label="Up to"
      unitLabel="Unit"
      units={UNITS}
      {...rest}
      value={value}
      onValueChange={setValue}
      unit={unit}
      onUnitChange={setUnit}
    />
  );
}

export const Empty: Story = {
  render: () => <Controlled initial="" hint={HINT} />,
};

export const Filled: Story = {
  render: () => <Controlled initial="500" hint={HINT} />,
};

/** Below what the file system already holds: refused on Save, in words. */
export const Invalid: Story = {
  render: () => (
    <Controlled
      initial="200"
      hint="Changing the limit does not move or delete any file."
      error="It already holds 340.0 GiB. Choose a limit above that, or delete files first."
    />
  ),
};

/** Unavailable until "Up to" is chosen; the hint says why. */
export const DisabledWithReason: Story = {
  render: () => (
    <Controlled initial="" hint="Choose Up to to set a limit." disabled />
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <Controlled
      initial="2"
      initialUnit="T"
      hint="Only an administrator can change the limit."
      readOnly
    />
  ),
};

/** Tab to it to see the ring. */
export const Focus: Story = {
  render: () => {
    function Focused() {
      const ref = React.useRef<HTMLInputElement>(null);
      React.useEffect(() => ref.current?.focus(), []);
      return <Controlled initial="500" hint={HINT} inputRef={ref} />;
    }
    return <Focused />;
  },
};

/**
 * In a 320px column the number and its unit stay side by side and the hint and the error wrap under
 * them. At 200% zoom the same holds; view this story with the browser zoomed to check.
 */
export const At320AndZoom200Note: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => (
    <Controlled
      initial="200"
      hint="Changing the limit does not move or delete any file."
      error="It already holds 340.0 GiB. Choose a limit above that, or delete files first."
    />
  ),
};

/** Choosing another unit keeps the number: 500 GiB becomes 500 TiB, never 0.49 TiB. */
export const UnitChangeKeepsTheNumber: Story = {
  render: () => {
    function WithReadout() {
      const [value, setValue] = React.useState("500");
      const [unit, setUnit] = React.useState("G");
      const word = UNITS.find((u) => u.value === unit)?.label ?? unit;
      return (
        <div className="flex flex-col gap-3">
          <SizeField
            label="Up to"
            unitLabel="Unit"
            units={UNITS}
            hint={HINT}
            value={value}
            onValueChange={setValue}
            unit={unit}
            onUnitChange={setUnit}
          />
          <p className="text-sm text-muted-foreground tabular-nums">
            Limit it to {value || "nothing yet"} {word}.
          </p>
        </div>
      );
    }
    return <WithReadout />;
  },
};

/** Markup-looking words render as text. */
export const HostileText: Story = {
  render: () => (
    <Controlled
      initial={'<img src="x">'}
      label="<b>Up to</b>"
      units={[
        { value: "G", label: "<i>GiB</i>" },
        { value: "T", label: "TiB" },
      ]}
      error={"<script>alert('size')</script>"}
    />
  ),
};
