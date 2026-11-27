// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
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
  it("is still named by its hidden label, with the figure and the status on screen", () => {
    const { container } = render(
      <CapacityMeter
        variant="compact"
        label="Usage of backup"
        value={3.6}
        max={3.6}
        valueText="100% full, 0 B free of 3.6 TiB"
        threshold={{ status: "critical", label: "Critical" }}
      />,
    );
    const meter = screen.getByRole("meter", { name: "Usage of backup" });
    expect(meter).toHaveAttribute("data-variant", "compact");
    expect(meter).toHaveAttribute(
      "aria-valuetext",
      "100% full, 0 B free of 3.6 TiB",
    );
    expect(screen.getByText("Usage of backup")).toHaveClass("sr-only");
    const figure = screen.getByText("100% full, 0 B free of 3.6 TiB");
    // The status sits beside the figure, not beside the hidden label.
    expect(figure.parentElement).toContainElement(
      container.querySelector("[data-slot=status-pill]") as HTMLElement,
    );
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("has no status below the threshold", () => {
    const { container } = render(
      <CapacityMeter
        variant="compact"
        label="Usage of data"
        value={2.2}
        max={3.6}
        valueText="62% full, 1.4 TiB free of 3.6 TiB"
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

describe("CapacityMeter text", () => {
  it.each([
    ["default", ["File system: data", "Warning", "2.2 TiB of 3.6 TiB (62%)"]],
    ["compact", ["File system: data", "2.2 TiB of 3.6 TiB (62%)", "Warning"]],
  ] as const)(
    "holds no text but its label, figure and status (%s)",
    (variant, parts) => {
      render(
        <CapacityMeter
          variant={variant}
          label="File system: data"
          value={2.2}
          max={3.6}
          valueText="2.2 TiB of 3.6 TiB (62%)"
          threshold={{ status: "warning", label: "Warning" }}
        />,
      );
      const meter = screen.getByRole("meter", { name: "File system: data" });
      // Base UI's NVDA workaround appends a hidden "x" to the meter, read out and in its text.
      expect(within(meter).queryByText("x")).toBeNull();
      expect(meter.textContent).toBe(parts.join(""));
      expect(meter).toHaveAttribute("aria-valuenow", "2.2");
      expect(meter).toHaveAttribute(
        "aria-valuetext",
        "2.2 TiB of 3.6 TiB (62%)",
      );
    },
  );
});
