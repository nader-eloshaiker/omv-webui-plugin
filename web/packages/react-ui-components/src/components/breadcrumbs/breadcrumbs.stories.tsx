// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BreadcrumbItem, Breadcrumbs } from "./breadcrumbs";

const meta = {
  title: "Components/Breadcrumbs",
  component: Breadcrumbs,
  args: { "aria-label": "Breadcrumb" },
} satisfies Meta<typeof Breadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

const mono = "font-mono text-[0.95em]";

export const TwoLevels: Story = {
  render: (args) => (
    <Breadcrumbs {...args}>
      <BreadcrumbItem href="#disks">Disks</BreadcrumbItem>
      <BreadcrumbItem current className={mono}>
        /dev/sdb
      </BreadcrumbItem>
    </Breadcrumbs>
  ),
};

export const ThreeLevels: Story = {
  render: (args) => (
    <Breadcrumbs {...args}>
      <BreadcrumbItem href="#storage">Storage</BreadcrumbItem>
      <BreadcrumbItem href="#smart">Disk health</BreadcrumbItem>
      <BreadcrumbItem current>Set up monitoring</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

/** A long device path as the current page breaks anywhere rather than widening the page. */
export const LongMonoLastItem: Story = {
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  render: (args) => (
    <Breadcrumbs {...args}>
      <BreadcrumbItem href="#disks">Disks</BreadcrumbItem>
      <BreadcrumbItem current className={mono}>
        /dev/disk/by-id/ata-WDC_WD40EFRX-68N32N0_WD-WCC7K0000000000-part1
      </BreadcrumbItem>
    </Breadcrumbs>
  ),
};

export const At320px: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: (args) => (
    <Breadcrumbs {...args}>
      <BreadcrumbItem href="#smart">Disk health</BreadcrumbItem>
      <BreadcrumbItem href="#tests">Scheduled self-tests</BreadcrumbItem>
      <BreadcrumbItem current className={mono}>
        /dev/nvme0n1
      </BreadcrumbItem>
    </Breadcrumbs>
  ),
};
