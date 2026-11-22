// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  NewPasswordFields,
  type NewPasswordFieldsProps,
} from "./new-password-fields";

const REVEAL = { show: "Show password", hide: "Hide password" };

/** Holds both values as the app's form would, with a button that clears them as after a request. */
function Form({
  onPassword = () => undefined,
  errors = {},
  ...rest
}: Partial<Omit<NewPasswordFieldsProps, "password" | "confirmation">> & {
  onPassword?: (value: string) => void;
  errors?: { password?: string; confirmation?: string };
}) {
  const [first, setFirst] = React.useState("");
  const [second, setSecond] = React.useState("");
  return (
    <>
      <NewPasswordFields
        {...rest}
        revealLabels={REVEAL}
        password={{
          label: "New password",
          hint: "A long password that alex uses nowhere else is hardest to guess.",
          error: errors.password,
          value: first,
          onValueChange: (value) => {
            setFirst(value);
            onPassword(value);
          },
        }}
        confirmation={{
          label: "Type it again",
          error: errors.confirmation,
          value: second,
          onValueChange: setSecond,
        }}
      />
      <button
        type="button"
        onClick={() => {
          setFirst("");
          setSecond("");
        }}
      >
        Request returned
      </button>
    </>
  );
}

function fields() {
  return {
    first: screen.getByLabelText("New password"),
    second: screen.getByLabelText("Type it again"),
  };
}

function toggles() {
  return screen.getAllByRole("button", { name: /password$/ });
}

describe("NewPasswordFields", () => {
  it("is two masked fields for a new password, each named by its label", () => {
    render(<Form />);
    const { first, second } = fields();
    for (const input of [first, second]) {
      expect(input).toHaveAttribute("type", "password");
      expect(input).toHaveAttribute("autocomplete", "new-password");
      expect(input).toHaveAttribute("spellcheck", "false");
      expect(input).toHaveValue("");
    }
    expect(first).toHaveAccessibleDescription(
      "A long password that alex uses nowhere else is hardest to guess.",
    );
  });

  it("keeps the value exactly as typed, spaces at either end included", async () => {
    const user = userEvent.setup();
    const onPassword = vi.fn();
    render(<Form onPassword={onPassword} />);
    const { first } = fields();
    await user.type(first, "  correct horse ");
    expect(onPassword).toHaveBeenLastCalledWith("  correct horse ");
    expect(first).toHaveValue("  correct horse ");
  });

  it("allows paste", async () => {
    const user = userEvent.setup();
    const onPassword = vi.fn();
    render(<Form onPassword={onPassword} />);
    await user.click(fields().first);
    await user.paste("pasted from a manager");
    expect(onPassword).toHaveBeenLastCalledWith("pasted from a manager");
  });

  it("never writes the password into the markup, storage or the console", async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "debug"),
    ];
    const { container } = render(<Form />);
    const { first, second } = fields();
    await user.type(first, "s3cret-value");
    await user.type(second, "s3cret-value");
    await user.click(toggles()[0]!);
    expect(first).not.toHaveAttribute("value");
    expect(second).not.toHaveAttribute("value");
    // Not in any attribute or text node of the markup.
    for (const element of container.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(attribute.value).not.toContain("s3cret-value");
      }
    }
    expect(container.textContent).not.toContain("s3cret-value");
    expect(setItem).not.toHaveBeenCalled();
    for (const log of logs) {
      expect(log).not.toHaveBeenCalled();
    }
  });

  it("gives each field its own reveal toggle, pressed when shown, named for what it does", async () => {
    const user = userEvent.setup();
    render(<Form />);
    const { first, second } = fields();
    const [revealFirst, revealSecond] = toggles();
    expect(revealFirst).toHaveAccessibleName("Show password");
    expect(revealFirst).toHaveAttribute("aria-pressed", "false");
    expect(revealFirst).toHaveAttribute("aria-controls", first.id);
    expect(revealSecond).toHaveAttribute("aria-controls", second.id);
    await user.click(revealFirst!);
    expect(first).toHaveAttribute("type", "text");
    expect(second).toHaveAttribute("type", "password");
    expect(revealFirst).toHaveAttribute("aria-pressed", "true");
    expect(revealFirst).toHaveAccessibleName("Hide password");
    // The toggle is not a live region and carries no value: nothing reads the password out.
    expect(revealFirst).not.toHaveAttribute("aria-live");
    expect(revealFirst!.textContent).toBe("");
    await user.click(revealFirst!);
    expect(first).toHaveAttribute("type", "password");
  });

  it("empties both fields and masks them again when the caller clears its values", async () => {
    const user = userEvent.setup();
    render(<Form />);
    const { first, second } = fields();
    await user.type(first, "one");
    await user.type(second, "one");
    await user.click(toggles()[0]!);
    await user.click(toggles()[1]!);
    await user.click(screen.getByRole("button", { name: "Request returned" }));
    expect(first).toHaveValue("");
    expect(second).toHaveValue("");
    expect(first).toHaveAttribute("type", "password");
    expect(second).toHaveAttribute("type", "password");
    for (const toggle of toggles()) {
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("links each error to its own field and marks it invalid", () => {
    render(
      <Form errors={{ confirmation: "The two passwords are not the same." }} />,
    );
    const { first, second } = fields();
    expect(second).toHaveAttribute("aria-invalid", "true");
    expect(second).toHaveAccessibleDescription(
      "The two passwords are not the same.",
    );
    expect(first).not.toHaveAttribute("aria-invalid");
  });

  it("shows the unencrypted-connection line under the fields, as the first field's description", () => {
    render(
      <Form
        notice={
          <>
            This connection is not encrypted, so this password can be read by
            others on your network. <a href="#https">Turn on HTTPS</a>
          </>
        }
      />,
    );
    const { first } = fields();
    expect(first).toHaveAccessibleDescription(
      /This connection is not encrypted.*Turn on HTTPS/,
    );
    expect(
      screen.getByRole("link", { name: "Turn on HTTPS" }),
    ).toBeInTheDocument();
  });

  it("makes both fields and both toggles unavailable while saving", () => {
    render(<Form disabled />);
    const { first, second } = fields();
    expect(first).toBeDisabled();
    expect(second).toBeDisabled();
    for (const toggle of toggles()) {
      expect(toggle).toBeDisabled();
    }
  });

  it("empties its inputs when it unmounts", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Form />);
    const { first } = fields();
    await user.type(first, "left behind");
    unmount();
    expect((first as HTMLInputElement).value).toBe("");
  });

  it("hands the caller the input, to move focus to it after a failure", () => {
    const ref = React.createRef<HTMLInputElement>();
    render(
      <NewPasswordFields
        revealLabels={REVEAL}
        password={{
          label: "New password",
          value: "",
          onValueChange: () => undefined,
          inputRef: ref,
        }}
        confirmation={{
          label: "Type it again",
          value: "",
          onValueChange: () => undefined,
        }}
      />,
    );
    expect(ref.current).toBe(screen.getByLabelText("New password"));
  });
});
