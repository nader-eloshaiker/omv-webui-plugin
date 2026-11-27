// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "../button/button";
import { InlineAlert } from "../inline-alert/inline-alert";
import { ServerMessage } from "../text/server-message";
import {
  NewPasswordFields,
  type NewPasswordFieldsProps,
} from "./new-password-fields";

const MISMATCH = "The two passwords are not the same.";

const NOT_ENCRYPTED = (
  <>
    This connection is not encrypted, so this password can be read by others on
    your network.{" "}
    <a
      href="#/system/certificates"
      className="rounded-sm text-link underline underline-offset-2 hover:no-underline"
    >
      Turn on HTTPS
    </a>
  </>
);

/**
 * Holds both values as the app's form does: checks they match when the second field is left and on
 * "Set password", and clears both after every request.
 */
function Live({
  first: firstLabel = "New password",
  start = ["", ""],
  checked = false,
  serverError,
  ...props
}: Partial<Omit<NewPasswordFieldsProps, "password" | "confirmation">> & {
  first?: string;
  start?: [string, string];
  checked?: boolean;
  serverError?: string;
}) {
  const [first, setFirst] = React.useState(start[0]);
  const [second, setSecond] = React.useState(start[1]);
  const [check, setCheck] = React.useState(checked);
  const mismatch = check && second !== "" && first !== second;
  return (
    <div className="flex flex-col gap-4">
      {serverError ? (
        <InlineAlert tone="critical" title="The password was not changed.">
          <ServerMessage label="Message from the server">
            {serverError}
          </ServerMessage>
        </InlineAlert>
      ) : null}
      <NewPasswordFields
        revealLabels={{ show: "Show password", hide: "Hide password" }}
        password={{
          label: firstLabel,
          hint: "A long password that alex uses nowhere else is hardest to guess.",
          value: first,
          onValueChange: setFirst,
        }}
        confirmation={{
          label: "Type it again",
          value: second,
          onValueChange: setSecond,
          onBlur: () => setCheck(true),
          error: mismatch ? MISMATCH : undefined,
        }}
        {...props}
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="neutral"
          onClick={() => {
            setFirst("");
            setSecond("");
            setCheck(false);
          }}
        >
          Cancel
        </Button>
        <Button
          loading={props.disabled}
          onClick={() => {
            setCheck(true);
            if (first !== "" && first === second) {
              // The request would run here; the fields are cleared whatever it returns.
              setFirst("");
              setSecond("");
              setCheck(false);
            }
          }}
        >
          {props.disabled ? "Setting…" : "Set password"}
        </Button>
      </div>
    </div>
  );
}

const meta = {
  title: "Components/New password fields",
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Over HTTPS: no connection line. */
export const Empty: Story = { render: () => <Live /> };

/** The add flow's words: "Password" and "Type it again". */
export const AddAPerson: Story = { render: () => <Live first="Password" /> };

export const Typed: Story = {
  render: () => (
    <Live start={["  correct horse battery ", "  correct horse battery "]} />
  ),
};

/** The first field shown; the second stays masked. Its toggle is pressed and says "Hide password". */
export const Revealed: Story = {
  render: () => (
    <Live start={["  correct horse battery ", "  correct horse battery "]} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [toggle] = canvas.getAllByRole("button", { name: "Show password" });
    if (toggle) {
      await userEvent.click(toggle);
    }
    await expect(
      canvas.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");
  },
};

export const Mismatch: Story = {
  render: () => (
    <Live start={["correct horse battery", "correct horse batery"]} checked />
  ),
};

/** The request failed: both fields are cleared, the server's words stand above them. */
export const ErrorFromTheServer: Story = {
  render: () => (
    <Live serverError="Failed to execute command 'export PATH=/bin:/sbin:/usr/bin:/usr/sbin; chpasswd': exit code 1" />
  ),
};

export const DisabledWhileSaving: Story = {
  render: () => (
    <Live start={["correct horse battery", "correct horse battery"]} disabled />
  ),
};

/** On HTTP: the line under the fields, with the caller's router link. */
export const NotEncrypted: Story = {
  render: () => <Live notice={NOT_ENCRYPTED} />,
};

export const NotEncryptedWithMismatch: Story = {
  render: () => (
    <Live
      start={["correct horse battery", "correct horse"]}
      checked
      notice={NOT_ENCRYPTED}
    />
  ),
};

/** After "Set password": both fields cleared and masked again. */
export const Cleared: Story = {
  render: () => (
    <Live start={["correct horse battery", "correct horse battery"]} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [toggle] = canvas.getAllByRole("button", { name: "Show password" });
    if (toggle) {
      await userEvent.click(toggle);
    }
    await userEvent.click(canvas.getByRole("button", { name: "Set password" }));
    await expect(canvas.getByLabelText("New password")).toHaveValue("");
    await expect(canvas.getByLabelText("New password")).toHaveAttribute(
      "type",
      "password",
    );
  },
};

/** 320px: the labels, hints and the connection line wrap; the toggles stay inside the fields. */
export const Narrow: Story = {
  decorators: [(Story) => <div className="w-[18rem]">{Story()}</div>],
  render: () => (
    <Live
      checked
      start={["correct horse battery", "correct"]}
      notice={NOT_ENCRYPTED}
    />
  ),
};

/** Markup-looking words render as text. */
export const MarkupLookingText: Story = {
  render: () => (
    <NewPasswordFields
      revealLabels={{ show: "Show password", hide: "Hide password" }}
      password={{
        label: "<b>Not bold</b>",
        hint: '<img src=x onerror="alert(1)">',
        value: "",
        onValueChange: () => undefined,
      }}
      confirmation={{
        label: "Type it again",
        error: "<i>Not italic</i>",
        value: "",
        onValueChange: () => undefined,
      }}
    />
  ),
};
