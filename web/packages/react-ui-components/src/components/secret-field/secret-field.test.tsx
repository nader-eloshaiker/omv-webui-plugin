// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SecretField } from "./secret-field";

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
});
