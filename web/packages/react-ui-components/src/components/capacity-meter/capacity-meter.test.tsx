// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapacityMeter } from "./capacity-meter";

describe("CapacityMeter", () => {
  it("is a meter with its numbers as text and as its value text", () => {
    render(
      <CapacityMeter
        label="File system: backup"
        value={3.5}
        max={3.6}
        valueText="3.5 TiB of 3.6 TiB (96%)"
        threshold={{ status: "critical", label: "Critical" }}
      />,
    );
    const meter = screen.getByRole("meter", { name: "File system: backup" });
    expect(meter).toHaveAttribute("aria-valuetext", "3.5 TiB of 3.6 TiB (96%)");
    expect(screen.getByText("3.5 TiB of 3.6 TiB (96%)")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("leaves the label visible by default", () => {
    render(
      <CapacityMeter
        label="File system: data"
        value={2.2}
        max={3.6}
        valueText="2.2 TiB of 3.6 TiB (62%)"
      />,
    );
    expect(screen.getByText("File system: data")).not.toHaveClass("sr-only");
  });
});

describe("CapacityMeter compact", () => {
  it("is still named by its hidden label, with the figure and the pill on screen", () => {
    const { container } = render(
      <CapacityMeter
        variant="compact"
        label="Usage of backup"
        value={3.6}
        max={3.6}
        valueText="100% full · 0 B free of 3.6 TiB"
        threshold={{ status: "critical", label: "Critical" }}
      />,
    );
    const meter = screen.getByRole("meter", { name: "Usage of backup" });
    expect(meter).toHaveAttribute("data-variant", "compact");
    expect(meter).toHaveAttribute(
      "aria-valuetext",
      "100% full · 0 B free of 3.6 TiB",
    );
    expect(screen.getByText("Usage of backup")).toHaveClass("sr-only");
    const figure = screen.getByText("100% full · 0 B free of 3.6 TiB");
    // The pill sits beside the figure, not beside the hidden label.
    expect(figure.parentElement).toContainElement(
      container.querySelector("[data-slot=status-pill]") as HTMLElement,
    );
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("has no pill below the threshold", () => {
    const { container } = render(
      <CapacityMeter
        variant="compact"
        label="Usage of data"
        value={2.2}
        max={3.6}
        valueText="62% full · 1.4 TiB free of 3.6 TiB"
      />,
    );
    expect(screen.getByRole("meter", { name: "Usage of data" })).toBeVisible();
    expect(container.querySelector("[data-slot=status-pill]")).toBeNull();
  });

  it("claims no meter without a reading, and says so in words", () => {
    const { container } = render(
      <CapacityMeter
        variant="compact"
        label="Usage of archive"
        value={null}
        max={0}
        valueText="No reading"
      />,
    );
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    const root = container.querySelector("[data-slot=capacity-meter]");
    expect(root).toHaveAttribute("data-state", "unknown");
    expect(screen.getByText("Usage of archive")).toHaveClass("sr-only");
    expect(screen.getByText("No reading")).toBeInTheDocument();
  });

  it("is busy while loading, without a live region per row", () => {
    const { container } = render(
      <CapacityMeter
        variant="compact"
        label="Usage of data"
        value={null}
        max={0}
        loading
        valueText="Loading…"
      />,
    );
    const root = container.querySelector("[data-slot=capacity-meter]");
    expect(root).toHaveAttribute("data-state", "loading");
    expect(root).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
