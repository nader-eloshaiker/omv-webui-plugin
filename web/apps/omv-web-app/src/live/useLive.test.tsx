// SPDX-License-Identifier: GPL-3.0-or-later
// The shell's combined read through the whole app on MSW: its cadence (10 s on a page, 2 s while a
// chart is on screen, none while the tab is hidden, none for a normal user), that every read of it is
// a background call (UI-14), that its replies become samples, and that signing out forgets them.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import {
  getNetworkEnumerateDevicesListQueryKey,
  getSystemGetInformationQueryKey,
} from "@omv-webui/react-api-omv/generated";
import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_INTERFACES } from "../hooks/useMonitoringReads.ts";
import { renderApp } from "../test/renderApp.tsx";
import { seenCalls } from "../test/server.ts";
import { setVisibility } from "../test/visibility.ts";
import { LIVE_CHART_MS, LIVE_PAGE_MS } from "./liveDemand.ts";
import { EMPTY_LIVE, liveSamples } from "./liveSamples.ts";
import { useLiveSamples, type LiveView } from "./useLive.ts";

const INFO = "System.getInformation";
const COUNTERS = "Network.enumerateDevicesList";
const LIVE_CALLS = new Set([INFO, COUNTERS]);

const count = (call: string) => seenCalls.filter((c) => c.call === call).length;

// Only the intervals are fake: replies, the clock and the stamps run on real time, so a reply is
// always fresh and nothing but the poll's timer asks again.
const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 40)));
async function tick(ms: number) {
  await act(() => {
    vi.advanceTimersByTime(ms);
  });
  await settle();
}

/** What a chart does: draw from the samples, which registers it as on screen while mounted. */
let seen: LiveView | undefined;
function Chart() {
  seen = useLiveSamples();
  return null;
}
const showChart = () =>
  render(
    <StrictMode>
      <Chart />
    </StrictMode>,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  seen = undefined;
});

afterEach(() => {
  setVisibility("visible");
});

/** An administrator on a page with no chart of its own (the dashboard has one: "Right now"). */
async function admin(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    signedIn: true,
    path: "/account/settings",
    ...options,
  });
  await screen.findAllByRole("banner");
  await settle();
  return app;
}

