// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { stripControl } from "./strip-control";
import { TaskLog } from "./task-log";

const labels = {
  label: "Output of Install updates",
  copyLabel: "Copy output",
  copiedLabel: "Output copied",
  selectedLabel: "Output selected. Press Ctrl+C to copy.",
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

describe("TaskLog notices", () => {
  it("has its live regions from the first render and says when there is no output yet", () => {
    render(<TaskLog {...labels} lines={[]} emptyLabel="Waiting for output…" />);
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Waiting for output…")).toBeInTheDocument();
  });

  it("copies and says so, visibly and in a live region", async () => {
    const user = userEvent.setup();
    // user-event installs its own clipboard; watch it after setup.
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<TaskLog {...labels} lines={["\u001b[32mDone.\u001b[0m"]} />);
    await user.click(screen.getByRole("button", { name: "Copy output" }));
    expect(writeText).toHaveBeenCalledWith("Done.");
    expect(await screen.findByText("Output copied")).toBeInTheDocument();
  });

  it("selects the output and says how to copy it where there is no clipboard", async () => {
    const user = userEvent.setup();
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    render(<TaskLog {...labels} lines={["Done."]} />);
    await user.click(screen.getByRole("button", { name: "Copy output" }));
    expect(
      await screen.findByText("Output selected. Press Ctrl+C to copy."),
    ).toBeInTheDocument();
    if (original) {
      Object.defineProperty(navigator, "clipboard", original);
    }
  });

  it("downloads the cleaned output as a file", async () => {
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL }),
    );
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    const user = userEvent.setup();
    render(
      <TaskLog
        {...labels}
        lines={["Done."]}
        download={{ label: "Download output", fileName: "install-updates.log" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Download output" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual(["install-updates.log"]);
    vi.unstubAllGlobals();
  });

  it("keeps column output on one line per row and scrolls it inside its own frame", () => {
    const line =
      "PID     Username     Group        Machine    Protocol Version  Encryption";
    render(
      <TaskLog
        {...labels}
        lines={[line]}
        wrap={false}
        size="page"
        follow={false}
      />,
    );
    const region = screen.getByRole("region", { name: labels.label });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveAttribute("data-wrap", "false");
    expect(region.className).toContain("whitespace-pre");
    expect(region.className).not.toContain("whitespace-pre-wrap");
    expect(region.className).toContain("max-h-[70vh]");
    // The spaces that align the columns are kept, not collapsed.
    expect(region).toHaveTextContent(line, { normalizeWhitespace: false });
  });

  it("opens a snapshot at its first line when it does not follow", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${String(i)}`);
    const { rerender } = render(
      <TaskLog {...labels} lines={lines} follow={false} />,
    );
    const region = screen.getByRole("region", { name: labels.label });
    Object.defineProperty(region, "scrollHeight", {
      value: 2000,
      configurable: true,
    });
    rerender(<TaskLog {...labels} lines={[...lines]} follow={false} />);
    expect(region.scrollTop).toBe(0);
  });

  it("marks the region busy while a refresh is under way", () => {
    render(<TaskLog {...labels} lines={["kept"]} busy />);
    expect(screen.getByRole("region", { name: labels.label })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});
