// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { SecretField, type StoredSecretAnswer } from "./secret-field";

describe("SecretField", () => {
  it("is never pre-filled, whatever a caller passes", () => {
    // A caller casting its way past the type must still get an empty field.
    const forced = { value: "hunter2", defaultValue: "hunter2" } as object;
    render(
      <SecretField label="Password" revealLabel="Show password" {...forced} />,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "new-password");
  });

  it("shows a stored secret as Set, with no input and no value in the page", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SecretField
        label="Shared secret"
        revealLabel="Show shared secret"
        stored={{
          setLabel: "Set",
          changeLabel: "Change shared secret",
          keepLabel: "Keep the current shared secret",
        }}
      />,
    );
    expect(screen.getByText("Set")).toBeInTheDocument();
    expect(container.querySelector("input")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Change shared secret" }),
    );
    const input = screen.getByLabelText("Shared secret");
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();

    await user.click(
      screen.getByRole("button", { name: "Keep the current shared secret" }),
    );
    expect(container.querySelector("input")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Change shared secret" }),
    ).toHaveFocus();
  });

  it("reveals what was typed only on request", async () => {
    const user = userEvent.setup();
    render(<SecretField label="Password" revealLabel="Show password" />);
    const input = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.type(input, "s3cret");
    await user.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);
    expect(input).toHaveAttribute("type", "password");
  });

  describe("a stored secret to keep or remove", () => {
    function KeepOrRemove({
      error,
      initial = null,
    }: {
      error?: string;
      initial?: StoredSecretAnswer | null;
    }) {
      const [choice, setChoice] = React.useState(initial);
      const [request, setRequest] = React.useState(0);
      return (
        <>
          <SecretField
            key={request}
            label="HTTP proxy password"
            revealLabel="Show password"
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
          <button type="button" onClick={() => setRequest((n) => n + 1)}>
            Save
          </button>
        </>
      );
    }

    it("asks for an answer with neither chosen, and no input yet", () => {
      const { container } = render(<KeepOrRemove />);
      const group = screen.getByRole("radiogroup", {
        name: "HTTP proxy password",
      });
      expect(group).toHaveAccessibleDescription(
        expect.stringContaining("Password: Set"),
      );
      expect(
        screen.getByRole("radio", { name: "Keep it: type it again" }),
      ).not.toBeChecked();
      expect(
        screen.getByRole("radio", { name: "Remove the stored password" }),
      ).not.toBeChecked();
      expect(container.querySelector("input[type=password]")).toBeNull();
    });

    it("refuses an unanswered choice in words", () => {
      render(
        <KeepOrRemove error="Type the stored password again, or remove it." />,
      );
      const group = screen.getByRole("radiogroup", {
        name: "HTTP proxy password",
      });
      expect(group).toHaveAttribute("aria-invalid", "true");
      expect(group).toHaveAccessibleDescription(
        expect.stringContaining(
          "Type the stored password again, or remove it.",
        ),
      );
    });

    it("shows an empty, required, masked input under Keep it, gone with Remove", async () => {
      const user = userEvent.setup();
      const { container } = render(<KeepOrRemove />);
      await user.click(
        screen.getByRole("radio", { name: "Keep it: type it again" }),
      );
      const input = screen.getByLabelText("Password");
      expect(input).toHaveValue("");
      expect(input).toBeRequired();
      expect(input).toHaveAttribute("type", "password");
      await user.type(input, "s3cret");
      await user.click(
        screen.getByRole("radio", { name: "Remove the stored password" }),
      );
      expect(container.querySelector("input[type=password]")).toBeNull();
      await user.click(
        screen.getByRole("radio", { name: "Keep it: type it again" }),
      );
      expect(screen.getByLabelText("Password")).toHaveValue("");
    });

    it("is emptied after a request by a new key", async () => {
      const user = userEvent.setup();
      render(<KeepOrRemove initial="keep" />);
      await user.type(screen.getByLabelText("Password"), "s3cret");
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.getByLabelText("Password")).toHaveValue("");
      expect(
        screen.getByRole("radio", { name: "Keep it: type it again" }),
      ).toBeChecked();
    });
  });
});
