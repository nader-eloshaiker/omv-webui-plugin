// SPDX-License-Identifier: GPL-3.0-or-later
// The table pieces as a person meets them: the filter tabs by pointer and keyboard, and an empty
// cell that says what is true. Lab fixtures only; nothing here reaches the network.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { filterKeyTarget } from "./grid.ts";
import type { FilterTab } from "./parts.tsx";
import { FilterTabs, Missing } from "./parts.tsx";

type F = "all" | "unreachable" | "shared" | "unshared";

const TABS: FilterTab<F>[] = [
  { value: "all", label: "All", count: 4 },
  { value: "unreachable", label: "Not reachable", count: 1, status: "warning" },
  { value: "shared", label: "Shared", count: 3 },
  { value: "unshared", label: "Not shared", count: 1 },
];

function Tabs() {
  const [value, setValue] = useState<F>("all");
  return (
    <FilterTabs label="Show" value={value} tabs={TABS} onChange={setValue} />
  );
}

describe("filter tabs", () => {
  it("are one radio group with the chosen filter checked and the counts as plain text", () => {
    render(<Tabs />);
    const group = screen.getByRole("radiogroup", { name: "Show" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "All 4" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Shared 3" })).not.toBeChecked();
    // One tab stop: the chosen tab.
    expect(
      screen.getAllByRole("radio").map((r) => r.getAttribute("tabindex")),
    ).toEqual(["0", "-1", "-1", "-1"]);
  });

  it("keeps the status icon on the filter for a problem", () => {
    render(<Tabs />);
    const problem = screen.getByRole("radio", { name: /^Not reachable/u });
    expect(problem.querySelector("svg")).not.toBeNull();
    expect(
      screen.getByRole("radio", { name: /^Shared/u }).querySelector("svg"),
    ).toBeNull();
  });

  it("chooses by click, and by the arrow keys, Home and End", async () => {
    render(<Tabs />);
    await userEvent.click(screen.getByRole("radio", { name: /^Shared/u }));
    expect(screen.getByRole("radio", { name: /^Shared/u })).toBeChecked();

    await userEvent.keyboard("{ArrowRight}");
    const unshared = screen.getByRole("radio", { name: /^Not shared/u });
    expect(unshared).toBeChecked();
    expect(unshared).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /^All/u })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(unshared).toBeChecked();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: /^All/u })).toBeChecked();
    await userEvent.keyboard("{End}");
    expect(unshared).toBeChecked();
  });

  it("moves the other way in a right-to-left page", () => {
    expect(filterKeyTarget("ArrowRight", 1, 4, true)).toBe(0);
    expect(filterKeyTarget("ArrowLeft", 3, 4, true)).toBe(0);
    expect(filterKeyTarget("ArrowUp", 0, 4)).toBe(3);
    expect(filterKeyTarget("Enter", 0, 4)).toBeNull();
  });
});

describe("an empty cell", () => {
  it("says what is true as a short label, with no dash and no full stop", () => {
    render(
      <>
        <Missing>Nobody</Missing>
        <Missing more="no computer can reach it">Not shared</Missing>
      </>,
    );
    expect(screen.getByText("Nobody")).toBeInTheDocument();
    expect(screen.getByText("Not shared")).toHaveTextContent(
      "Not shared, no computer can reach it",
    );
    expect(document.body.textContent).not.toMatch(/—|\.$/u);
  });
});
