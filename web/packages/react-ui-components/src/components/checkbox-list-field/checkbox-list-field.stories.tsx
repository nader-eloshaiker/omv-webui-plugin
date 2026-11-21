// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { CheckboxField } from "../checkbox-field/checkbox-field";
import { Identifier } from "../text/identifier";
import { CheckboxListField, CheckboxOptionGroup } from "./checkbox-list-field";

const meta = {
  title: "Components/CheckboxListField",
  component: CheckboxListField,
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  args: { legend: "Disks to combine", children: null },
} satisfies Meta<typeof CheckboxListField>;

export default meta;
type Story = StoryObj<typeof meta>;

interface Disk {
  device: string;
  model: string;
  size: string;
  serial: string;
  body?: string;
}

interface Section {
  label: string;
  description: string;
  disks: Disk[];
}

const EMPTY_SECTION: Section = {
  label: "Empty disks",
  description: "Nothing is stored on these disks.",
  disks: [
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
  ],
};

const REUSE_SECTION: Section = {
  label: "Erase and reuse",
  description: "These disks hold old data that will be erased.",
  disks: [
    {
      device: "/dev/sdd",
      model: "WDC WD40EFRX-68N32N0",
      size: "3.64 TiB",
      serial: "WD-EXAMPLE0000003",
      body: "Has 1 partition with an old ext4 file system labelled backup-2019. It will be erased.",
    },
    {
      device:
        "/dev/disk/by-id/ata-ST4000VN008-2DR166_ZEXAMPLE04-with-a-long-identifier",
      model: "ST4000VN008-2DR166 with a long model name from the enclosure",
      size: "3.64 TiB",
      serial: "ZEXAMPLE04000000000000000000",
      body: "Was part of a RAID array that no longer exists. What is left of it will be erased.",
    },
  ],
};

function DiskList({
  sections,
  initial = [],
  withSelectAll = false,
  min = 2,
}: {
  sections: Section[];
  initial?: string[];
  withSelectAll?: boolean;
  min?: number;
}) {
  const [chosen, setChosen] = React.useState<string[]>(initial);
  const shown = sections.filter((section) => section.disks.length > 0);
  const all = shown.flatMap((section) => section.disks.map((d) => d.device));
  const tooFew = chosen.length > 0 && chosen.length < min;
  return (
    <CheckboxListField
      legend="Disks to combine"
      hint="The disks become one file system as large as all of them together."
      footer={`${String(chosen.length)} of ${String(all.length)} chosen. Choose at least ${String(min)} disks.`}
      error={
        tooFew
          ? `Choose at least ${String(min)} disks, or choose a single disk instead of combining.`
          : undefined
      }
      selectAll={
        withSelectAll
          ? {
              selectAllLabel: "Select all",
              selectNoneLabel: "Select none",
              onSelectAll: () => setChosen(all),
              onSelectNone: () => setChosen([]),
            }
          : undefined
      }
    >
      {shown.map((section) => (
        <CheckboxOptionGroup
          key={section.label}
          label={section.label}
          description={section.description}
        >
          {section.disks.map((disk) => (
            <CheckboxField
              key={disk.device}
              label={
                <>
                  <span className="block">
                    <Identifier>{disk.device}</Identifier>, {disk.size}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {disk.model}, serial number{" "}
                    <Identifier>{disk.serial}</Identifier>
                  </span>
                </>
              }
              hint={disk.body}
              checked={chosen.includes(disk.device)}
              onCheckedChange={(checked) =>
                setChosen((current) =>
                  checked
                    ? [...current, disk.device]
                    : current.filter((d) => d !== disk.device),
                )
              }
            />
          ))}
        </CheckboxOptionGroup>
      ))}
    </CheckboxListField>
  );
}

/** One headed section of checkboxes, with the count line under the list. */
export const OneSection: Story = {
  render: () => <DiskList sections={[EMPTY_SECTION]} />,
};

/** Two sections; each checkbox is its own tab stop. */
export const TwoSections: Story = {
  render: () => (
    <DiskList
      sections={[EMPTY_SECTION, REUSE_SECTION]}
      initial={["/dev/sdb"]}
    />
  ),
};

/** "Erase and reuse" has no disks, so the caller leaves the section out. */
export const EmptySectionLeftOut: Story = {
  render: () => (
    <DiskList sections={[EMPTY_SECTION, { ...REUSE_SECTION, disks: [] }]} />
  ),
};

/** Select all and Select none above the list. */
export const WithSelectAll: Story = {
  render: () => (
    <DiskList sections={[EMPTY_SECTION, REUSE_SECTION]} withSelectAll />
  ),
};

/** Too few chosen: the error in words with its mark, under the count line. */
export const Invalid: Story = {
  render: () => (
    <DiskList
      sections={[EMPTY_SECTION, REUSE_SECTION]}
      initial={["/dev/sdc"]}
      withSelectAll
    />
  ),
};

/** Long device paths, models and serial numbers wrap inside 320px; nothing scrolls sideways. */
export const SectionsAt320px: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => (
    <DiskList sections={[EMPTY_SECTION, REUSE_SECTION]} withSelectAll />
  ),
};

/**
 * At 200% zoom the buttons, the headings, the serial line and the body line wrap; view this story
 * with the browser zoomed to check.
 */
export const SectionsZoom200Note: Story = {
  render: () => (
    <DiskList sections={[EMPTY_SECTION, REUSE_SECTION]} withSelectAll />
  ),
};

/** Markup-looking text renders as text. */
export const MarkupLookingText: Story = {
  args: {
    legend: "<b>Not bold</b>",
    footer: '<img src=x onerror="alert(1)">',
    children: (
      <CheckboxOptionGroup
        label="<script>alert(2)</script>"
        description="<i>Not italic</i>"
      >
        <CheckboxField label="<u>Not underlined</u>" />
      </CheckboxOptionGroup>
    ),
  },
};
