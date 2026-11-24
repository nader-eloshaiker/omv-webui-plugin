// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubLayout } from "../../test/layout";
import { BarChart } from "./bar-chart";

interface Disk {
  device: string;
  temp: number | null;
}
const DISKS: Disk[] = [
  { device: "sda", temp: 38 },
  { device: "sdb", temp: 47 },
  { device: "sdd", temp: null },
];

beforeEach(() => {
  stubLayout(560, 220);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const chart = (
  <BarChart
    data={DISKS}
    rowKey={(d) => d.device}
    name={(d) => d.device}
    value={(d) => d.temp}
    domain={[0, 70]}
    ticks={[0, 35, 70]}
    alerts={[{ value: 55, label: "Alert at 55 °C" }]}
    formatTick={(v) => `${v}°`}
    barLabel={(d) => `${d.temp}°`}
    missingLabel="No reading"
    tooltip={(d) => ({
      title: d.device,
      body: d.temp === null ? "No reading" : `${d.temp} °C now`,
    })}
    label="Disk temperatures now"
    description="sda 38 °C, sdb 47 °C, sdd reports no temperature. Alert at 55 °C."
    monoNames
    table={{
      summary: "Show the numbers as a table",
      caption: "Disk temperatures now",
      columns: [
        { id: "disk", header: "Disk", cell: (d) => d.device, mono: true },
        {
          id: "temp",
          header: "Temperature",
          numeric: true,
          cell: (d) => (d.temp === null ? "No reading" : `${d.temp} °C`),
        },
      ],
    }}
  />
);

describe("BarChart", () => {
  it("is an image with its name and the caller's full description", () => {
    render(chart);
    const image = screen.getByRole("img", { name: "Disk temperatures now" });
    expect(image).toHaveAccessibleDescription(
      "sda 38 °C, sdb 47 °C, sdd reports no temperature. Alert at 55 °C.",
    );
    expect(document.querySelector('[role="application"]')).toBeNull();
  });

  it("draws the alert line from props and says a missing value in words", () => {
    render(chart);
    expect(screen.getByText("Alert at 55 °C")).toBeInTheDocument();
    expect(screen.getAllByText("No reading").length).toBeGreaterThan(0);
  });

  it("does not hand the animation to Recharts, which would replay it on every resize", () => {
    const { container } = render(chart);
    const bar = container.querySelector(".recharts-bar");
    expect(bar?.getAttribute("class")).toContain("animate-grow-y");
  });

  it("puts the numbers one click away", async () => {
    const user = userEvent.setup();
    render(chart);
    await user.click(
      screen.getByRole("button", { name: "Show the numbers as a table" }),
    );
    const table = screen.getByRole("table", { name: "Disk temperatures now" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
  });
});
