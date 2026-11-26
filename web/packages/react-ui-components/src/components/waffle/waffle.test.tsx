// SPDX-License-Identifier: GPL-3.0-or-later
// The waffle as a page meets it: a meter with its value, range, name and words; the warning stroke
// only on the used squares past a crossed mark and only with the status word; every square filled
// and none outlined; the mark's value written where there is room.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FILE_SYSTEMS, waffleArgs } from "../../fixtures/chart-fixtures";
import { Waffle } from "./waffle";

describe("Waffle", () => {
  it("is a meter with its value, range, name and text alternative", () => {
    render(<Waffle {...waffleArgs(FILE_SYSTEMS.data, "row")} />);
    const meter = screen.getByRole("meter", { name: "Data drive: space used" });
    expect(meter).toHaveAttribute("aria-valuenow", "62");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
    expect(meter.getAttribute("aria-valuetext")).toBe(
      "62 % used, 1.4 TiB free of 3.6 TiB, the warning mark is at 85 %.",
    );
    // No stray text in the meter: the hidden "x" Base UI adds to an empty meter is not there.
    expect(meter.textContent).toBe("85 %");
  });

  it("gives the used squares past the mark the warning stroke only with the word", () => {
    const { container, rerender } = render(
      <Waffle {...waffleArgs(FILE_SYSTEMS.media, "row")} />,
    );
    expect(
      container.querySelectorAll("[data-over] [data-part=used]"),
    ).toHaveLength(6);
    for (const used of container.querySelectorAll(
      "[data-over] [data-part=used]",
    )) {
      expect(used.getAttribute("class")).toContain("fill-warning-stroke");
    }
    expect(screen.getByText("Almost full")).toBeInTheDocument();
    rerender(<Waffle {...waffleArgs(FILE_SYSTEMS.media, "cell")} />);
    expect(
      container.querySelectorAll("[data-over] [data-part=used]"),
    ).toHaveLength(3);
    // The same reading with no word: the squares stay blue.
    rerender(
      <Waffle
        {...waffleArgs(FILE_SYSTEMS.media, "row")}
        threshold={undefined}
      />,
    );
    expect(container.querySelector("[data-over]")).toBeNull();
    expect(container.querySelector(".fill-warning-stroke")).toBeNull();
  });

  it("draws no gap, rule or mark value when no mark is set", () => {
    const { container } = render(
      <Waffle {...waffleArgs(FILE_SYSTEMS.tank, "page")} />,
    );
    expect(container.querySelector("[data-part=mark]")).toBeNull();
    expect(container.querySelector("[data-slot=waffle-mark]")).toBeNull();
    expect(screen.getByText(/no warning mark is set\.$/u)).toBeInTheDocument();
  });

  it("writes the mark's value on a page and in a row, but not in a cell", () => {
    const { rerender } = render(
      <Waffle {...waffleArgs(FILE_SYSTEMS.data, "page")} />,
    );
    expect(screen.getByText("Warning at 85 %")).toBeInTheDocument();
    rerender(<Waffle {...waffleArgs(FILE_SYSTEMS.data, "cell")} />);
    expect(screen.queryByText("85 %")).toBeNull();
  });

  it("fills every square and outlines none", () => {
    const { container } = render(
      <>
        {(["row", "cell", "page"] as const).map((size) => (
          <Waffle key={size} {...waffleArgs(FILE_SYSTEMS.media, size)} />
        ))}
      </>,
    );
    expect(container.querySelectorAll("[data-part=empty]")).toHaveLength(240);
    const squares = container.querySelectorAll("rect");
    for (const rect of squares) {
      expect(rect.getAttribute("stroke")).toBeNull();
      expect(rect.getAttribute("style")).toBeNull();
      // A utility that draws round it, not a token whose name says "stroke" (fill-warning-stroke).
      for (const utility of (rect.getAttribute("class") ?? "").split(/\s+/u)) {
        expect(utility).not.toMatch(/^(stroke|border|outline|ring|shadow)/u);
      }
    }
    for (const empty of container.querySelectorAll("[data-part=empty]")) {
      expect(empty.getAttribute("class")).toBe("fill-usage-empty");
    }
  });

  it("fades the word in only when a new reading brings it", () => {
    const { container, unmount } = render(
      <Waffle {...waffleArgs(FILE_SYSTEMS.media, "row")} />,
    );
    expect(
      container.querySelector("[data-slot=waffle-threshold]")?.className,
    ).not.toContain("animate-fade-in");
    unmount();
    const later = render(<Waffle {...waffleArgs(FILE_SYSTEMS.data, "row")} />);
    later.rerender(<Waffle {...waffleArgs(FILE_SYSTEMS.media, "row")} />);
    expect(
      later.container.querySelector("[data-slot=waffle-threshold]")?.className,
    ).toContain("animate-fade-in");
  });
});
