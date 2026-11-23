// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReconnectWatch } from "./reconnect-watch";
import { useElapsedSeconds } from "./use-elapsed-seconds";

const waiting = (seconds: number) =>
  seconds === 0
    ? "Waiting for the NAS to answer…"
    : `Waiting for the NAS to answer… ${String(seconds)} seconds`;

const copy = {
  label: "Copy the new address",
  copiedLabel: "Copied",
  selectedLabel: "Selected. Press Ctrl+C to copy.",
};

function announcer(container: HTMLElement) {
  return container.querySelector('[data-slot="reconnect-watch-announcer"]');
}

describe("ReconnectWatch", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows every second but announces the elapsed time every 15 seconds only", () => {
    const props = {
      state: "waiting" as const,
      waiting,
      stopLabel: "Stop waiting",
      onStop: () => undefined,
    };
    const { container, rerender } = render(
      <ReconnectWatch {...props} elapsedSeconds={0} />,
    );
    expect(announcer(container)).toHaveAttribute("role", "status");
    expect(announcer(container)).toHaveTextContent(
      "Waiting for the NAS to answer…",
    );
    const heard: string[] = [];
    for (let second = 1; second <= 31; second += 1) {
      rerender(<ReconnectWatch {...props} elapsedSeconds={second} />);
      const text = announcer(container)?.textContent ?? "";
      if (heard[heard.length - 1] !== text) {
        heard.push(text);
      }
    }
    expect(
      screen.getByText("Waiting for the NAS to answer… 31 seconds"),
    ).toBeVisible();
    expect(heard).toEqual([
      "Waiting for the NAS to answer…",
      "Waiting for the NAS to answer… 15 seconds",
      "Waiting for the NAS to answer… 30 seconds",
    ]);
  });

  it("can be left: Stop waiting calls back", async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(
      <ReconnectWatch
        state="waiting"
        elapsedSeconds={4}
        waiting={waiting}
        stopLabel="Stop waiting"
        onStop={onStop}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Stop waiting" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("does not move its indicator under reduced motion", () => {
    const { container } = render(
      <ReconnectWatch
        state="waiting"
        elapsedSeconds={4}
        waiting={waiting}
        stopLabel="Stop waiting"
        onStop={() => undefined}
      />,
    );
    const indicator = container.querySelector(
      '[data-slot="reconnect-watch-indicator"]',
    );
    expect(indicator?.getAttribute("class")).toContain(
      "motion-safe:animate-spin",
    );
    expect(indicator?.getAttribute("class")).not.toMatch(/(^| )animate-spin/);
  });

  it("announces the outcome in a region present while waiting", () => {
    const { container, rerender } = render(
      <ReconnectWatch
        state="waiting"
        elapsedSeconds={20}
        waiting={waiting}
        stopLabel="Stop waiting"
        onStop={() => undefined}
      />,
    );
    const outcome = container.querySelector(
      '[data-slot="reconnect-watch-outcome"]',
    );
    expect(outcome).toHaveAttribute("role", "status");
    expect(outcome).toBeEmptyDOMElement();
    rerender(
      <ReconnectWatch
        state="connected"
        message="Connected again. This page reaches the NAS at 192.0.2.10 through enp2s0."
      />,
    );
    expect(
      container.querySelector('[data-slot="reconnect-watch-outcome"]'),
    ).toBe(outcome);
    expect(outcome).toHaveTextContent("Connected again.");
    expect(announcer(container)).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: "Stop waiting" })).toBeNull();
  });

  it("gives the moved card the address as text with a copy button, and no link unless passed", () => {
    const { rerender } = render(
      <ReconnectWatch
        state="moved"
        url="http://192.0.2.20/ui/"
        message={(url) => <>The NAS is now at {url}.</>}
        copy={copy}
        note="You need to sign in again there."
      />,
    );
    expect(screen.getByText("http://192.0.2.20/ui/").tagName).toBe("CODE");
    expect(
      screen.getByRole("button", { name: "Copy the new address" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    rerender(
      <ReconnectWatch
        state="moved"
        url="http://192.0.2.20/ui/"
        message={(url) => <>The NAS is now at {url}.</>}
        copy={copy}
        link={{
          href: "http://192.0.2.20/ui/",
          label: "Open the NAS at its new address",
          newTabLabel: "(opens in a new tab)",
        }}
      />,
    );
    const link = screen.getByRole("link", {
      name: /^Open the NAS at its new address ?\(opens in a new tab\)$/,
    });
    expect(link).toHaveAttribute("href", "http://192.0.2.20/ui/");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("offers Sign in when the NAS answers but the session is gone", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn();
    render(
      <ReconnectWatch
        state="signIn"
        message="The NAS answers, but this page needs you to sign in again."
        signInLabel="Sign in"
        onSignIn={onSignIn}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});

describe("useElapsedSeconds", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts up while running and starts again from 0", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ running }) => useElapsedSeconds(running),
      { initialProps: { running: true } },
    );
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(18_000);
    });
    expect(result.current).toBe(18);
    rerender({ running: false });
    expect(result.current).toBe(0);
    rerender({ running: true });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current).toBe(2);
  });
});
