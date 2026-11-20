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
});
