// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from "vitest";
import { setVisibility } from "../test/visibility.ts";
import {
  createLiveDemand,
  LIVE_CHART_MS,
  LIVE_PAGE_MS,
  liveInterval,
} from "./liveDemand.ts";

afterEach(() => {
  setVisibility("visible");
});

describe("liveInterval", () => {
  it.each([
    { role: "admin", charts: 1, visible: true, expected: LIVE_CHART_MS },
    { role: "admin", charts: 3, visible: true, expected: LIVE_CHART_MS },
    { role: "admin", charts: 0, visible: true, expected: LIVE_PAGE_MS },
    { role: "admin", charts: 1, visible: false, expected: false },
    { role: "admin", charts: 0, visible: false, expected: false },
    { role: "user", charts: 1, visible: true, expected: false },
    { role: "user", charts: 0, visible: true, expected: false },
  ] as const)(
    "$role, $charts chart(s), visible $visible: $expected",
    ({ role, charts, visible, expected }) => {
      expect(liveInterval(role, { charts, visible })).toBe(expected);
    },
  );

  it("is 2 s and 10 s, as the owner chose", () => {
    expect([LIVE_CHART_MS, LIVE_PAGE_MS]).toEqual([2000, 10_000]);
  });
});

describe("the demand store", () => {
  it("counts the charts on screen; a release is counted once", () => {
    const demand = createLiveDemand();
    const listener = vi.fn();
    demand.subscribe(listener);
    const first = demand.showChart();
    const second = demand.showChart();
    expect(demand.getState().charts).toBe(2);
    first();
    first();
    expect(demand.getState().charts).toBe(1);
    second();
    expect(demand.getState().charts).toBe(0);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("follows the tab's visibility while subscribed, and stops listening with the last subscriber", () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const demand = createLiveDemand();
    expect(add).not.toHaveBeenCalled();
    const listener = vi.fn();
    const off = demand.subscribe(listener);
    expect(add).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    setVisibility("hidden");
    expect(demand.getState().visible).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    expect(demand.getState().visible).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    expect(remove).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
  });

  it("reads the visibility on getState even before anything subscribed", () => {
    const demand = createLiveDemand();
    setVisibility("hidden");
    expect(demand.getState().visible).toBe(false);
    // The same object while nothing changes, as useSyncExternalStore needs.
    expect(demand.getState()).toBe(demand.getState());
  });
});
