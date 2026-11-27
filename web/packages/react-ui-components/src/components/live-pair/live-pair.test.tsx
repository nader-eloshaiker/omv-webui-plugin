// SPDX-License-Identifier: GPL-3.0-or-later
// The live pair as a page meets it: two images with text alternatives giving each series' value now
// and the range seen, the network's two scales in words and at the edges, each line named at its
// end, a gap where the page paused, no line before the first reading, and nothing that pulses.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  livePairArgs,
  liveReadings,
  type Activity,
} from "../../fixtures/chart-fixtures";
import { MotionScope } from "../motion/motion-scope";
import { LivePair } from "./live-pair";

const busyPlan = (i: number): Activity =>
  (i >= 6 && i < 18) || i >= 26 ? "copy-in" : "idle";

/** The figures carry a non-breaking space before their unit, as the pages write them. */
const nb = (words: string) => words.replace(/(\d) (?=[%A-Za-z°])/gu, "$1 ");

describe("LivePair", () => {
  it("gives each chart its value now and the range seen, and each network half its own scale", () => {
    render(<LivePair {...livePairArgs(liveReadings(40, busyPlan))} />);
    expect(
      screen.getByRole("img", {
        name: /^Processor: \d+\s% now, between \d+\s% and \d+\s% since 10:31\. Memory: /u,
      }),
    ).toBeInTheDocument();
    const network = screen.getByRole("img", {
      name: /Network out: [\d.]+\sMiB\/s now/u,
    });
    expect(network.getAttribute("aria-label")).toContain(
      nb("In is drawn on a scale to 100 MiB/s and out on a scale to 2 MiB/s."),
    );
    expect(screen.getByText("100 MiB/s")).toBeInTheDocument();
    expect(screen.getByText("2 MiB/s")).toBeInTheDocument();
    expect(
      screen.getByText("The two halves are scaled separately."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Since 10:31, a reading every 2 seconds."),
    ).toBeInTheDocument();
  });

  it("keeps each chart's name, aside and note as text outside its image", () => {
    render(<LivePair {...livePairArgs(liveReadings(40, busyPlan))} />);
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    for (const text of [
      "Processor and memory",
      "enp2s0",
      "The two halves are scaled separately.",
    ]) {
      const el = screen.getByText(text);
      expect(images.some((img) => img.contains(el))).toBe(false);
    }
  });

  it("names each line at its end and in the key, in the text inks", () => {
    const { container } = render(
      <LivePair {...livePairArgs(liveReadings(40, busyPlan))} />,
    );
    const ends = [
      ...container.querySelectorAll("[data-slot=live-end-label]"),
    ].map((e) => e.firstElementChild?.textContent);
    expect(ends).toEqual(["Processor", "Memory", "In", "Out"]);
    for (const end of container.querySelectorAll(
      "[data-slot=live-end-label] *",
    )) {
      expect(end.getAttribute("class")).not.toMatch(/series/u);
    }
    // Teal solid and violet dashed, in both charts.
    const lines = [...container.querySelectorAll("[data-part=line]")].map(
      (l) => l.getAttribute("class") ?? "",
    );
    expect(lines.filter((c) => c.includes("stroke-series-2"))).toHaveLength(2);
    expect(
      lines.filter(
        (c) => c.includes("stroke-series-1") && c.includes("dasharray"),
      ),
    ).toHaveLength(2);
  });

  it("breaks the lines where the page paused", () => {
    const { container } = render(
      <LivePair
        {...livePairArgs(
          liveReadings(40, busyPlan, {
            skip: Array.from({ length: 10 }, (_, i) => 18 + i),
          }),
        )}
      />,
    );
    for (const line of container.querySelectorAll("[data-part=line]")) {
      expect(line.getAttribute("d")?.match(/M/gu)).toHaveLength(2);
    }
  });

  it("starts with no line before the first reading, on the minimum scales", () => {
    const { container } = render(
      <LivePair {...livePairArgs(liveReadings(0, () => "idle"))} />,
    );
    expect(container.querySelector("[data-part=line]")).toBeNull();
    expect(container.querySelector("[data-slot=live-end-label]")).toBeNull();
    const network = screen.getByRole("img", {
      name: /^Network in: no reading yet\./u,
    });
    expect(network.getAttribute("aria-label")).toContain(
      nb("In is drawn on a scale to 1 MiB/s and out on a scale to 1 MiB/s."),
    );
  });

  it("says a reading with no value in words, never as 0", () => {
    const r = liveReadings(5, () => "idle");
    r.processor.push({ t: (r.processor.at(-1)?.t ?? 0) + 2000, v: null });
    render(<LivePair {...livePairArgs(r)} />);
    expect(screen.getByText("No reading")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: /^Processor: no value in the last reading/u,
      }),
    ).toBeInTheDocument();
  });

  it("draws in place under reduced motion, and carries nothing that pulses", () => {
    const { container } = render(
      <MotionScope reduced>
        <LivePair {...livePairArgs(liveReadings(40, busyPlan))} />
      </MotionScope>,
    );
    expect(
      container.querySelector("[class*='pulse'], [class*='ping']"),
    ).toBeNull();
    expect(container.querySelector("circle")).toBeNull();
    expect(container.querySelector("style")).toBeNull();
  });

  it("leaves the strip's charts unfilled, with their key under them", () => {
    const { container } = render(
      <LivePair {...livePairArgs(liveReadings(40, busyPlan))} />,
    );
    expect(container.querySelector("[data-part=area]")).toBeNull();
    expect(container.querySelector("[data-slot=live-figure]")).toBeNull();
    expect(container.querySelector("[data-slot=live-pair]")).toHaveAttribute(
      "data-size",
      "default",
    );
  });

  describe("large", () => {
    it("heads each chart with its figures, large and in mono, inside the image", () => {
      const { container } = render(
        <LivePair size="large" {...livePairArgs(liveReadings(40, busyPlan))} />,
      );
      const figures = [
        ...container.querySelectorAll("[data-slot=live-figure]"),
      ];
      expect(figures.map((f) => f.firstElementChild?.textContent)).toEqual([
        "Processor",
        "Memory",
        "In",
        "Out",
      ]);
      const value = figures[2]?.lastElementChild;
      expect(value?.className).toMatch(/font-mono/u);
      expect(value?.className).toMatch(/text-figure/u);
      expect(value?.lastElementChild?.textContent).toBe("MiB/s");
      // The figures are part of the image: its text alternative already says each value now.
      const images = screen.getAllByRole("img");
      expect(images).toHaveLength(2);
      for (const f of figures) {
        expect(images.some((img) => img.contains(f))).toBe(true);
      }
      // Each figure's key repeats its line's stroke.
      expect(
        figures.map(
          (f) => f.querySelector("path")?.getAttribute("class") ?? "",
        ),
      ).toEqual([
        expect.stringContaining("stroke-series-2"),
        expect.stringContaining("dasharray"),
        expect.stringContaining("stroke-series-2"),
        expect.stringContaining("dasharray"),
      ]);
    });

    it("fills the area under the processor's line and under both network halves", () => {
      const { container } = render(
        <LivePair size="large" {...livePairArgs(liveReadings(40, busyPlan))} />,
      );
      const percent = container.querySelector("[data-slot=live-percent-chart]");
      const mirror = container.querySelector("[data-slot=live-mirror-chart]");
      expect(percent?.querySelectorAll("[data-part=area]")).toHaveLength(1);
      expect(mirror?.querySelectorAll("[data-part=area]")).toHaveLength(2);
      for (const area of container.querySelectorAll("[data-part=area]")) {
        const id = /^url\(#(.+)\)$/u.exec(area.getAttribute("fill") ?? "")?.[1];
        expect(id).toBeDefined();
        const gradient = container.querySelector(
          `linearGradient[id="${id ?? ""}"]`,
        );
        expect(gradient?.querySelectorAll("stop")).toHaveLength(2);
      }
      expect(container.querySelector("style")).toBeNull();
    });

    it("names each line at its end, with no key under the charts", () => {
      const { container } = render(
        <LivePair size="large" {...livePairArgs(liveReadings(40, busyPlan))} />,
      );
      expect(
        [...container.querySelectorAll("[data-slot=live-end-label]")].map(
          (e) => e.textContent,
        ),
      ).toEqual(["Processor", "Memory", "In", "Out"]);
      // The names are not repeated in a key: each appears in its figure and at its line's end.
      expect(screen.getAllByText("Processor")).toHaveLength(2);
    });

    it("says no reading in the figure, never 0, and draws no line before the first", () => {
      const { container } = render(
        <LivePair
          size="large"
          {...livePairArgs(liveReadings(0, () => "idle"))}
        />,
      );
      expect(screen.getAllByText("No reading")).toHaveLength(4);
      expect(container.querySelector("[data-part=area]")).toBeNull();
      expect(container.querySelector("[data-part=line]")).toBeNull();
    });

    it("lets a chart keep its own size, and a caller split a figure itself", () => {
      const args = livePairArgs(liveReadings(40, busyPlan));
      const { container } = render(
        <LivePair
          size="large"
          {...args}
          percent={{
            ...args.percent,
            formatFigure: () => ({ value: "17", unit: "per cent" }),
          }}
          mirror={{ ...args.mirror, size: "default" }}
        />,
      );
      expect(screen.getAllByText("per cent")).toHaveLength(2);
      expect(
        container.querySelector("[data-slot=live-mirror-chart]"),
      ).toHaveAttribute("data-size", "default");
    });
  });
});
