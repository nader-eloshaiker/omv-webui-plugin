// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { NumberField } from "../number-field/number-field";
import { Identifier } from "../text/identifier";
import {
  RadioGroupField,
  RadioOption,
  RadioOptionGroup,
} from "./radio-group-field";

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

interface DiskOption {
  device: string;
  model: string;
  size: string;
  serial: string;
  body?: string;
}

const EMPTY_DISKS: DiskOption[] = [
  {
    device: "/dev/sdb",
    model: "WDC WD40EFRX-68N32N0",
    size: "3.64 TiB",
    serial: "WD-EXAMPLE0000001",
  },
  {
    device: "/dev/sdc",
    model: "ST4000VN008-2DR166",
    size: "3.64 TiB",
    serial: "ZEXAMPLE02",
  },
];

const REUSE_DISKS: DiskOption[] = [
  {
    device: "/dev/sdd",
    model: "Samsung SSD 870 EVO 2TB",
    size: "1.82 TiB",
    serial: "S6EXAMPLE000003",
    body: "Has 2 partitions with an old ext4 file system labelled backup-2019. They will be erased.",
  },
];

const IN_USE_DISKS: DiskOption[] = [
  {
    device: "/dev/disk/by-id/usb-WD_Elements_25A3_575845584D504C4530303034-0:0",
    model:
      "WD Elements 25A3 external USB enclosure with a very long model name",
    size: "931 GiB",
    serial: "WXEXAMPLE0000000000000000004",
    body: "Holds the file system media, shared as media and photos, and used by 2 scheduled backups. Choosing it erases all of that.",
  },
];

/** A disk as one option: the device and size, the model and serial on their own line, a body line. */
function DiskRadio({ disk }: { disk: DiskOption }) {
  return (
    <RadioOption
      value={disk.device}
      label={
        <>
          <span className="block">
            <Identifier>{disk.device}</Identifier>, {disk.size}
          </span>
          <span className="block text-sm text-muted-foreground">
            {disk.model}, serial number <Identifier>{disk.serial}</Identifier>
          </span>
        </>
      }
      hint={disk.body}
    />
  );
}

function DiskChoice({
  sections,
}: {
  sections: { label: string; description?: string; disks: DiskOption[] }[];
}) {
  const [value, setValue] = React.useState("");
  return (
    <RadioGroupField
      legend="Disk"
      hint="The file system takes the whole disk."
      value={value}
      onValueChange={setValue}
    >
      {sections
        // A section with no disks is left out, not drawn empty.
        .filter((section) => section.disks.length > 0)
        .map((section) => (
          <RadioOptionGroup
            key={section.label}
            label={section.label}
            description={section.description}
          >
            {section.disks.map((disk) => (
              <DiskRadio key={disk.device} disk={disk} />
            ))}
          </RadioOptionGroup>
        ))}
    </RadioGroupField>
  );
}

const EMPTY_SECTION = {
  label: "Empty disks",
  description: "Nothing is stored on these disks.",
  disks: EMPTY_DISKS,
};
const REUSE_SECTION = {
  label: "Erase and reuse",
  description: "These disks hold old data that will be erased.",
  disks: REUSE_DISKS,
};
const IN_USE_SECTION = {
  label: "In use",
  description: "Choosing one of these erases what it holds now.",
  disks: IN_USE_DISKS,
};
const SECTIONS = [EMPTY_SECTION, REUSE_SECTION, IN_USE_SECTION];

/** One headed section: still one radio group. */
export const OneSection: Story = {
  render: () => <DiskChoice sections={[EMPTY_SECTION]} />,
};

/**
 * Three sections in one radio group: one tab stop, and the arrow keys run on from the last option of
 * a section to the first of the next.
 */
export const ThreeSections: Story = {
  render: () => <DiskChoice sections={SECTIONS} />,
};

/** "Erase and reuse" has no disks, so the caller leaves the section out. */
export const EmptySectionLeftOut: Story = {
  render: () => (
    <DiskChoice
      sections={[
        EMPTY_SECTION,
        { ...REUSE_SECTION, disks: [] },
        IN_USE_SECTION,
      ]}
    />
  ),
};

/** Long device paths, models and serial numbers wrap inside 320px; nothing scrolls sideways. */
export const SectionsAt320px: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => <DiskChoice sections={SECTIONS} />,
};

/**
 * At 200% zoom the headings, the serial line and the body line wrap under the label; view this story
 * with the browser zoomed to check.
 */
export const SectionsZoom200Note: Story = {
  render: () => <DiskChoice sections={SECTIONS} />,
};
