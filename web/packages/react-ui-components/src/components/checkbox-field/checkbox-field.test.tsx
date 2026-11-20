// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CheckboxField } from "./checkbox-field";

describe("CheckboxField", () => {
  it("is named by its label and described by its hint and error", () => {
    render(
      <CheckboxField
        label="Allow the root account to sign in"
        hint="It is safer to leave this off."
        error="Choose at least one way of signing in."
      />,
    );
    const box = screen.getByRole("checkbox", {
      name: "Allow the root account to sign in",
    });
    const describedBy = box.getAttribute("aria-describedby") ?? "";
    const hint = screen.getByText("It is safer to leave this off.");
    const error = screen
      .getByText("Choose at least one way of signing in.")
      .closest("[id]");
    expect(describedBy).toContain(hint.id);
    expect(describedBy).toContain(error?.id);
    expect(box).toHaveAttribute("aria-invalid", "true");
  });

  it("toggles from its label and with Space", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <CheckboxField label="Turn on SSH" onCheckedChange={onCheckedChange} />,
    );
    const box = screen.getByRole("checkbox", { name: "Turn on SSH" });
    await user.click(screen.getByText("Turn on SSH"));
    expect(box).toHaveAttribute("aria-checked", "true");
    box.focus();
    await user.keyboard(" ");
    expect(box).toHaveAttribute("aria-checked", "false");
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it("does not change while disabled, and still gives its reason", async () => {
    const user = userEvent.setup();
    render(
      <CheckboxField
        label="Compress data"
        hint="Turn on SSH to change this."
        disabled
        defaultChecked
      />,
    );
    const box = screen.getByRole("checkbox", { name: "Compress data" });
    await user.click(screen.getByText("Compress data"));
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(box).toHaveAttribute("aria-disabled", "true");
    expect(box.getAttribute("aria-describedby")).toContain(
      screen.getByText("Turn on SSH to change this.").id,
    );
  });
});
