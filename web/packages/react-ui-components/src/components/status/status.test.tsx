// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusDot, StatusPill } from "./status";
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

describe("StatusPill", () => {
  it.each(cases)(
    "%s shows its word and its own icon shape",
    (status, word, icon) => {
      const { container } = render(
        <StatusPill status={status}>{word}</StatusPill>,
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
          <StatusPill status={status}>x</StatusPill>,
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
});

describe("StatusDot", () => {
  it("draws the Unknown family hollow and names every dot", () => {
    const { container } = render(
      <>
        <StatusDot status="ok" label="OK" />
        <StatusDot status="unknown" label="Unknown" />
      </>,
    );
    expect(screen.getByRole("img", { name: "OK" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Unknown" })).toBeInTheDocument();
    const unknown = container.querySelector("[data-status=unknown]");
    expect(unknown?.className).toContain("bg-transparent");
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
