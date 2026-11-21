// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LineChart,
  type LineChartSeries,
  type LineChartSeriesSummary,
} from "./line-chart";

const T0 = Date.UTC(2026, 10, 21, 14, 0, 0);
const STEP = 20_000;
const TEN_MINUTES = 10 * 60_000;

function samples(values: readonly (number | null)[], start = T0, step = STEP) {
  return values.map((value, i) => ({ t: start + i * step, value }));
}

const describeSeries = ({ label, latest, min, max }: LineChartSeriesSummary) =>
  `${label}: ${latest} now, lowest ${min}, highest ${max}.`;

function renderChart(
  series: readonly LineChartSeries[],
  extra: { maxGap?: number } = {},
) {
  return render(
    <LineChart
      aria-label="CPU and memory use, last 10 minutes"
      series={series}
      windowMs={TEN_MINUTES}
      formatValue={(v) => `${v}%`}
      formatTime={() => "14:00"}
      describeSeries={describeSeries}
      emptyLabel="Collecting readings…"
      {...extra}
    />,
  );
}

function lines(container: HTMLElement, series = 1) {
  return [
    ...container.querySelectorAll(
      `[data-series="${series}"] [data-slot="line-chart-line"]`,
    ),
  ].map((path) => path.getAttribute("d") ?? "");
}

const commands = (d: string) => d.match(/[ML]/g) ?? [];

describe("LineChart", () => {
  it("draws one path through N points", () => {
    const { container } = renderChart([
      { id: "cpu", label: "CPU", points: samples([12, 30, 18, 44, 25]) },
    ]);
    const paths = lines(container);
    expect(paths).toHaveLength(1);
    expect(commands(paths[0] ?? "")).toEqual(["M", "L", "L", "L", "L"]);
  });

  it("is one image with a name, a text summary per series and a hidden drawing", () => {
    const { container } = renderChart([
      { id: "cpu", label: "CPU", points: samples([12, 30, 18, 44, 25]) },
      { id: "mem", label: "Memory", points: samples([61, 62, 62, 63, 63]) },
    ]);
    const chart = screen.getByRole("img", {
      name: "CPU and memory use, last 10 minutes",
    });
    expect(chart).toHaveAccessibleDescription(
      "CPU: 25% now, lowest 12%, highest 44%. Memory: 63% now, lowest 61%, highest 63%.",
    );
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("labels each line at its end with its newest value, in text tokens", () => {
    const { container } = renderChart([
      { id: "cpu", label: "CPU", points: samples([12, 25]) },
      { id: "mem", label: "Memory", points: samples([61, 63]) },
    ]);
    const labels = [
      ...container.querySelectorAll('[data-slot="line-chart-label"] text'),
    ];
    expect(labels.map((l) => l.textContent)).toEqual(["CPU 25%", "Memory 63%"]);
    for (const label of labels) {
      expect(label.getAttribute("class")).not.toMatch(/series/);
    }
  });

  it("gives each series its own colour token, dash pattern and marker shape", () => {
    const series = ["a", "b", "c", "d"].map((id, i) => ({
      id,
      label: id.toUpperCase(),
      points: samples([10 + i * 20, 15 + i * 20]),
    }));
    const { container } = renderChart(series);
    const paths = [
      ...container.querySelectorAll('[data-slot="line-chart-line"]'),
    ];
    expect(paths.map((p) => p.getAttribute("class"))).toEqual([
      "stroke-series-1",
      "stroke-series-2",
      "stroke-series-3",
      "stroke-series-4",
    ]);
    const dashes = paths.map((p) => p.getAttribute("stroke-dasharray"));
    expect(new Set(dashes).size).toBe(4);
    const markers = [
      ...container.querySelectorAll('[data-slot="line-chart-marker"]'),
    ].map((m) => (m.getAttribute("d") ?? "").replace(/[-\d. ]+/g, ""));
    expect(new Set(markers).size).toBe(4);
  });

  it("shows the empty label, not a chart, below two points", () => {
    const { container } = renderChart([
      { id: "cpu", label: "CPU", points: samples([12]) },
    ]);
    const chart = screen.getByRole("img", {
      name: "CPU and memory use, last 10 minutes",
    });
    expect(chart).toHaveAttribute("data-state", "empty");
    expect(screen.getByText("Collecting readings…")).toBeVisible();
    expect(chart).toHaveAccessibleDescription("Collecting readings…");
    expect(lines(container)).toHaveLength(0);
  });

  it("shows the empty label when there are no series or no samples", () => {
    renderChart([]);
    expect(screen.getByText("Collecting readings…")).toBeInTheDocument();
  });

  it("breaks the line at a missed sample instead of bridging it", () => {
    // A steady 20 s rate, then a 60 s pause (two samples missed), then the rate again.
    const points = [
      ...samples([10, 20, 30]),
      ...samples([40, 50], T0 + 2 * STEP + 3 * STEP),
    ];
    const { container } = renderChart([{ id: "cpu", label: "CPU", points }]);
    const paths = lines(container);
    expect(paths).toHaveLength(2);
    expect(paths.map((d) => commands(d).length)).toEqual([3, 2]);
  });

  it("breaks the line at a failed sample and marks a lone sample between gaps", () => {
    const { container } = renderChart([
      {
        id: "cpu",
        label: "CPU",
        points: samples([10, 20, null, 30, null, 40, 50]),
      },
    ]);
    expect(lines(container).map((d) => commands(d).length)).toEqual([2, 2]);
    expect(
      container.querySelectorAll('[data-slot="line-chart-point"]'),
    ).toHaveLength(1);
  });

  it("honours an explicit maxGap", () => {
    const points = [...samples([10, 20]), ...samples([30], T0 + STEP + 25_000)];
    const { container } = renderChart([{ id: "cpu", label: "CPU", points }], {
      maxGap: 30_000,
    });
    expect(lines(container)).toHaveLength(1);
  });

  it("shows only the window ending at the newest sample", () => {
    // 40 samples at 20 s span 13 minutes; a 10-minute window holds the last 31.
    const values = Array.from({ length: 40 }, (_, i) => i);
    const { container } = renderChart([
      { id: "cpu", label: "CPU", points: samples(values) },
    ]);
    expect(commands(lines(container)[0] ?? "")).toHaveLength(31);
    expect(screen.getByRole("img")).toHaveAccessibleDescription(
      "CPU: 39% now, lowest 9%, highest 39%.",
    );
  });

  it("refuses a fifth series", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const series = ["a", "b", "c", "d", "e"].map((id) => ({
      id,
      label: id,
      points: samples([1, 2]),
    }));
    expect(() => renderChart(series)).toThrow(RangeError);
  });

  it("writes no style attribute and no style element", () => {
    const { container } = renderChart([
      { id: "cpu", label: "CPU", points: samples([12, 30, null, 18, 44]) },
      { id: "mem", label: "Memory", points: samples([61, 62, 62, 63, 63]) },
    ]);
    expect(container.querySelector("[style]")).toBeNull();
    expect(container.querySelector("style")).toBeNull();
    expect(document.head.querySelector("style")).toBeNull();
  });

  it("renders a label that looks like markup as text", () => {
    const { container } = renderChart([
      {
        id: "x",
        label: "<img src=x onerror=alert(1)>",
        points: samples([1, 2]),
      },
    ]);
    expect(container.querySelector("img")).toBeNull();
    expect(
      container.querySelector('[data-slot="line-chart-label"] tspan'),
    ).toHaveTextContent("<img src=x onerror=alert(1)>");
  });
});
