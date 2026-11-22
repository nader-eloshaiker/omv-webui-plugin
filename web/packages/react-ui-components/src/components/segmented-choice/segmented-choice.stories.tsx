// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  SegmentedChoice,
  type SegmentedChoiceOption,
  type SegmentedChoiceProps,
} from "./segmented-choice";

const ACCESS: readonly SegmentedChoiceOption[] = [
  { value: "rw", label: "Read and write" },
  { value: "ro", label: "Read only" },
  { value: "none", label: "No access" },
];

const WITH_BLOCKED: readonly SegmentedChoiceOption[] = [
  ...ACCESS,
  { value: "blocked", label: "Blocked" },
];

// About 40% longer than the English, as a translation may be.
const LONGER: readonly SegmentedChoiceOption[] = [
  { value: "rw", label: "Lesen und Schreiben erlaubt" },
  { value: "ro", label: "Nur Lesen erlaubt" },
  { value: "none", label: "Kein Zugriff möglich" },
];

const meta = {
  title: "Components/SegmentedChoice",
  component: SegmentedChoice,
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
  args: {
    options: ACCESS,
    value: "ro",
    onValueChange: () => undefined,
    "aria-label": "Access for alex",
  },
} satisfies Meta<typeof SegmentedChoice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Holds its own value, so the story can be used with the mouse and the keyboard. */
function Live({
  initial = "ro",
  focus,
  ...props
}: Omit<SegmentedChoiceProps, "value" | "onValueChange"> & {
  initial?: string | null;
  focus?: boolean;
}) {
  const [value, setValue] = React.useState<string | null>(initial);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (focus) {
      ref.current
        ?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')
        ?.focus();
    }
  }, [focus]);
  return (
    <SegmentedChoice
      {...props}
      ref={ref}
      value={value}
      onValueChange={setValue}
    />
  );
}

/** Hover a segment for the neutral hover step; Tab in and use the arrows, Home and End. */
export const Default: Story = {
  render: (args) => <Live {...args} />,
};

export const NothingChosen: Story = {
  render: (args) => <Live {...args} initial={null} />,
};

export const Small: Story = {
  render: (args) => <Live {...args} size="sm" />,
};

/** The ring sits outside the joined edges, on the checked part as on an unchecked one. */
export const FocusOnChecked: Story = {
  render: (args) => <Live {...args} focus />,
};

export const FocusOnUnchecked: Story = {
  render: (args) => <Live {...args} initial={null} focus />,
};

export const EveryChoiceChecked: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      {["family", "alex", "sam"].map((name, position) => (
        <SegmentedChoice
          key={name}
          {...args}
          aria-label={`Access for ${name}`}
          value={ACCESS[position]?.value ?? null}
        />
      ))}
    </div>
  ),
};

export const DisabledWithReason: Story = {
  args: {
    disabled: true,
    disabledReason:
      "The web interface's administrator account cannot be given access to shared folders.",
    value: "none",
  },
};

export const Saving: Story = {
  args: { disabled: true, disabledReason: "Saving…", size: "sm" },
};

export const OneOptionUnavailable: Story = {
  render: (args) => (
    <Live
      {...args}
      options={[
        { value: "rw", label: "Read and write", disabled: true },
        { value: "ro", label: "Read only" },
        { value: "none", label: "No access" },
      ]}
    />
  ),
};

export const Invalid: Story = {
  render: (args) => (
    <Live
      {...args}
      initial={null}
      error="Choose an access for alex, or remove alex from the list."
    />
  ),
};

/** The fourth value, on a row that already holds it. */
export const FourOptions: Story = {
  render: (args) => (
    <Live {...args} options={WITH_BLOCKED} initial="blocked" size="sm" />
  ),
};

/** Labels 40% longer stack into a column instead of being cut short. */
export const LongerLabels: Story = {
  render: (args) => (
    <div className="flex flex-col gap-6">
      <div className="w-[34rem] max-w-full">
        <Live {...args} options={LONGER} aria-label="Zugriff für alex" />
      </div>
      <div className="w-72">
        <Live {...args} options={LONGER} aria-label="Zugriff für alex" />
      </div>
    </div>
  ),
};

/** 320px less the page gutters: the English labels stack too. */
export const Narrow: Story = {
  render: (args) => (
    <div className="w-[18rem] border border-dashed border-border p-0">
      <Live {...args} size="sm" />
    </div>
  ),
};

export const RightToLeft: Story = {
  render: (args) => (
    <div dir="rtl">
      <Live
        {...args}
        aria-label="الوصول لـ سارة"
        options={[
          { value: "rw", label: "قراءة وكتابة" },
          { value: "ro", label: "قراءة فقط" },
          { value: "none", label: "لا وصول" },
        ]}
      />
    </div>
  ),
};

export const MarkupLookingLabel: Story = {
  args: {
    options: [
      { value: "rw", label: '<img src=x onerror="alert(1)">' },
      { value: "ro", label: "Read only" },
    ],
  },
};
