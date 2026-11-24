// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sparkline } from "./sparkline";

const T0 = 1_700_000_000_000;
const rows = (values: (number | null)[], from = T0) =>
  values.map((v, i) => ({ t: from + i * 2000, rx: v }));

const spark = (data: { t: number; rx: number | null }[]) => (
  <Sparkline
    data={data}
    value={(r) => r.rx}
    intervalMs={2000}
    describe={({ now, peak }) =>
      now === null
        ? "Network in: no reading yet"
        : `Network in: ${now} MiB/s now, peak ${peak} MiB/s`
    }
  />
);

describe("Sparkline", () => {
  it("is an image whose text alternative gives now and peak", () => {
    render(spark(rows([2, 9, 4])));
    expect(
      screen.getByRole("img", {
        name: "Network in: 4 MiB/s now, peak 9 MiB/s",
      }),
    ).toBeInTheDocument();
  });

  it("draws a gap where a reading is missing, never a line through 0", () => {
    const { container } = render(spark(rows([2, 3, null, 5, 6])));
    // Two runs, each its own line.
    const lines = container.querySelectorAll(
      'path[fill="none"][stroke="currentColor"]:not([data-slot])',
    );
    expect(lines).toHaveLength(2);
  });

  it("starts empty: a dashed baseline, and says so", () => {
    const { container } = render(spark([]));
    const svg = screen.getByRole("img", { name: "Network in: no reading yet" });
    expect(svg).toHaveAttribute("data-state", "empty");
    expect(
      container.querySelector('path[stroke-dasharray="3 3"]'),
    ).not.toBeNull();
  });
});
