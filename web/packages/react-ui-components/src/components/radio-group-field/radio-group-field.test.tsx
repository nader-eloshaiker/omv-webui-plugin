// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { RadioGroupField, RadioOption } from "./radio-group-field";

function Method({
  onValueChange = () => undefined,
  error,
}: {
  onValueChange?: (value: string) => void;
  error?: string;
}) {
  const [value, setValue] = React.useState("quick");
  return (
    <RadioGroupField
      legend="How to wipe"
      hint="Both erase what the NAS can see."
      error={error}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    >
      <RadioOption
        value="quick"
        label="Quick wipe (recommended)"
        hint="Takes a few seconds."
      />
      <RadioOption value="secure" label="Secure wipe" hint="Takes many hours.">
        <p>Nested content</p>
      </RadioOption>
      <RadioOption
        value="other"
        label="Another way"
        hint="Not available on this disk."
        disabled
      />
    </RadioGroupField>
  );
}

describe("RadioGroupField", () => {
  it("is a group named by its legend, each option named by its label and described by its hint", () => {
    render(<Method error="Choose how to wipe." />);
    const group = screen.getByRole("radiogroup", { name: "How to wipe" });
    expect(group).toHaveAccessibleDescription(
      "Both erase what the NAS can see. Choose how to wipe.",
    );
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choose how to wipe.")).toBeInTheDocument();
    const quick = screen.getByRole("radio", {
      name: "Quick wipe (recommended)",
    });
    expect(quick).toHaveAccessibleDescription("Takes a few seconds.");
    expect(quick).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Nested content")).toBeInTheDocument();
  });

  it("is one tab stop, and the arrow keys move between options and choose", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <>
        <Method onValueChange={onValueChange} />
        <button type="button">After</button>
      </>,
    );
    await user.tab();
    const quick = screen.getByRole("radio", {
      name: "Quick wipe (recommended)",
    });
    expect(quick).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    const secure = screen.getByRole("radio", { name: "Secure wipe" });
    expect(secure).toHaveFocus();
    expect(secure).toHaveAttribute("aria-checked", "true");
    expect(onValueChange).toHaveBeenLastCalledWith("secure");
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("chooses from the label, and not a disabled option", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Method onValueChange={onValueChange} />);
    await user.click(screen.getByText("Secure wipe"));
    expect(onValueChange).toHaveBeenLastCalledWith("secure");
    await user.click(screen.getByText("Another way"));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("radio", { name: "Another way" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
