// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubLayout, stubReducedMotion } from "../../test/layout";
import { LiveChart, type LiveChartProps } from "./live-chart";

/** As the app's session store keeps a system sample (src/live/liveSamples.ts). */
interface SystemSample {
  t: number;
  cpu: number | null;
}

const T0 = 1_700_000_000_000;
const samples = (values: (number | null)[]): SystemSample[] =>
  values.map((cpu, i) => ({ t: T0 + i * 2000, cpu }));

const s = (n: number) => `${Math.round(n / 1000)} s`;
const pct = (v: number) => `${Math.round(v)}%`;

function chart(
  data: readonly SystemSample[],
  extra: Partial<LiveChartProps<SystemSample>> = {},
) {
  return (
    <LiveChart
      data={data}
      series={[{ id: "cpu", label: "Processor", value: (r) => r.cpu }]}
      label="Processor"
      intervalMs={2000}
      domain={[0, 100]}
      formatValue={pct}
      formatAgo={(sec) => (sec === 0 ? "now" : `${sec} s`)}
      formatTime={(t) => `T+${(t - T0) / 1000}`}
      caption={({ sampledMs }) => `Live · every 2 s · last ${s(sampledMs)}`}
      describe={({ sampledMs, series }) =>
        `Processor over the last ${s(sampledMs)}: now ${series[0]?.now ?? "none"}, highest ${series[0]?.high ?? "none"}, lowest ${series[0]?.low ?? "none"}.`
      }
      emptyLabel="Waiting for the first reading"
      missingLabel="No reading"
      table={{
        summary: "Show the numbers as a table",
        caption: "Processor readings, newest first",
        timeHeader: "Time",
      }}
      {...extra}
    />
  );
}

beforeEach(() => {
  stubLayout(480, 104);
  stubReducedMotion(false);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LiveChart", () => {
  it("is an image with a name and a description, never an application", () => {
    render(chart(samples([12, 30, 25])));
    const image = screen.getByRole("img", { name: "Processor" });
    expect(image.tagName.toLowerCase()).toBe("svg");
    expect(image).not.toHaveAttribute("role", "application");
    expect(document.querySelector('[role="application"]')).toBeNull();
    expect(image).toHaveAccessibleDescription(
      "Processor over the last 4 s: now 25, highest 30, lowest 12.",
    );
  });

  it("says the span it really sampled, not the window it has room for", () => {
    render(chart(samples([12, 30, 25])));
    expect(
      screen.getByText("Live · every 2 s · last 4 s").closest("figcaption"),
    ).not.toBeNull();
  });

  it("starts empty and says so, with no image claiming a value", () => {
    render(chart([]));
    expect(screen.getByText("Waiting for the first reading")).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("Show the numbers as a table")).toBeNull();
  });

  it("puts the numbers one click away, a missing reading in words", async () => {
    const user = userEvent.setup();
    render(chart(samples([12, null, 25])));
    await user.click(
      screen.getByRole("button", { name: "Show the numbers as a table" }),
    );
    const table = screen.getByRole("table", {
      name: "Processor readings, newest first",
    });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      "T+425%",
      "T+2No reading",
      "T+012%",
    ]);
  });

  it("draws alert lines given as props, with their words", () => {
    const { container } = render(
      chart(samples([40, 50]), {
        alerts: [{ value: 80, label: "Normal below 80 °C", short: "80 °C" }],
      }),
    );
    expect(container.querySelector(".recharts-reference-line")).not.toBeNull();
    expect(screen.getByText("80 °C")).toBeInTheDocument();
  });

  it("refuses a fifth series", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const five = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`,
      label: `S${i}`,
      value: (r: SystemSample) => r.cpu,
    }));
    expect(() => render(chart(samples([1, 2]), { series: five }))).toThrow(
      RangeError,
    );
  });
});

describe("LiveChart motion", () => {
  function animateSpy() {
    const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      writable: true,
      value: animate,
    });
    Object.defineProperty(SVGElement.prototype, "getBBox", {
      configurable: true,
      writable: true,
      value: () => ({ x: 0, y: 0, width: 420, height: 80 }),
    });
    return animate;
  }

  it("glides one step when a sample arrives", () => {
    const animate = animateSpy();
    const { rerender } = render(chart(samples([10, 20, 30])));
    animate.mockClear();
    rerender(chart(samples([10, 20, 30, 40])));
    expect(animate).toHaveBeenCalled();
  });

  it("redraws in place under reduced motion: nothing is animated, the line is at its end state", () => {
    stubReducedMotion(true);
    const animate = animateSpy();
    const { rerender } = render(chart(samples([10, 20, 30])));
    rerender(chart(samples([10, 20, 30, 40])));
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByRole("img")).toHaveAccessibleDescription(
      "Processor over the last 6 s: now 40, highest 40, lowest 10.",
    );
  });
});
