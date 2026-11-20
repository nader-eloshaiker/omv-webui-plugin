// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Identifier } from "./identifier";
import { ServerMessage } from "./server-message";

const meta = {
  title: "Foundations/Writing",
  parameters: {
    docs: {
      description: {
        component:
          "Identifiers sit inside translated sentences through the app's <Trans> component, so each language keeps its word order: " +
          't("disks.wipe.title", ...) with the catalogue entry "Wipe disk <id>{{device}}</id>?" rendered as ' +
          '<Trans i18nKey="disks.wipe.title" values={{ device }} components={{ id: <Identifier /> }} />. ' +
          "A sentence never starts with a lowercase identifier: put the kind of thing first.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const IdentifiersInSentences: Story = {
  render: () => (
    <div className="flex max-w-prose flex-col gap-2">
      <p>
        Wipe disk <Identifier>/dev/sdb</Identifier>, serial{" "}
        <Identifier>WD-EXAMPLE0001</Identifier>, 3.6{" "}TiB?
      </p>
      <p>
        The shared folder <Identifier>media</Identifier> is shared over SMB.
      </p>
      <p>
        Open the NAS at <Identifier>192.0.2.20</Identifier> after the address
        changes.
      </p>
    </div>
  ),
};

export const MessageFromTheServer: Story = {
  render: () => (
    <div className="flex max-w-prose flex-col gap-2">
      <p>The share could not be created. Nothing was changed.</p>
      <ServerMessage label="Message from the server">
        {"Failed to execute command 'net conf addshare media': exit code 255"}
      </ServerMessage>
    </div>
  ),
};
