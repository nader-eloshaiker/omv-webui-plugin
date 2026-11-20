// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { stripControl } from "./strip-control";
import { TaskLog } from "./task-log";

const labels = {
  label: "Output of Install updates",
  copyLabel: "Copy output",
  copiedLabel: "Output copied",
};

describe("stripControl", () => {
  it.each([
    [
      "\u001b[1;31mE:\u001b[0m Unable to locate package",
      "E: Unable to locate package",
    ],
    ["\u001b]0;owned\u0007title", "title"],
    ["\u001b]8;;https://example.org\u001b\\link\u001b]8;;\u001b\\", "link"],
    ["\u009b31mred", "red"],
    ["Progress: 10%\rProgress: 100%", "Progress: 100%"],
    ["bell\u0007 and null\u0000 and del\u007f", "bell and null and del"],
    ["‮exe.txt", "exe.txt"],
    ["tab\tkept", "tab\tkept"],
    ["Ünïcödé and 日本語 kept", "Ünïcödé and 日本語 kept"],
  ])("cleans %j", (input, expected) => {
    expect(stripControl(input)).toBe(expected);
  });
});

describe("TaskLog", () => {
  it("renders hostile output as inert text", () => {
    const hostile = [
      '<img src=x onerror="alert(1)">',
      "<script>alert(2)</script>",
      { time: "12:04:01", text: '<a href="javascript:alert(3)">click</a>' },
      "\u001b[31m<b>bold?</b>\u001b[0m",
    ];
    const { container } = render(<TaskLog {...labels} lines={hostile} />);
    const region = screen.getByRole("region", { name: labels.label });
    expect(region.querySelectorAll("img, script, a, b")).toHaveLength(0);
    expect(region).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(region).toHaveTextContent("<script>alert(2)</script>");
    expect(region).toHaveTextContent("<b>bold?</b>");
    expect(region.textContent).not.toContain("\u001b");
    expect(
      container.querySelectorAll("[data-slot=task-log-line]"),
    ).toHaveLength(4);
  });

  it("announces the end in a polite live region and keeps it on screen", () => {
    const { rerender } = render(
      <TaskLog {...labels} lines={["Reading package lists..."]} />,
    );
    const statuses = screen.getAllByRole("status");
    expect(statuses.every((s) => s.textContent === "")).toBe(true);
    rerender(
      <TaskLog
        {...labels}
        lines={["Reading package lists...", "Done."]}
        endMessage="Finished: 3 packages upgraded"
      />,
    );
    expect(
      screen
        .getAllByRole("status")
        .some((s) => s.textContent === "Finished: 3 packages upgraded"),
    ).toBe(true);
  });
});
