// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../button/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "../table/table";
import { Page, PageHeader, PageSection, PairStack } from "./page-layout";

const meta = {
  title: "Layout/Page",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function DisksTable() {
  return (
    <Table aria-label="Disks">
      <TableHeader>
        <TableRow>
          <TableHead>Disk</TableHead>
          <TableHead>Model</TableHead>
          <TableHead numeric>Size</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell mono>/dev/sda</TableCell>
          <TableCell>
            <span>Example HDD 4TB</span>
            <span className="block text-xs text-muted-foreground">
              EXAMPLE-SERIAL-0101
            </span>
          </TableCell>
          <TableCell numeric>3.6 TiB</TableCell>
        </TableRow>
        <TableRow>
          <TableCell mono>/dev/sdb</TableCell>
          <TableCell>
            <span>Example HDD 8TB</span>
            <span className="block text-xs text-muted-foreground">
              EXAMPLE-SERIAL-0102
            </span>
          </TableCell>
          <TableCell numeric>7.3 TiB</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

/** A list page: the header, then its table two group steps under it, then a headed section. */
export const ListPage: Story = {
  render: () => (
    <Page>
      <PageHeader title={<h1 className="text-title">Disks</h1>}>
        <p className="max-w-prose">
          The disks connected to the NAS and what each one holds.
        </p>
      </PageHeader>
      <PageSection>
        <PairStack>
          <TableToolbar>
            <Button variant="neutral">Refresh</Button>
          </TableToolbar>
          <DisksTable />
        </PairStack>
      </PageSection>
      <PageSection
        heading="Found on the disks, not mounted"
        lead="These file systems are on the disks but not set up on this NAS."
      >
        <DisksTable />
      </PageSection>
    </Page>
  ),
};

/** A detail page: the parent's link, the title and its subtitle close together, then sections. */
export const DetailPage: Story = {
  render: () => (
    <Page>
      <PageHeader
        before={
          <a href="#" className="self-start text-link underline">
            File systems
          </a>
        }
        title={<h1 className="text-title">File system scratch</h1>}
        subtitle="EXT4, 7.8 GiB"
      >
        <p>This file system is mounted and in use.</p>
      </PageHeader>
      <PageSection
        heading="Technical details"
        lead="The file system's own report: how it was made and its internal state."
      >
        <div>
          <Button variant="neutral">Show technical details</Button>
        </div>
      </PageSection>
      <PageSection
        heading="Grow this file system"
        lead="Use this after the storage under the file system has been made bigger."
      >
        <div>
          <Button variant="neutral">Grow file system…</Button>
        </div>
      </PageSection>
    </Page>
  ),
};
