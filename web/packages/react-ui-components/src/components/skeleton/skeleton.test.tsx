// SPDX-License-Identifier: GPL-3.0-or-later
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("is hidden from assistive technology and pulses only when motion is allowed", () => {
    const { container } = render(
      <>
        <Skeleton className="w-24" />
        <Skeleton shape="block" className="h-8" />
      </>,
    );
    const [line, block] = Array.from(
      container.querySelectorAll("[data-slot=skeleton]"),
    );
    for (const element of [line, block]) {
      expect(element).toHaveAttribute("aria-hidden", "true");
      expect(element?.className).toContain("motion-safe:animate-breathe");
      expect(element?.className).not.toMatch(/(^|\s)animate-breathe/);
    }
    expect(line).toHaveAttribute("data-shape", "line");
    expect(block).toHaveAttribute("data-shape", "block");
  });
});
