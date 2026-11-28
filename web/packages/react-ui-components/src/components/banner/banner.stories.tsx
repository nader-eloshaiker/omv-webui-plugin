// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LockOpen } from "lucide-react";
import { ExternalLink } from "../external-link/external-link";
import { NoticeBanner } from "./notice-banner";

const meta = {
  title: "Components/Banner",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** UI-12: a standing risk. The warning family's rules, icon and first sentence, on the raised ground. */
export const UnencryptedConnection: Story = {
  render: () => (
    <NoticeBanner
      label="Connection notice"
      tone="warning"
      title="This connection is not encrypted."
      icon={<LockOpen />}
      action={
        <ExternalLink href="#" newTabLabel="(opens in a new tab)">
          Use a secure connection (HTTPS)
        </ExternalLink>
      }
    >
      Passwords and settings you send can be read by others on the network.
    </NoticeBanner>
  ),
};

/** A normal user cannot change it: no action, and who can. */
export const UnencryptedConnectionUser: Story = {
  render: () => (
    <NoticeBanner
      label="Connection notice"
      tone="warning"
      title="This connection is not encrypted."
      icon={<LockOpen />}
    >
      Passwords and settings you send can be read by others on the network. Ask
      an administrator to turn on HTTPS.
    </NoticeBanner>
  ),
};

/** A standing fact with no risk in it: part of the frame. */
export const Neutral: Story = {
  render: () => (
    <NoticeBanner label="Notice">
      This NAS is being looked after by another administrator&apos;s session.
    </NoticeBanner>
  ),
};
