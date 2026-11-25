// SPDX-License-Identifier: GPL-3.0-or-later
// The "Hide tips too?" offer: made once, on the first switch to compact or the first jump key, never
// when tips are already off, gone by itself after 8 seconds, and its button turns tips off.
import { Toaster, UiProvider } from "@omv-webui/react-ui-components";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearStorage } from "../../../stores/storageSnapshot.ts";
import { useTipsStore } from "../../../stores/useTipsStore.ts";
import type { OfferCause } from "./hideTipsOffer.ts";
import { OFFER_MS, useHideTipsOffer } from "./hideTipsOffer.ts";
import { TipsProvider } from "./TipsProvider.tsx";

afterEach(() => {
  useTipsStore.setState({ show: true, offered: false });
  clearStorage();
});

function Causes() {
  const { offer } = useHideTipsOffer();
  const cause = (c: OfferCause, words: string) => (
    <button
      type="button"
      onClick={() => {
        offer(c);
      }}
    >
      {words}
    </button>
  );
  return (
    <>
      {cause("compact", "Switch to compact")}
      {cause("keys", "Press a jump key")}
    </>
  );
}

function show() {
  render(
    <UiProvider>
      <TipsProvider>
        <Causes />
      </TipsProvider>
      <Toaster closeLabel="Dismiss" regionLabel="Notifications" />
    </UiProvider>,
  );
}

const press = (name: string) => {
  act(() => {
    screen.getByRole("button", { name }).click();
  });
};

describe("the Hide tips too? offer", () => {
  it("is made on the first switch to compact, with a Hide tips button that turns tips off", () => {
    show();
    press("Switch to compact");
    expect(
      screen.getByText("Compact view on. Hide tips too?"),
    ).toBeInTheDocument();
    expect(useTipsStore.getState().offered).toBe(true);
    press("Hide tips");
    expect(useTipsStore.getState().show).toBe(false);
  });

  it("speaks of the shortcuts when a jump key was the cause", () => {
    show();
    press("Press a jump key");
    expect(
      screen.getByText("You found the shortcuts. Hide tips too?"),
    ).toBeInTheDocument();
  });

  it("is made once only, in this browser", () => {
    useTipsStore.setState({ offered: true });
    show();
    press("Switch to compact");
    press("Press a jump key");
    expect(screen.queryByText(/Hide tips too\?/)).not.toBeInTheDocument();
  });

  it("is not made when tips are already off, and is not used up", () => {
    useTipsStore.setState({ show: false });
    show();
    press("Switch to compact");
    expect(screen.queryByText(/Hide tips too\?/)).not.toBeInTheDocument();
    expect(useTipsStore.getState().offered).toBe(false);
  });

  it("goes by itself after 8 seconds, and leaves tips as they were", async () => {
    vi.useFakeTimers();
    show();
    press("Switch to compact");
    expect(
      screen.getByText("Compact view on. Hide tips too?"),
    ).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OFFER_MS - 500);
    });
    expect(
      screen.getByText("Compact view on. Hide tips too?"),
    ).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(
      screen.queryByText("Compact view on. Hide tips too?"),
    ).not.toBeInTheDocument();
    expect(useTipsStore.getState().show).toBe(true);
  });
});
