// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import type * as React from "react";
import { BreadcrumbItem, Breadcrumbs } from "./breadcrumbs";

const meta = {
  title: "Components/Breadcrumbs",
  component: Breadcrumbs,
  args: { "aria-label": "Breadcrumb" },
} satisfies Meta<typeof Breadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The page's own heading under the link, as a page lays them out. */
function PageHead({
  children,
  title,
}: {
  children: React.ReactNode;
  title: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      {children}
      <h1 className="text-title text-foreground [overflow-wrap:anywhere]">
        {title}
      </h1>
    </div>
  );
}

/** A shared folder's page: the link back to the list above its title. */
export const ParentPage: Story = {
  render: (args) => (
    <PageHead title="Photos">
      <Breadcrumbs {...args}>
        <BreadcrumbItem href="#shared-folders">Shared folders</BreadcrumbItem>
      </Breadcrumbs>
    </PageHead>
  ),
};

/**
 * A caller that still passes the whole trail, with the current page last: only the nearest ancestor
 * is shown ("Disk health").
 */
export const FullTrailPassed: Story = {
  render: (args) => (
    <PageHead title="Set up disk monitoring">
      <Breadcrumbs {...args}>
        <BreadcrumbItem href="#storage">Storage</BreadcrumbItem>
        <BreadcrumbItem href="#smart">Disk health</BreadcrumbItem>
        <BreadcrumbItem current>Set up monitoring</BreadcrumbItem>
      </Breadcrumbs>
    </PageHead>
  ),
};

/** Over a long device path in the title, at phone width: the title breaks anywhere. */
export const At320px: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: (args) => (
    <PageHead
      title={
        <>
          Disk{" "}
          <code className="font-mono text-[0.95em]">
            /dev/disk/by-id/ata-WDC_WD40EFRX-68N32N0_WD-WCC7K0000000000
          </code>
        </>
      }
    >
      <Breadcrumbs {...args}>
        <BreadcrumbItem href="#disks">Disks</BreadcrumbItem>
      </Breadcrumbs>
    </PageHead>
  ),
};

/** A parent page whose name comes from the backend renders as text, never as markup. */
export const MarkupLookingName: Story = {
  render: (args) => (
    <PageHead title="Edit access">
      <Breadcrumbs {...args}>
        <BreadcrumbItem href="#share">
          {'<b onclick="x()">media</b>'}
        </BreadcrumbItem>
      </Breadcrumbs>
    </PageHead>
  ),
};
