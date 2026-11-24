// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapacityRing, HealthRing } from "./ring";

describe("CapacityRing", () => {
  it("is a meter with its numbers, and takes the warning fill only with its pill", () => {
    const { container } = render(
      <CapacityRing
        label="photos"
        value={3.1}
        max={3.6}
        valueText="3.1 TiB of 3.6 TiB used"
        figure="86%"
        threshold={{ status: "warning", label: "Almost full" }}
      />,
    );
    const meter = screen.getByRole("meter", { name: "photos" });
    expect(meter).toHaveAttribute("aria-valuetext", "3.1 TiB of 3.6 TiB used");
    expect(within(meter).getByText("Almost full")).toBeInTheDocument();
    expect(container.querySelector("circle.stroke-warning")).not.toBeNull();
  });

  it("stays blue under the threshold", () => {
    const { container } = render(
      <CapacityRing
        label="data"
        value={2.2}
        max={3.6}
        valueText="2.2 TiB of 3.6 TiB used"
        figure="62%"
      />,
    );
    expect(container.querySelector("circle.stroke-usage")).not.toBeNull();
    expect(container.querySelector("[data-slot=status-pill]")).toBeNull();
  });

  it("claims no meter without a reading, and is hollow and dashed", () => {
    const { container } = render(
      <CapacityRing
        label="archive"
        value={null}
        max={0}
        valueText="No reading: not mounted"
        figure=""
      />,
    );
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.getByText("No reading: not mounted")).toBeInTheDocument();
    expect(
      container.querySelector('circle[stroke-dasharray="3 4"]'),
    ).not.toBeNull();
  });
});

describe("HealthRing", () => {
  it("draws one segment per area, Unknown dashed, with every state in words", () => {
    const { container } = render(
      <HealthRing
        label="Health of this NAS"
        figure="1 issue"
        areas={[
          {
            id: "disks",
            label: "Disks",
            status: "warning",
            statusLabel: "1 warning",
          },
          { id: "fs", label: "File systems", status: "ok", statusLabel: "OK" },
          {
            id: "svc",
            label: "Services",
            status: "unknown",
            statusLabel: "Not checked",
          },
        ]}
      />,
    );
    const group = screen.getByRole("group", { name: "Health of this NAS" });
    const segments = container.querySelectorAll("path[data-status]");
    expect(segments).toHaveLength(3);
    expect(
      container.querySelector('path[data-status="unknown"]'),
    ).toHaveAttribute("stroke-dasharray", "3 3");
    expect(within(group).getByText("1 warning")).toBeInTheDocument();
    expect(within(group).getByText("Not checked")).toBeInTheDocument();
    expect(within(group).getByText("1 issue")).toBeInTheDocument();
  });
});
