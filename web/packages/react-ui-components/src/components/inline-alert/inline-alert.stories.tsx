// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExternalLink } from "../external-link/external-link";
import { ServerMessage } from "../text/server-message";
import { InlineAlert } from "./inline-alert";

const meta = {
  title: "Components/InlineAlert",
  component: InlineAlert,
  decorators: [(Story) => <div className="max-w-lg">{Story()}</div>],
} satisfies Meta<typeof InlineAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CriticalWithServerMessage: Story = {
  args: {
    tone: "critical",
    title: "The SSH settings were not saved.",
    children: (
      <>
        <p>Check the values below and try again.</p>
        <ServerMessage label="Message from the server">
          {
            "Invalid RPC response. Please check the syslog for more information."
          }
        </ServerMessage>
      </>
    ),
  },
};

export const CriticalSignIn: Story = {
  args: {
    tone: "critical",
    title: "Too many attempts",
    children: <p>Wait a few minutes before you try again.</p>,
  },
};

export const Neutral: Story = {
  args: {
    tone: "neutral",
    children:
      "Saved SSH settings are waiting to be applied. The form shows the saved settings, which are not in effect yet.",
  },
};

export const NeutralWithTitle: Story = {
  args: {
    tone: "neutral",
    title: "This account is locked",
    children: (
      <p>
        Your administrator has locked this account&apos;s details and password.
        Ask them if something needs changing.
      </p>
    ),
  },
};

/** A warning about the current values, under the fields it concerns: neutral, never blocking. */
export const FieldGroupWarning: Story = {
  args: {
    tone: "neutral",
    children: (
      <>
        <p>
          The root account can sign in with only a password. Anyone who guesses
          it controls the NAS. Turn off root sign-in, or allow keys only.
        </p>
        <ExternalLink
          href="/#/usermgmt/users"
          newTabLabel="(opens in a new tab)"
        >
          Add keys under Users in the classic interface
        </ExternalLink>
      </>
    ),
  },
};

export const MarkupLookingText: Story = {
  args: {
    tone: "critical",
    title: "Your details were not saved.",
    children: (
      <ServerMessage label="Message from the server">
        {'<script>alert("x")</script> is not a valid email address.'}
      </ServerMessage>
    ),
  },
};
