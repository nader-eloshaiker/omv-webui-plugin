// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  RadioGroupField,
  RadioOption,
  RadioOptionGroup,
} from "./radio-group-field";

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

function DiskChoice({
  onValueChange = () => undefined,
}: {
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = React.useState("");
  return (
    <RadioGroupField
      legend="Disk"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    >
      <RadioOptionGroup
        label="Empty disks"
        description="Nothing is stored on these."
      >
        <RadioOption value="/dev/sdb" label="/dev/sdb, 3.64 TiB" />
        <RadioOption value="/dev/sdc" label="/dev/sdc, 3.64 TiB" />
      </RadioOptionGroup>
      <RadioOptionGroup
        label="Erase and reuse"
        description="What is on these disks will be erased."
      >
        <RadioOption value="/dev/sdd" label="/dev/sdd, 1.82 TiB" />
      </RadioOptionGroup>
      <RadioOptionGroup label="In use elsewhere">
        <RadioOption value="/dev/sde" label="/dev/sde, 931 GiB" />
      </RadioOptionGroup>
    </RadioGroupField>
  );
}

describe("RadioGroupField with sections", () => {
  it("names each section by its heading inside the one radio group", () => {
    render(<DiskChoice />);
    const radiogroup = screen.getByRole("radiogroup", { name: "Disk" });
    const empty = within(radiogroup).getByRole("group", {
      name: "Empty disks",
    });
    expect(empty).toHaveAccessibleDescription("Nothing is stored on these.");
    expect(within(empty).getAllByRole("radio")).toHaveLength(2);
    const last = within(radiogroup).getByRole("group", {
      name: "In use elsewhere",
    });
    expect(last).not.toHaveAttribute("aria-describedby");
    expect(within(radiogroup).getAllByRole("radio")).toHaveLength(4);
  });

  it("stays one tab stop, and the arrow keys run on across sections", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <>
        <button type="button">Before</button>
        <DiskChoice onValueChange={onValueChange} />
        <button type="button">After</button>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Before" }));
    await user.tab();
    const sdb = screen.getByRole("radio", { name: "/dev/sdb, 3.64 TiB" });
    expect(sdb).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    const sdc = screen.getByRole("radio", { name: "/dev/sdc, 3.64 TiB" });
    expect(sdc).toHaveFocus();
    // From the last option of the first section to the first of the second.
    await user.keyboard("{ArrowDown}");
    const sdd = screen.getByRole("radio", { name: "/dev/sdd, 1.82 TiB" });
    expect(sdd).toHaveFocus();
    expect(sdd).toHaveAttribute("aria-checked", "true");
    expect(onValueChange).toHaveBeenLastCalledWith("/dev/sdd");
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("radio", { name: "/dev/sde, 931 GiB" }),
    ).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(sdc).toHaveFocus();
    expect(onValueChange).toHaveBeenLastCalledWith("/dev/sdc");
    // One tab stop: Tab leaves the whole field, and Shift+Tab comes back to the chosen option.
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(sdc).toHaveFocus();
  });
});

describe("RadioGroupField unavailable but focusable", () => {
  it("stays in the tab order, says why and refuses every change", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <RadioGroupField
        legend="How to wipe"
        value="quick"
        onValueChange={onValueChange}
        disabled
        focusableWhenDisabled
        disabledReason="The disk is in use by an array."
      >
        <RadioOption value="quick" label="Quick wipe" />
        <RadioOption value="secure" label="Secure wipe" />
      </RadioGroupField>,
    );
    const group = screen.getByRole("radiogroup", { name: "How to wipe" });
    expect(group).toHaveAttribute("aria-disabled", "true");
    expect(group).toHaveAccessibleDescription(
      "The disk is in use by an array.",
    );
    await user.tab();
    const quick = screen.getByRole("radio", { name: "Quick wipe" });
    expect(quick).toHaveFocus();
    expect(quick).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{ArrowDown}");
    await user.click(screen.getByRole("radio", { name: "Secure wipe" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("adds the caller's description ids to the group's", () => {
    render(
      <>
        <p id="extra">Wiping erases everything on it.</p>
        <RadioGroupField
          legend="How to wipe"
          hint="Choose one."
          value="quick"
          onValueChange={() => undefined}
          aria-describedby="extra"
        >
          <RadioOption value="quick" label="Quick wipe" />
        </RadioGroupField>
      </>,
    );
    expect(screen.getByRole("radiogroup")).toHaveAccessibleDescription(
      "Choose one. Wiping erases everything on it.",
    );
  });
});
