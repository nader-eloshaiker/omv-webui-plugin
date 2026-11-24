// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { LiveFigure } from "../live-figure/live-figure";
import { LivePlotSkeleton, LiveTile } from "./live-tile";

describe("LiveTile", () => {
  it("is a group named by its name, with the figure, the plot and the sub-line", () => {
    render(
      <LiveTile
        name="Processor"
        figure={
          <LiveFigure
            value={12}
            format={(v) => v.toFixed(0)}
            unit="%"
            missing="No reading"
          />
        }
        plot={<div data-testid="plot" />}
      >
        Average load 0.23 · 0.09 · 0.02
      </LiveTile>,
    );
    const tile = screen.getByRole("group", { name: "Processor" });
    expect(within(tile).getByText("12 %")).toBeInTheDocument();
    expect(within(tile).getByTestId("plot")).toBeInTheDocument();
    expect(
      within(tile).getByText("Average load 0.23 · 0.09 · 0.02"),
    ).toBeInTheDocument();
  });

  it("takes its layout from its own width unless one is forced", () => {
    const { container, rerender } = render(
      <LiveTile name="Memory" figure="9 %" plot={null} />,
    );
    const grid = () =>
      container.querySelector("[data-slot=live-tile] > div")?.className ?? "";
    expect(grid()).toMatch(/@xs\/tile:grid-cols-/);
    rerender(<LiveTile name="Memory" figure="9 %" plot={null} layout="row" />);
    expect(grid()).not.toMatch(/@xs\/tile:/);
    expect(grid()).toMatch(/grid-cols-\[minmax\(7rem,auto\)/);
  });

  it("holds the plot's exact height while a lazy chart loads", async () => {
    const Never = React.lazy(
      () => new Promise<{ default: React.ComponentType }>(() => undefined),
    );
    const { container } = render(
      <LiveTile
        name="Network · enp2s0"
        figure="In 1.2"
        plot={
          <React.Suspense fallback={<LivePlotSkeleton />}>
            <Never />
          </React.Suspense>
        }
      />,
    );
    const skeleton = await screen.findByText(
      (_, el) => el?.getAttribute("data-slot") === "live-plot-skeleton",
    );
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    const bars = container.querySelectorAll(
      "[data-slot=live-plot-skeleton] [data-slot=skeleton]",
    );
    expect(bars[0]?.className).toMatch(/\bh-26\b/);
    expect(bars).toHaveLength(2);
  });

  it("stands in for a large plot without a caption", () => {
    const { container } = render(
      <LivePlotSkeleton size="large" caption="none" />,
    );
    const bars = container.querySelectorAll("[data-slot=skeleton]");
    expect(bars).toHaveLength(1);
    expect(bars[0]?.className).toMatch(/\bh-60\b/);
  });
});
