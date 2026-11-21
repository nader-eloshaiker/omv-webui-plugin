// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { NumberField } from "./number-field";

function Interval({
  onValueChange,
  error,
}: {
  onValueChange: (value: string) => void;
  error?: string;
}) {
  const [value, setValue] = React.useState("30");
  return (
    <NumberField
      label="Check every"
      unit="minutes"
      hint="Every 30 minutes suits most homes."
      error={error}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    />
  );
}

describe("NumberField", () => {
  it("is named by its label and its unit, and described by its hint", () => {
    render(<Interval onValueChange={() => undefined} />);
    const input = screen.getByRole("textbox", { name: "Check every minutes" });
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveValue("30");
    expect(screen.getByText("minutes")).toBeVisible();
    expect(input).toHaveAccessibleDescription(
      "Every 30 minutes suits most homes.",
    );
  });

  it("is named by its label alone without a unit", () => {
    render(
      <NumberField label="Limit" value="" onValueChange={() => undefined} />,
    );
    expect(screen.getByRole("textbox", { name: "Limit" })).toBeInTheDocument();
  });

  it("shows its error and marks the input invalid", () => {
    render(
      <Interval
        onValueChange={() => undefined}
        error="Enter a whole number of minutes from 1 to 1440."
      />,
    );
    const input = screen.getByRole("textbox", { name: "Check every minutes" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(
      screen
        .getByText("Enter a whole number of minutes from 1 to 1440.")
        .closest("[id]")?.id,
    );
  });

  it("passes on the text as typed", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Interval onValueChange={onValueChange} />);
    const input = screen.getByRole("textbox", { name: "Check every minutes" });
    await user.clear(input);
    await user.type(input, "4a");
    expect(onValueChange).toHaveBeenLastCalledWith("4a");
    expect(input).toHaveValue("4a");
  });
});
