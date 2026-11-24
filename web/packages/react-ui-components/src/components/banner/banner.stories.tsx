// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LockOpen } from "lucide-react";
import { Button } from "../button/button";
import { NoticeBanner } from "./notice-banner";

const meta = {
  title: "Components/Banner",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnencryptedConnection: Story = {
  render: () => (
    <NoticeBanner
      label="Connection notice"
      icon={<LockOpen />}
      action={
        <Button variant="neutral" size="sm">
          Use a secure connection (HTTPS)
        </Button>
      }
    >
      This connection is not encrypted. Passwords you type here can be read by
      others on the network.
    </NoticeBanner>
  ),
};
