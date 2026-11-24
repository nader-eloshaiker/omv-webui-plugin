// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubReducedMotion } from "../../test/layout";
import { LiveFigure } from "./live-figure";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const figure = (value: number | null) => (
  <LiveFigure
    value={value}
    format={(v) => v.toFixed(1)}
    unit="MiB/s"
    missing="No reading"
  />
);

describe("LiveFigure", () => {
  it("lands on the new value at once under reduced motion", () => {
    stubReducedMotion(true);
    const { container, rerender } = render(figure(12.4));
    rerender(figure(80.2));
    expect(container.querySelector("[aria-hidden]")).toHaveTextContent(
      "80.2MiB/s",
    );
    expect(
      screen.getByText("80.2", { exact: false, selector: ".sr-only" }),
    ).toBeInTheDocument();
  });

  it("glides through the frames to the new value, and a screen reader hears only the reading", async () => {
    stubReducedMotion(false);
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const { container, rerender } = render(figure(10));
    rerender(figure(20));
    const shown = () => container.querySelector("[aria-hidden]")?.textContent;
    // Part-way: between the two, while the screen reader text is already the reading.
    now = 200;
    await act(async () => {
      frames.shift()?.(now);
    });
    expect(shown()).not.toBe("10.0MiB/s");
    expect(shown()).not.toBe("20.0MiB/s");
    expect(container.querySelector(".sr-only")).toHaveTextContent("20.0 MiB/s");
    // The end: exactly the reading.
    now = 2000;
    await act(async () => {
      frames.shift()?.(now);
    });
    expect(shown()).toBe("20.0MiB/s");
  });

  it("says a missing reading in words, never as 0", () => {
    stubReducedMotion(false);
    render(figure(null));
    expect(screen.getByText("No reading")).toBeInTheDocument();
    expect(screen.queryByText(/0\.0/)).toBeNull();
  });
});
