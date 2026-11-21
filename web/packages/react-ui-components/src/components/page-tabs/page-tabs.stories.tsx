// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageTab, PageTabs } from "./page-tabs";

const meta = {
  title: "Components/Page tabs",
  component: PageTabs,
  args: { "aria-label": "Services" },
} satisfies Meta<typeof PageTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <PageTabs {...args}>
      <PageTab href="#smb" current>
        SMB/CIFS
      </PageTab>
      <PageTab href="#nfs">NFS</PageTab>
      <PageTab href="#ssh">SSH</PageTab>
    </PageTabs>
  ),
};

export const NoneCurrent: Story = {
  render: (args) => (
    <PageTabs {...args}>
      <PageTab href="#smb">SMB/CIFS</PageTab>
      <PageTab href="#nfs">NFS</PageTab>
      <PageTab href="#ssh">SSH</PageTab>
    </PageTabs>
  ),
};

export const WrapsAt320px: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: (args) => (
    <PageTabs {...args}>
      <PageTab href="#settings">Settings</PageTab>
      <PageTab href="#shares" current>
        Shared folders on the network
      </PageTab>
      <PageTab href="#users">Users allowed to sign in</PageTab>
      <PageTab href="#status">Who is connected now</PageTab>
    </PageTabs>
  ),
};