describe("the combined read's cadence", () => {
  it("reads every 10 s on a page, every 2 s while a chart is on screen, and not while the tab is hidden", async () => {
    await admin();
    const from = seenCalls.length;
    const info = count(INFO);
    const counters = count(COUNTERS);
    const reads = () => ({
      info: count(INFO) - info,
      counters: count(COUNTERS) - counters,
    });

    // A page without a chart: every 10 s.
    await tick(LIVE_PAGE_MS - 1000);
    expect(reads()).toEqual({ info: 0, counters: 0 });
    await tick(1000);
    expect(reads()).toEqual({ info: 1, counters: 1 });

    // A chart comes on screen: every 2 s.
    const chart = showChart();
    await settle();
    for (let i = 1; i <= 5; i += 1) {
      await tick(LIVE_CHART_MS);
      expect(reads()).toEqual({ info: 1 + i, counters: 1 + i });
    }

    // It goes: back to every 10 s.
    chart.unmount();
    await settle();
    await tick(LIVE_PAGE_MS - LIVE_CHART_MS);
    expect(reads()).toEqual({ info: 6, counters: 6 });
    await tick(LIVE_CHART_MS);
    expect(reads()).toEqual({ info: 7, counters: 7 });

    // Hidden, even with a chart mounted: nothing.
    const hiddenChart = showChart();
    setVisibility("hidden");
    await settle();
    for (let i = 0; i < 30; i += 1) {
      await tick(LIVE_CHART_MS);
    }
    await tick(LIVE_PAGE_MS * 6);
    expect(reads()).toEqual({ info: 7, counters: 7 });

    // Shown again: the chart's 2 s resumes.
    setVisibility("visible");
    await settle();
    await tick(LIVE_CHART_MS);
    expect(reads().info).toBeGreaterThanOrEqual(8);
    expect(reads().counters).toBeGreaterThanOrEqual(8);
    hiddenChart.unmount();

    // UI-14: every read of the poll is a background call, so it never keeps an idle session alive.
    const polled = seenCalls.slice(from).filter((c) => LIVE_CALLS.has(c.call));
    expect(polled.length).toBeGreaterThanOrEqual(16);
    expect(polled.every((c) => c.background)).toBe(true);
  });

  it("is one poll: the pages' own readers of the same entries add no timer", async () => {
    // TanStack Query runs one timer per observer. The dashboard reads System.getInformation and the
    // interfaces itself, as do the pending-changes indicator and others; only the shell's observer of
    // each entry has an interval.
    const { app } = await admin({ path: "/" });
    for (const queryKey of [
      getSystemGetInformationQueryKey(),
      getNetworkEnumerateDevicesListQueryKey(ALL_INTERFACES),
    ]) {
      const observers =
        app.queryClient.getQueryCache().find({ queryKey })?.observers ?? [];
      expect(observers.length).toBeGreaterThan(1);
      expect(
        observers.filter(
          (o) =>
            o.options.refetchInterval !== undefined &&
            o.options.refetchInterval !== false,
        ),
      ).toHaveLength(1);
    }
    const info = count(INFO);
    const counters = count(COUNTERS);
    for (let i = 0; i < 3; i += 1) {
      await tick(LIVE_PAGE_MS);
    }
    expect(count(INFO) - info).toBe(3);
    expect(count(COUNTERS) - counters).toBe(3);
  });

  it("does not poll for a normal user, and never reads the counters (an administrator's method)", async () => {
    await renderApp({ signedIn: true, scenario: "user" });
    await screen.findAllByRole("banner");
    await settle();
    const info = count(INFO);
    showChart();
    await settle();
    await tick(LIVE_PAGE_MS * 6);
    expect(count(INFO)).toBe(info);
    expect(count(COUNTERS)).toBe(0);
    expect(liveSamples.getState()).toEqual(EMPTY_LIVE);
  });
});

describe("the samples", () => {
  const LIST =
    CONTRACT_EXAMPLES.networkEnumerateDevicesList.ethernetAndLoopback.value;
  // Counters that grow by 1000 bytes received and 10 sent per read.
  let served = 0;
  const growing = () => {
    served += 1;
    return {
      status: 200,
      value: {
        ...LIST,
        data: LIST.data.map((d) => ({
          ...d,
          stats: {
            ...d.stats,
            rx_bytes: String(served * 1000),
            tx_bytes: String(served * 10),
          },
        })),
      },
    };
  };

  it("records each reply with its receipt time, derives rates, states the span, and forgets it all on sign-out", async () => {
    served = 0;
    const { user } = await admin({
      answers: { networkEnumerateDevicesList: growing },
    });
    showChart();
    await settle();
    for (let i = 0; i < 3; i += 1) {
      await tick(LIVE_CHART_MS);
    }
    const state = liveSamples.getState();
    // The boot's own read is the first sample.
    expect(state.system.length).toBeGreaterThanOrEqual(4);
    expect(state.traffic.length).toBeGreaterThanOrEqual(3);
    const last = state.traffic.at(-1)!;
    expect(last.since).toBeLessThan(last.t);
    expect([...last.interfaces.keys()]).not.toContain("lo");
    for (const rate of last.interfaces.values()) {
      expect(rate.rx).toBeGreaterThan(0);
      expect(rate.tx).toBeGreaterThan(0);
    }
    expect(seen?.systemSpan).toEqual({
      from: state.system[0]!.t,
      to: state.system.at(-1)!.t,
      ms: state.system.at(-1)!.t - state.system[0]!.t,
    });
    expect(seen?.trafficSpan?.to).toBe(last.t);

    await user.click(
      await screen.findByRole("button", { name: "Account: example-user" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await screen.findByRole("heading", { name: "Sign in" });
    expect(liveSamples.getState()).toEqual(EMPTY_LIVE);
    expect(seen?.system).toEqual([]);
    expect(seen?.systemSpan).toBeNull();
  });
});
