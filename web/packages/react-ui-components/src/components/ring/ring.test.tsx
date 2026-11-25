// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CapacityRing,
  CapacityRingSkeleton,
  HealthRing,
  HealthRingSkeleton,
  ProgressRing,
} from "./ring";

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

describe("CapacityRing, known bad without a reading", () => {
  it("draws the dashed ring in the state's stroke, with its pill and words", () => {
    const { container } = render(
      <CapacityRing
        label="Data"
        value={null}
        max={100}
        valueText="Not found. Its disk may be disconnected or have failed."
        figure=""
        threshold={{ status: "critical", label: "Critical" }}
      />,
    );
    expect(screen.queryByRole("meter")).toBeNull();
    const root = container.querySelector("[data-slot=capacity-ring]");
    expect(root).toHaveAttribute("data-status", "critical");
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(
      container.querySelector(
        'circle.stroke-critical-stroke[stroke-dasharray="3 4"]',
      ),
    ).not.toBeNull();
  });
});

describe("CapacityRing as a link tile", () => {
  it("reads the meter, then a link by its own name that covers the tile", () => {
    const { container } = render(
      <CapacityRing
        label="Data"
        value={87}
        max={100}
        valueText="87% full · 120 GiB free of 916 GiB"
        figure="87%"
        threshold={{ status: "warning", label: "Warning" }}
        link={<a href="#/storage/filesystems/data" />}
        linkLabel="Open file system Data"
      />,
    );
    const meter = screen.getByRole("meter", { name: "Data" });
    const link = screen.getByRole("link", { name: "Open file system Data" });
    expect(link).toHaveAttribute("href", "#/storage/filesystems/data");
    // Siblings, so the link never swallows the meter's role or words.
    expect(link.contains(meter)).toBe(false);
    expect(meter.contains(link)).toBe(false);
    expect(link.className).toMatch(/absolute inset-0/);
    expect(
      container.querySelector("[data-slot=capacity-ring]")?.className,
    ).toMatch(/hover:bg-muted/);
  });

  it("is a tile without a meter when there is no reading", () => {
    render(
      <CapacityRing
        label="Archive"
        value={null}
        max={0}
        valueText="Could not read how full it is"
        figure=""
        link={<a href="#/storage/filesystems/archive" />}
        linkLabel="Open file system Archive"
      />,
    );
    expect(screen.queryByRole("meter")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open file system Archive" }),
    ).toBeInTheDocument();
  });
});

describe("ProgressRing", () => {
  it("is a meter named by the heading outside it, with its count in words", () => {
    render(
      <>
        <h2 id="first-steps">First steps</h2>
        <ProgressRing
          aria-labelledby="first-steps"
          value={1}
          max={2}
          valueText="1 of 2 done"
          figure="1/2"
        />
      </>,
    );
    const meter = screen.getByRole("meter", { name: "First steps" });
    expect(meter).toHaveAttribute("aria-valuetext", "1 of 2 done");
    expect(meter).toHaveAttribute("aria-valuenow", "1");
    expect(meter).toHaveAttribute("data-slot", "progress-ring");
    expect(meter.querySelector("circle.stroke-action-stroke")).not.toBeNull();
  });

  it("draws no arc at nothing done", () => {
    const { container } = render(
      <ProgressRing
        aria-label="First steps"
        value={0}
        max={2}
        valueText="0 of 2 done"
        figure="0/2"
      />,
    );
    expect(container.querySelector("circle.stroke-action-stroke")).toBeNull();
  });
});

describe("ring skeletons", () => {
  it("are the track only, breathing, hidden from assistive technology", () => {
    const { container } = render(
      <>
        <CapacityRingSkeleton size="sm" />
        <HealthRingSkeleton size="lg" areas={4} />
      </>,
    );
    const capacity = container.querySelector(
      "[data-slot=capacity-ring-skeleton]",
    );
    const health = container.querySelector("[data-slot=health-ring-skeleton]");
    expect(capacity).toHaveAttribute("aria-hidden", "true");
    expect(health).toHaveAttribute("aria-hidden", "true");
    expect(capacity?.querySelector("svg")?.getAttribute("class")).toMatch(
      /animate-breathe/,
    );
    expect(health?.querySelectorAll("[data-slot=skeleton]")).toHaveLength(4);
    expect(capacity?.querySelectorAll("[data-slot=skeleton]")).toHaveLength(2);
  });

  it("leaves the legend out when the ring's legend is hidden", () => {
    const { container } = render(<HealthRingSkeleton legend="hidden" />);
    expect(container.querySelectorAll("[data-slot=skeleton]")).toHaveLength(0);
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
