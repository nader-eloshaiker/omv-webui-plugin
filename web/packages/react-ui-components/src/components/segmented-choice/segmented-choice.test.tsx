// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SegmentedChoice,
  type SegmentedChoiceOption,
  type SegmentedChoiceProps,
} from "./segmented-choice";

type Access = "rw" | "ro" | "none" | "blocked";

const OPTIONS: readonly SegmentedChoiceOption<Access>[] = [
  { value: "rw", label: "Read and write" },
  { value: "ro", label: "Read only" },
  { value: "none", label: "No access" },
];

/** Holds the value, as the grid would, and reports each change. */
function Access({
  initial = "ro",
  onValueChange = () => undefined,
  ...rest
}: Partial<Omit<SegmentedChoiceProps<Access>, "value">> & {
  initial?: Access | null;
}) {
  const [value, setValue] = React.useState<Access | null>(initial);
  return (
    <SegmentedChoice<Access>
      options={OPTIONS}
      aria-label="Access for alex"
      {...rest}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    />
  );
}

describe("SegmentedChoice", () => {
  it("is a radio group named by aria-label, each option named once by its label", () => {
    render(<Access />);
    const group = screen.getByRole("radiogroup", { name: "Access for alex" });
    expect(group).not.toHaveAttribute("aria-invalid");
    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.textContent)).toEqual([
      "Read and writeRead and write",
      "Read onlyRead only",
      "No accessNo access",
    ]);
    // The hidden bold copy that holds the width is not part of the name.
    expect(screen.getByRole("radio", { name: "Read only" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("radio", { name: "Read and write" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("is one tab stop, on the checked option", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <Access />
        <button type="button">After</button>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Before" }));
    await user.tab();
    expect(screen.getByRole("radio", { name: "Read only" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("moves and chooses with the arrow keys", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Access onValueChange={onValueChange} />);
    await user.tab();
    await user.keyboard("{ArrowRight}");
    const none = screen.getByRole("radio", { name: "No access" });
    expect(none).toHaveFocus();
    expect(none).toHaveAttribute("aria-checked", "true");
    expect(onValueChange).toHaveBeenLastCalledWith("none");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(
      screen.getByRole("radio", { name: "Read and write" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(onValueChange).toHaveBeenLastCalledWith("rw");
  });

  it("goes to the first and last option with Home and End, skipping a disabled one", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Access
        onValueChange={onValueChange}
        options={[
          { value: "rw", label: "Read and write", disabled: true },
          { value: "ro", label: "Read only" },
          { value: "none", label: "No access" },
        ]}
      />,
    );
    await user.tab();
    await user.keyboard("{End}");
    const none = screen.getByRole("radio", { name: "No access" });
    expect(none).toHaveFocus();
    expect(none).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{Home}");
    const ro = screen.getByRole("radio", { name: "Read only" });
    expect(ro).toHaveFocus();
    expect(ro).toHaveAttribute("aria-checked", "true");
    expect(onValueChange.mock.calls).toEqual([["none"], ["ro"]]);
  });

  it("chooses on click", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Access onValueChange={onValueChange} />);
    await user.click(screen.getByRole("radio", { name: "Read and write" }));
    expect(onValueChange).toHaveBeenCalledWith("rw");
  });

  it("with nothing chosen, tabs to the first option and chooses nothing until asked", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Access initial={null} onValueChange={onValueChange} />);
    await user.tab();
    expect(screen.getByRole("radio", { name: "Read and write" })).toHaveFocus();
    expect(onValueChange).not.toHaveBeenCalled();
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toHaveAttribute("aria-checked", "false");
    }
  });

  it("when disabled, says why and is described by the reason", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Access
        disabled
        disabledReason="Saving…"
        aria-describedby="outside"
        onValueChange={onValueChange}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Access for alex" });
    expect(group).toHaveAttribute("aria-disabled", "true");
    expect(group.getAttribute("aria-describedby")).toMatch(/^outside \S+$/);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Read and write" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("shows no reason while enabled", () => {
    render(<Access disabledReason="Saving…" />);
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup")).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("marks a refused choice invalid and describes the group by the message", () => {
    render(<Access error="Choose an access for alex." />);
    const group = screen.getByRole("radiogroup", { name: "Access for alex" });
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAccessibleDescription("Choose an access for alex.");
  });

  it("renders labels as text, not markup", () => {
    render(
      <Access
        options={[
          { value: "rw", label: '<img src="x" alt="injected">' },
          { value: "ro", label: "Read only" },
        ]}
      />,
    );
    expect(
      screen.getByRole("radio", { name: '<img src="x" alt="injected">' }),
    ).toBeInTheDocument();
    expect(screen.queryByAltText("injected")).not.toBeInTheDocument();
  });
});

describe("SegmentedChoice layout", () => {
  // jsdom has no layout. A stand-in ResizeObserver and element widths let the measuring run: each
  // label is 100px wide, a row needs 3 × 100 + its 30px of paddings and gaps.
  let width = 400;
  let callbacks: (() => void)[] = [];

  afterEach(() => {
    callbacks = [];
    width = 400;
  });

  function stubLayout() {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          callbacks.push(callback);
        }
        observe() {
          return undefined;
        }
        disconnect() {
          return undefined;
        }
      },
    );
    const slot = (element: Element) => element.getAttribute("data-slot");
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        if (slot(this) === "segmented-choice-label") {
          return 100;
        }
        return Math.min(width, 330);
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        if (slot(this) === "segmented-choice-item") {
          // Each segment gets a third of what the track has, less its 10px of padding.
          return Math.min(100, Math.floor((Math.min(width, 330) - 30) / 3));
        }
        return width;
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        if (slot(this) === "segmented-choice-item") {
          return 100;
        }
        return width;
      },
    );
  }

  function resize(next: number) {
    width = next;
    act(() => {
      for (const callback of callbacks) {
        callback();
      }
    });
  }

  it("stacks when the labels do not fit side by side, and goes back to a row when they do", () => {
    stubLayout();
    render(<Access />);
    const choice = screen
      .getByRole("radiogroup")
      .closest('[data-slot="segmented-choice"]');
    expect(choice).toHaveAttribute("data-layout", "row");
    resize(240);
    expect(choice).toHaveAttribute("data-layout", "stack");
    resize(320);
    expect(choice).toHaveAttribute("data-layout", "stack");
    resize(400);
    expect(choice).toHaveAttribute("data-layout", "row");
    vi.unstubAllGlobals();
  });
});
