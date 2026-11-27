// SPDX-License-Identifier: GPL-3.0-or-later
// The segment bar as a page meets it: a meter with its value, range, name and words; the warning
// stroke only on the used part past a crossed mark and only with the status word; every segment
// filled and none outlined; the mark's value written where there is room.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FILE_SYSTEMS, segmentBarArgs } from "../../fixtures/chart-fixtures";
import { SegmentBar } from "./segment-bar";

/** The pages' words keep a number and its unit together with a non-breaking space. */
const nb = (words: string) => words.replace(/(\d) (?=[%A-Za-z°])/gu, "$1 ");

describe("SegmentBar", () => {
  it("is a meter with its value, range, name and text alternative", () => {
    render(<SegmentBar {...segmentBarArgs(FILE_SYSTEMS.data, "row")} />);
    const meter = screen.getByRole("meter", { name: "Data drive: space used" });
    expect(meter).toHaveAttribute("aria-valuenow", "62");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
    expect(meter.getAttribute("aria-valuetext")).toBe(
      nb("62 % used, 1.4 TiB free of 3.6 TiB, the warning mark is at 85 %."),
    );
    // No stray text in the meter: the hidden "x" Base UI adds to an empty meter is not there.
    expect(meter.textContent).toBe(nb("85 %"));
  });

  it("draws twenty segments at every size", () => {
    const { container } = render(
      <>
        {(["row", "cell", "page"] as const).map((size) => (
          <SegmentBar key={size} {...segmentBarArgs(FILE_SYSTEMS.data, size)} />
        ))}
      </>,
    );
    for (const bar of container.querySelectorAll("[data-slot=segment-bar]")) {
      const segments = new Set(
        [...bar.querySelectorAll("[data-segment]")].map((g) =>
          g.getAttribute("data-segment"),
        ),
      );
      expect(segments.size).toBe(20);
    }
  });

  it("gives the used part past the mark the warning stroke only with the word", () => {
    const { container, rerender } = render(
      <SegmentBar {...segmentBarArgs(FILE_SYSTEMS.media, "row")} />,
    );
    // Media is at 91 % past 85 %: the 18th segment whole and the 19th a fifth.
    const over = () =>
      container.querySelectorAll("[data-over] [data-part=used]");
    expect(over()).toHaveLength(2);
    for (const used of over()) {
      expect(used.getAttribute("class")).toContain("fill-warning-stroke");
    }
    for (const used of container.querySelectorAll(
      "g:not([data-over]) [data-part=used]",
    )) {
      expect(used.getAttribute("class")).toBe("fill-usage");
    }
    expect(screen.getByText("Almost full")).toBeInTheDocument();
    rerender(<SegmentBar {...segmentBarArgs(FILE_SYSTEMS.media, "cell")} />);
    expect(over()).toHaveLength(2);
    // The same reading with no word: the segments stay blue.
    rerender(
      <SegmentBar
        {...segmentBarArgs(FILE_SYSTEMS.media, "row")}
        threshold={undefined}
      />,
    );
    expect(container.querySelector("[data-over]")).toBeNull();
    expect(container.querySelector(".fill-warning-stroke")).toBeNull();
  });

  it("splits the segment a mark falls inside, with one straight rule", () => {
    const { container } = render(
      <SegmentBar {...segmentBarArgs(FILE_SYSTEMS.backup, "row")} />,
    );
    expect(container.querySelectorAll("[data-segment='17']")).toHaveLength(2);
    const rule = container.querySelector("[data-part=mark]");
    expect(rule?.getAttribute("d")).toMatch(/^M[\d.]+ 0V[\d.]+$/u);
  });

  it("draws no gap, rule or mark value when no mark is set", () => {
    const { container } = render(
      <SegmentBar {...segmentBarArgs(FILE_SYSTEMS.tank, "page")} />,
    );
    expect(container.querySelector("[data-part=mark]")).toBeNull();
    expect(container.querySelector("[data-slot=segment-bar-mark]")).toBeNull();
    expect(container.querySelector("[data-past]")).toBeNull();
    expect(screen.getByText(/no warning mark is set\.$/u)).toBeInTheDocument();
  });

  it("writes the mark's value on a page and in a row, but not in a cell", () => {
    const { rerender } = render(
      <SegmentBar {...segmentBarArgs(FILE_SYSTEMS.data, "page")} />,
    );
    // The text queries fold the non-breaking space into a plain one.
    expect(screen.getByText("Warning at 85 %")).toBeInTheDocument();
    rerender(<SegmentBar {...segmentBarArgs(FILE_SYSTEMS.data, "cell")} />);
    expect(screen.queryByText("85 %")).toBeNull();
  });

  it("fills every segment and outlines none", () => {
    const { container } = render(
      <>
        {(["row", "cell", "page"] as const).map((size) => (
          <SegmentBar
            key={size}
            {...segmentBarArgs(FILE_SYSTEMS.media, size)}
          />
        ))}
      </>,
    );
    expect(container.querySelectorAll("[data-part=empty]")).toHaveLength(60);
    const parts = container.querySelectorAll(
      "[data-part=empty], [data-part=used]",
    );
    for (const part of parts) {
      expect(part.getAttribute("stroke")).toBeNull();
      expect(part.getAttribute("style")).toBeNull();
      // A utility that draws round it, not a token whose name says "stroke" (fill-warning-stroke).
      for (const utility of (part.getAttribute("class") ?? "").split(/\s+/u)) {
        expect(utility).not.toMatch(/^(stroke|border|outline|ring|shadow)/u);
      }
    }
    for (const empty of container.querySelectorAll("[data-part=empty]")) {
      expect(empty.getAttribute("class")).toBe("fill-usage-empty");
    }
  });

  it("keeps one fixed width at each size, whatever the reading", () => {
    const { container } = render(
      <>
        {[FILE_SYSTEMS.data, FILE_SYSTEMS.backup, FILE_SYSTEMS.tank].map(
          (row) => (
            <SegmentBar key={row.devicename} {...segmentBarArgs(row, "row")} />
          ),
        )}
      </>,
    );
    const widths = [
      ...container.querySelectorAll<HTMLElement>(
        "[data-slot=segment-bar-segments]",
      ),
    ].map((el) => el.style.width);
    expect(widths).toEqual(["198px", "198px", "198px"]);
  });

  it("fades the word in only when a new reading brings it", () => {
    const { container, unmount } = render(
      <SegmentBar {...segmentBarArgs(FILE_SYSTEMS.media, "row")} />,
    );
    expect(
      container.querySelector("[data-slot=segment-bar-threshold]")?.className,
    ).not.toContain("animate-fade-in");
    unmount();
    const later = render(
      <SegmentBar {...segmentBarArgs(FILE_SYSTEMS.data, "row")} />,
    );
    later.rerender(
      <SegmentBar {...segmentBarArgs(FILE_SYSTEMS.media, "row")} />,
    );
    expect(
      later.container.querySelector("[data-slot=segment-bar-threshold]")
        ?.className,
    ).toContain("animate-fade-in");
  });
});
