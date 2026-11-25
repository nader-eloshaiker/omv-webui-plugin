// SPDX-License-Identifier: GPL-3.0-or-later
// A first-time tip as a person meets it: one line, dismissed with Got it.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tip } from "./parts.tsx";

describe("a tip", () => {
  it("is one line with a plain Got it button that dismisses it", async () => {
    const onDismiss = vi.fn();
    render(<Tip onDismiss={onDismiss}>Press Ctrl Enter to create it.</Tip>);
    const tip = screen.getByText(
      "Press Ctrl Enter to create it.",
    ).parentElement;
    expect(tip?.tagName).toBe("P");
    const gotIt = screen.getByRole("button", { name: "Got it" });
    // A plain text button: no fill and no edge of its own.
    expect(gotIt.className).toMatch(/\bbg-transparent\b/u);
    expect(gotIt.className).toMatch(/\bborder-transparent\b/u);
    await userEvent.click(gotIt);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
