// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusDot, StatusLabel, StatusPill } from "./status";
import { rollUp, type Status } from "./status-kinds";

const cases: [Status, string, string][] = [
  ["ok", "OK", "check"],
  ["warning", "Warning", "triangle"],
  ["critical", "Critical", "octagon"],
  ["unknown", "Unknown", "dashed"],
  ["disabled", "Disabled", "dashed"],
  ["stopped", "Stopped", "dashed"],
  ["waiting", "Waiting", "dashed"],
  ["running", "Running", "spinner"],
  ["succeeded", "Succeeded", "check"],
  ["failed", "Failed", "octagon"],
  ["cancelled", "Cancelled", "slash"],
  ["pending", "Pending", "clock"],
];

describe("StatusLabel", () => {
  it.each(cases)(
    "%s shows its word and its own icon shape",
    (status, word, icon) => {
      const { container } = render(
        <StatusLabel status={status}>{word}</StatusLabel>,
      );
      expect(screen.getByText(word)).toBeInTheDocument();
      const mark = container.querySelector("[data-icon]");
      expect(mark).toHaveAttribute("data-icon", icon);
      expect(mark).toHaveAttribute("aria-hidden", "true");
    },
  );

  it("gives OK, Warning, Critical and Unknown four different shapes", () => {
    const shapes = new Set(
      (["ok", "warning", "critical", "unknown"] as const).map((status) => {
        const { container, unmount } = render(
          <StatusLabel status={status}>x</StatusLabel>,
        );
        const shape = container
          .querySelector("[data-icon]")
          ?.getAttribute("data-icon");
        unmount();
        return shape;
      }),
    );
    expect(shapes.size).toBe(4);
  });

  it("is an icon and a coloured word, never a capsule (style guide 10)", () => {
    const { container } = render(
      <StatusLabel status="warning">Warning</StatusLabel>,
    );
    const label = container.querySelector("[data-slot=status-pill]");
    expect(label?.className).toContain("text-warning-label");
    expect(label?.className).not.toMatch(/rounded-full|border|bg-/);
  });

  it("keeps the old name as the same component", () => {
    expect(StatusPill).toBe(StatusLabel);
  });
});

describe("StatusDot", () => {
  it("draws the status's icon, not a disc, names every mark, and is not a tab stop", () => {
    const { container } = render(
      <>
        <StatusDot status="ok" label="OK" />
        <StatusDot status="unknown" label="Unknown" />
      </>,
    );
    expect(screen.getByText("OK")).toHaveClass("sr-only");
    expect(screen.getByText("Unknown")).toHaveClass("sr-only");
    const unknown = container.querySelector(
      "[data-slot=status-dot][data-status=unknown]",
    );
    expect(unknown?.querySelector("[data-icon]")).toHaveAttribute(
      "data-icon",
      "dashed",
    );
    expect(unknown?.className).not.toMatch(/rounded-full|bg-/);
    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
  });
});

describe("rollUp", () => {
  it("reports the worst state and how many share it", () => {
    expect(rollUp(["ok", "critical", "ok", "ok"])).toEqual({
      status: "critical",
      count: 1,
      total: 4,
    });
  });

  it("never rolls an unread member up as fine", () => {
    expect(rollUp(["ok", "unknown", "ok"]).status).toBe("unknown");
  });

  it("has no status for an empty set", () => {
    expect(rollUp([])).toEqual({ status: undefined, count: 0, total: 0 });
  });
});
