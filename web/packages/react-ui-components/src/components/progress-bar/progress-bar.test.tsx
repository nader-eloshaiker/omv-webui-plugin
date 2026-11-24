// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./progress-bar";

describe("ProgressBar", () => {
  it("reports a known value with the words as its text alternative, and shows the words", () => {
    const { container } = render(
      <ProgressBar
        label="Synchronising RAID md0"
        value={45}
        valueText="45.0% done, about 2 hours left"
      />,
    );
    const bar = screen.getByRole("progressbar", {
      name: "Synchronising RAID md0",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "45");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute(
      "aria-valuetext",
      "45.0% done, about 2 hours left",
    );
    expect(
      container.querySelector("[data-slot=progress-bar-value]"),
    ).toHaveTextContent("45.0% done, about 2 hours left");
    // Base UI's hidden "x" helper span is not rendered: the bar always holds visible text.
    expect(bar).toHaveTextContent(
      /^Synchronising RAID md0 ?45\.0% done, about 2 hours left$/,
    );
  });

  it("takes a max other than 100", () => {
    render(
      <ProgressBar
        aria-label="Writing group tables"
        value={300}
        max={1200}
        valueText="Writing group tables: 25%"
      />,
    );
    const bar = screen.getByRole("progressbar", {
      name: "Writing group tables",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "300");
    expect(bar).toHaveAttribute("aria-valuemax", "1200");
  });

  it("is indeterminate with a null value: no current value, a third-width bar that pulses only with motion", () => {
    const { container } = render(
      <ProgressBar
        aria-label="Checking RAID md0"
        value={null}
        valueText="Working…"
      />,
    );
    const bar = screen.getByRole("progressbar", { name: "Checking RAID md0" });
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(bar).toHaveAttribute("aria-valuetext", "Working…");
    expect(bar).toHaveAttribute("data-indeterminate");
    const indicator = container.querySelector(
      "[data-indeterminate] > div > div",
    );
    expect(indicator).not.toBeNull();
    // The breath is behind `motion-safe:`, so under reduced motion the bar stands still.
    expect(indicator?.className).toContain(
      "data-indeterminate:motion-safe:animate-breathe",
    );
    expect(indicator?.className).not.toMatch(/(^|\s)animate-breathe/);
    expect(indicator?.getAttribute("style") ?? "").not.toContain("width");
    expect(screen.getByText("Working…")).toBeVisible();
  });

  it("is named by aria-labelledby when the surroundings say what runs", () => {
    render(
      <>
        <p id="reason">Synchronising after it was created</p>
        <ProgressBar
          aria-labelledby="reason"
          value={12}
          valueText="12.3% done"
          size="compact"
        />
      </>,
    );
    expect(
      screen.getByRole("progressbar", {
        name: "Synchronising after it was created",
      }),
    ).toHaveAttribute("data-size", "compact");
  });

  it("draws a thinner track and smaller figures when compact, and merges className last", () => {
    const { container } = render(
      <ProgressBar
        aria-label="Synchronising"
        value={60}
        valueText="60.0% done"
        size="compact"
        className="gap-0.5"
      />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar.className).toContain("gap-0.5");
    expect(bar.className).not.toContain("gap-1 ");
    const track = bar.querySelector(":scope > div");
    expect(track?.className).toContain("h-1.5");
    expect(
      container.querySelector("[data-slot=progress-bar-value]")?.className,
    ).toContain("text-xs");
  });

  it("forwards its ref to the progress bar element", () => {
    const ref = React.createRef<HTMLDivElement>();
    render(
      <ProgressBar
        ref={ref}
        aria-label="Synchronising"
        value={5}
        valueText="5.0% done"
      />,
    );
    expect(ref.current).toBe(screen.getByRole("progressbar"));
  });
});
