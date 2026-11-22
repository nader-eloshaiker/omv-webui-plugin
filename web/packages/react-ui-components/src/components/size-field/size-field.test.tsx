// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { SizeField, type SizeFieldProps } from "./size-field";

const UNITS = [
  { value: "G", label: "GiB" },
  { value: "T", label: "TiB" },
] as const;

const TOO_SMALL =
  "It already holds 340.0 GiB. Choose a limit above that, or delete files first.";

/** Holds the number and the unit, as a form would, and reports each change. */
function Limit({
  onValueChange = () => undefined,
  onUnitChange = () => undefined,
  ...rest
}: Partial<SizeFieldProps>) {
  const [value, setValue] = React.useState("500");
  const [unit, setUnit] = React.useState("G");
  return (
    <SizeField
      label="Up to"
      unitLabel="Unit"
      units={UNITS}
      hint="A limit keeps one file system from filling the pool for the others."
      {...rest}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
      unit={unit}
      onUnitChange={(next) => {
        setUnit(next);
        onUnitChange(next);
      }}
    />
  );
}

describe("SizeField", () => {
  it("names the number by its label and the unit by unitLabel, and describes the number by its hint", () => {
    render(<Limit />);
    const input = screen.getByRole("textbox", { name: "Up to" });
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).not.toHaveAttribute("type", "number");
    expect(input).toHaveValue("500");
    expect(input).toHaveAccessibleDescription(
      "A limit keeps one file system from filling the pool for the others.",
    );
    const unit = screen.getByRole("combobox", { name: "Unit" });
    expect(unit).toHaveTextContent("GiB");
  });

  it("passes on the number as typed", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Limit onValueChange={onValueChange} />);
    const input = screen.getByRole("textbox", { name: "Up to" });
    await user.clear(input);
    await user.type(input, "1.5x");
    expect(onValueChange).toHaveBeenLastCalledWith("1.5x");
    expect(input).toHaveValue("1.5x");
  });

  it("passes on the chosen unit and keeps the number", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onUnitChange = vi.fn();
    render(<Limit onValueChange={onValueChange} onUnitChange={onUnitChange} />);
    await user.click(screen.getByRole("combobox", { name: "Unit" }));
    await user.click(await screen.findByRole("option", { name: "TiB" }));
    expect(onUnitChange).toHaveBeenCalledTimes(1);
    expect(onUnitChange).toHaveBeenCalledWith("T");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Up to" })).toHaveValue("500");
    expect(screen.getByRole("combobox", { name: "Unit" })).toHaveTextContent(
      "TiB",
    );
  });

  it("marks the number invalid and links the error to it", () => {
    render(<Limit error={TOO_SMALL} />);
    const input = screen.getByRole("textbox", { name: "Up to" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    const errorId = screen.getByText(TOO_SMALL).closest("[id]")?.id;
    expect(errorId).toBeTruthy();
    expect(input.getAttribute("aria-describedby")).toContain(errorId);
    expect(input).toHaveAccessibleDescription(
      expect.stringContaining(TOO_SMALL),
    );
  });

  it("is not invalid without an error", () => {
    render(<Limit />);
    expect(screen.getByRole("textbox", { name: "Up to" })).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  it("disables the number and the unit together, and keeps the reason readable", async () => {
    const user = userEvent.setup();
    const onUnitChange = vi.fn();
    render(
      <Limit
        disabled
        hint="Choose Up to to set a limit."
        onUnitChange={onUnitChange}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Up to" });
    expect(input).toBeDisabled();
    expect(input).toHaveAccessibleDescription("Choose Up to to set a limit.");
    const unit = screen.getByRole("combobox", { name: "Unit" });
    expect(unit).toBeDisabled();
    await user.click(unit);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(onUnitChange).not.toHaveBeenCalled();
  });

  it("is read-only when asked", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Limit readOnly onValueChange={onValueChange} />);
    const input = screen.getByRole("textbox", { name: "Up to" });
    expect(input).toHaveAttribute("readonly");
    await user.type(input, "1");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Unit" })).toHaveAttribute(
      "aria-readonly",
      "true",
    );
  });

  it("renders the caller's words as text, not markup", () => {
    render(
      <Limit
        label="<b>Up to</b>"
        error={'<img src="x" alt="injected">'}
        units={[{ value: "G", label: "<i>GiB</i>" }]}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: "<b>Up to</b>" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('<img src="x" alt="injected">'),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "injected" })).toBeNull();
    expect(document.querySelector("b, i")).toBeNull();
  });
});
