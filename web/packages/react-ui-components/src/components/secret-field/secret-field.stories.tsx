// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button } from "../button/button";
import { FieldRequired } from "../field/field";
import { SecretField, type StoredSecretAnswer } from "./secret-field";

const meta = {
  title: "Components/Secret field",
  component: SecretField,
  args: { label: "Password", revealLabel: "Show password" },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof SecretField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = {
  args: {
    hint: "At least 12 characters. It is never shown again after saving.",
  },
};

export const StoredSecret: Story = {
  args: {
    label: "Shared secret",
    revealLabel: "Show shared secret",
    hint: "Used by the rsync server to check clients.",
    stored: {
      setLabel: "Set",
      changeLabel: "Change shared secret",
      keepLabel: "Keep the current one",
    },
  },
};

export const WithError: Story = {
  args: { error: "Use at least 12 characters." },
};

export const Disabled: Story = { args: { disabled: true } };

// The proxy's stored passwords (phase 5 network design 12.3): typed again or removed on every save.
function KeepOrRemove({
  initial = null,
  error,
  inputError,
}: {
  initial?: StoredSecretAnswer | null;
  error?: string;
  inputError?: string;
}) {
  const [choice, setChoice] = React.useState(initial);
  const [request, setRequest] = React.useState(0);
  return (
    <div className="flex flex-col gap-4">
      <SecretField
        key={request}
        label={
          <>
            HTTP proxy password<FieldRequired>Required</FieldRequired>
          </>
        }
        revealLabel="Show password"
        error={inputError}
        storedChoice={{
          setLabel: "Password: Set",
          keepLabel: "Keep it: type it again",
          removeLabel: "Remove the stored password",
          inputLabel: "Password",
          choice,
          onChoiceChange: setChoice,
          error,
        }}
      />
      <Button
        variant="neutral"
        size="sm"
        className="self-start"
        onClick={() => setRequest((n) => n + 1)}
      >
        Send a request (story control: empties the field)
      </Button>
    </div>
  );
}

/** A stored password, neither answer chosen yet: the save is unavailable until one is. */
export const KeepOrRemoveUnanswered: Story = {
  render: () => <KeepOrRemove />,
};

/** Keep it: the password typed again, never pre-filled. */
export const KeepTypeItAgain: Story = {
  render: () => <KeepOrRemove initial="keep" />,
};

export const RemoveTheStoredPassword: Story = {
  render: () => <KeepOrRemove initial="remove" />,
};

/** Save pressed with no answer: the required choice says what to do. */
export const KeepOrRemoveRequired: Story = {
  render: () => (
    <KeepOrRemove error="Type the stored password again, or remove it." />
  ),
};

/** Keep it, with the typed password refused. */
export const KeepWithError: Story = {
  render: () => (
    <KeepOrRemove initial="keep" inputError="Type the password to save." />
  ),
};
