// SPDX-License-Identifier: GPL-3.0-or-later
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapacityMeter } from "./capacity-meter";

const filled = (root: HTMLElement, tone: string) =>
  root.querySelectorAll(`[data-slot=capacity-meter-cells] > .bg-${tone}`)
    .length;

describe("CapacityMeter cells (compact density)", () => {
  it("counts out 40 cells, or 24 in a table cell, filled to the amount", () => {
    const { container, rerender } = render(
      <CapacityMeter
        label="data"
        value={2.2}
        max={3.6}
        valueText="2.2 TiB of 3.6 TiB (62%)"
      />,
    );
    const cells = () =>
      container.querySelectorAll("[data-slot=capacity-meter-cells] > span");
    expect(cells()).toHaveLength(40);
    expect(filled(container, "usage")).toBe(25);
    rerender(
      <CapacityMeter
        variant="compact"
        label="data"
        value={2.2}
        max={3.6}
        valueText="62%"
      />,
    );
    expect(cells()).toHaveLength(24);
    expect(filled(container, "usage")).toBe(15);
  });

  it("fills in the warning colour only with its status label", () => {
    const { container } = render(
      <CapacityMeter
        label="photos"
        value={3.1}
        max={3.6}
        valueText="86%"
        threshold={{ status: "warning", label: "Almost full" }}
      />,
    );
    expect(filled(container, "warning-stroke")).toBeGreaterThan(0);
    expect(filled(container, "usage")).toBe(0);
  });

  it("keeps the cells out of the accessibility tree", () => {
    const { container } = render(
      <CapacityMeter label="data" value={1} max={2} valueText="50%" />,
    );
    expect(
      container.querySelector("[data-slot=capacity-meter-cells]"),
    ).toHaveAttribute("aria-hidden", "true");
  });
});
