// SPDX-License-Identifier: GPL-3.0-or-later
// The band shrinks into the pill while the page scrolls and comes back near the top, never while focus
// is inside it and never after a failure; it says applying, applied and failed in its live region; it
// leaves the document once closed.
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PendingBand, type PendingBandProps } from "./pending-band";

function Band(props: Partial<PendingBandProps>) {
  return (
    <PendingBand
      label="Pending changes"
      open
      message="3 changes waiting to be applied: SMB, SSH, Network"
      applyingMessage="Applying the changes…"
      appliedMessage="Applied. The services use the new settings."
      failedMessage="Applying the changes failed."
      applyLabel="Apply 3 changes"
      undoLabel="Undo 3 changes"
      retryLabel="Try applying again"
      onApply={() => undefined}
      onUndo={() => undefined}
      {...props}
    />
  );
}

async function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  fireEvent.scroll(window);
  await act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

afterEach(() => {
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

const band = () => screen.getByRole("region", { name: "Pending changes" });

describe("PendingBand", () => {
  it("shrinks into the pill while scrolling and comes back near the top", async () => {
    const onShrunkChange = vi.fn();
    render(<Band onShrunkChange={onShrunkChange} />);
    expect(
      screen.getByRole("button", { name: "Apply 3 changes" }),
    ).toBeVisible();

    await scrollTo(80);
    expect(band()).not.toHaveAttribute("data-shrunk");
    await scrollTo(400);
    expect(band()).toHaveAttribute("data-shrunk");
    expect(onShrunkChange).toHaveBeenLastCalledWith(true);
    // Shrunk, its controls are out of reach: nothing hidden takes focus.
    expect(
      screen
        .getByRole("button", { name: "Apply 3 changes" })
        .closest("[inert]"),
    ).not.toBeNull();

    // Hysteresis: it does not come back halfway up the page, only near the top.
    await scrollTo(100);
    expect(band()).toHaveAttribute("data-shrunk");
    await scrollTo(10);
    expect(band()).not.toHaveAttribute("data-shrunk");
    expect(onShrunkChange).toHaveBeenLastCalledWith(false);
    expect(
      screen
        .getByRole("button", { name: "Apply 3 changes" })
        .closest("[inert]"),
    ).toBeNull();
  });

  it("does not shrink while focus is inside it", async () => {
    render(<Band />);
    screen.getByRole("button", { name: "Undo 3 changes" }).focus();
    await scrollTo(400);
    expect(band()).not.toHaveAttribute("data-shrunk");
  });

  it("does not shrink after a failed apply, and offers to try again first", async () => {
    render(<Band state="failed" />);
    await scrollTo(400);
    expect(band()).not.toHaveAttribute("data-shrunk");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Applying the changes failed.",
    );
    expect(
      screen.getByRole("button", { name: "Try applying again" }),
    ).toBeInTheDocument();
  });

  it("stays where it is when told not to shrink", async () => {
    render(<Band shrinkOnScroll={false} />);
    await scrollTo(800);
    expect(band()).not.toHaveAttribute("data-shrunk");
  });

  it("says applying with Apply and Undo unavailable, then applied with the line full", () => {
    const { rerender } = render(<Band state="applying" />);
    expect(band()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Applying the changes…",
    );
    expect(
      screen.getByRole("button", { name: "Apply 3 changes" }),
    ).toHaveAttribute("aria-disabled", "true");
    rerender(<Band state="applied" />);
    expect(screen.getByRole("status")).toHaveTextContent("Applied.");
    expect(
      screen.getByRole("button", { name: "Apply 3 changes" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      band().querySelector('[data-slot="pending-band-progress"]'),
    ).toHaveClass("scale-x-100");
  });

  it("closes on its motion, then leaves the document", async () => {
    const { rerender } = render(<Band />);
    rerender(<Band open={false} />);
    expect(band()).not.toHaveAttribute("data-open");
    expect(
      screen
        .getByRole("button", { name: "Apply 3 changes" })
        .closest("[inert]"),
    ).not.toBeNull();
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Pending changes" }),
      ).toBeNull(),
    );
  });
});
