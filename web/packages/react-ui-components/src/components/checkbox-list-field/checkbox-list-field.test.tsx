// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { CheckboxField } from "../checkbox-field/checkbox-field";
import { CheckboxListField, CheckboxOptionGroup } from "./checkbox-list-field";

const DISKS = ["/dev/sdb", "/dev/sdc", "/dev/sdd"];

function Combine({
  error,
  withSelectAll = true,
  onChange = () => undefined,
}: {
  error?: string;
  withSelectAll?: boolean;
  onChange?: (chosen: string[]) => void;
}) {
  const [chosen, setChosen] = React.useState<string[]>([]);
  const update = (next: string[]) => {
    setChosen(next);
    onChange(next);
  };
  const box = (disk: string) => (
    <CheckboxField
      key={disk}
      label={disk}
      checked={chosen.includes(disk)}
      onCheckedChange={(checked) =>
        update(checked ? [...chosen, disk] : chosen.filter((d) => d !== disk))
      }
    />
  );
  return (
    <CheckboxListField
      legend="Disks to combine"
      hint="Each disk is erased."
      footer="Choose at least 2 disks."
      error={error}
      selectAll={
        withSelectAll
          ? {
              selectAllLabel: "Select all",
              selectNoneLabel: "Select none",
              onSelectAll: () => update(DISKS),
              onSelectNone: () => update([]),
            }
          : undefined
      }
    >
      <CheckboxOptionGroup
        label="Empty disks"
        description="Nothing is stored on these."
      >
        {DISKS.slice(0, 2).map(box)}
      </CheckboxOptionGroup>
      <CheckboxOptionGroup label="Erase and reuse">
        {DISKS.slice(2).map(box)}
      </CheckboxOptionGroup>
    </CheckboxListField>
  );
}

describe("CheckboxListField", () => {
  it("is a group named by its legend and described by its hint, footer and error", () => {
    render(<Combine error="Choose at least 2 disks to combine." />);
    const list = screen.getByRole("group", { name: "Disks to combine" });
    expect(list).toHaveAccessibleDescription(
      "Each disk is erased. Choose at least 2 disks. Choose at least 2 disks to combine.",
    );
    expect(list).toHaveAttribute("data-invalid");
    const error = screen
      .getByText("Choose at least 2 disks to combine.")
      .closest("p");
    // The error is words and a mark, never colour alone.
    expect(error?.querySelector("svg")).not.toBeNull();
  });

  it("is not marked invalid without an error", () => {
    render(<Combine />);
    expect(
      screen.getByRole("group", { name: "Disks to combine" }),
    ).not.toHaveAttribute("data-invalid");
  });

  it("names each section by its heading", () => {
    render(<Combine />);
    const list = screen.getByRole("group", { name: "Disks to combine" });
    const empty = within(list).getByRole("group", { name: "Empty disks" });
    expect(empty).toHaveAccessibleDescription("Nothing is stored on these.");
    expect(within(empty).getAllByRole("checkbox")).toHaveLength(2);
    const reuse = within(list).getByRole("group", { name: "Erase and reuse" });
    expect(within(reuse).getByRole("checkbox", { name: "/dev/sdd" })).toBe(
      screen.getByRole("checkbox", { name: "/dev/sdd" }),
    );
  });

  it("ticks and clears every option with Select all and Select none", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combine onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(onChange).toHaveBeenLastCalledWith(DISKS);
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).toHaveAttribute("aria-checked", "true");
    }
    await user.click(screen.getByRole("button", { name: "Select none" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).toHaveAttribute("aria-checked", "false");
    }
  });

  it("has no select-all buttons unless asked, and each checkbox is its own tab stop", async () => {
    const user = userEvent.setup();
    render(<Combine withSelectAll={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "/dev/sdb" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "/dev/sdc" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "/dev/sdd" })).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: "/dev/sdd" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
