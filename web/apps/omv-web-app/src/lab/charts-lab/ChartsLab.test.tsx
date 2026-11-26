// SPDX-License-Identifier: GPL-3.0-or-later
// The chart lab as the owner meets it: every subject with its candidates, the meters carrying their
// values, the live charts' text alternatives, nothing of the generated look, and still=1 the same on
// every render. Lab fixtures only; nothing here reaches the network.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import ChartsLab from "./ChartsLab.tsx";

function open(query: string) {
  window.history.replaceState(null, "", `/ui/lab?screen=charts&${query}`);
  return render(<ChartsLab />);
}

afterEach(() => {
  document.documentElement.removeAttribute("data-motion");
  document.documentElement.removeAttribute("data-density");
});

describe("the chart lab", () => {
  it("shows each subject with its candidates, each with its sentence, and ends in place", () => {
    open("still=1");
    const subjects = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(subjects).toEqual([
      "Space used on a file system",
      "Live readouts",
      "Disk temperatures across the bay",
      "In place",
    ]);
    const candidates = screen.getAllByRole("article");
    expect(candidates).toHaveLength(8);
    for (const article of candidates) {
      const caption = article.querySelector(".ch-caption")?.textContent ?? "";
      expect(caption).toMatch(/^[A-Z].+\.$/u);
    }
  });

  it("exposes every meter with its value, range and name", () => {
    open("still=1");
    const data = screen.getAllByRole("meter", {
      name: "Data drive: space used",
    });
    // Three candidates at three sizes, and the row in place.
    expect(data).toHaveLength(10);
    for (const meter of data) {
      expect(meter).toHaveAttribute("aria-valuenow", "62");
      expect(meter).toHaveAttribute("aria-valuemin", "0");
      expect(meter).toHaveAttribute("aria-valuemax", "100");
      expect(meter.getAttribute("aria-valuetext")).toContain(
        "1.4\u00a0TiB free",
      );
    }
    for (const meter of screen.getAllByRole("meter", {
      name: "Media: space used",
    })) {
      expect(meter).toHaveAttribute("aria-valuenow", "91");
    }
    expect(screen.getAllByText("Almost full").length).toBeGreaterThan(0);
    const memory = screen.getAllByRole("meter", { name: "Memory in use" });
    expect(memory[0]).toHaveAttribute("aria-valuenow", "10");
  });

  it("gives each live chart its value now and the range seen", () => {
    open("still=1");
    const processor = screen.getAllByRole("img", {
      name: /^Processor: \d+\s% now, between \d+\s% and \d+\s% since 10:31\./u,
    });
    expect(processor.length).toBeGreaterThanOrEqual(3);
    expect(
      screen.getAllByRole("img", { name: /Network out: [\d.]+\sMiB\/s now/u })
        .length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      screen.getAllByRole("img", {
        name: /^Disk temperatures read at 10:31: sde 31\s°C, .+ and sdc 37\s°C\. The alert limit is 45\s°C\. sdd is asleep and not read\.$/u,
      }),
    ).toHaveLength(2);
  });

  it("changes the space meter when the cause is pressed", async () => {
    const user = userEvent.setup();
    open("still=1");
    await user.click(
      screen.getByRole("button", { name: "Copy 1 TiB to the Data drive" }),
    );
    for (const meter of screen.getAllByRole("meter", {
      name: "Data drive: space used",
    })) {
      expect(meter).toHaveAttribute("aria-valuenow", "90");
    }
  });

  it("carries none of the generated look", () => {
    const { container } = open("still=1");
    const text = container.textContent;
    expect(text).not.toMatch(/[·•|]/u);
    expect(text).not.toMatch(/\bquiet\b/iu);
    expect(text).not.toMatch(/\breal\b/iu);
    expect(container.querySelector("style")).toBeNull();
    expect(
      container.querySelector("[class*='pulse'], [class*='glow']"),
    ).toBeNull();
  });

  it("is the same on every render with still=1, and takes a reading two seconds after the last", async () => {
    const user = userEvent.setup();
    const first = open("still=1");
    const live = () =>
      screen.getByRole("region", { name: "Live readouts" }).textContent;
    const before = live();
    first.unmount();
    open("still=1");
    expect(live()).toBe(before);
    const region = screen.getByRole("region", { name: "Live readouts" });
    expect(
      within(region).getByRole("button", { name: "Play" }),
    ).toBeInTheDocument();
    const alt = () =>
      within(region)
        .getAllByRole("img", { name: /^Processor:/u })[0]
        ?.getAttribute("aria-label");
    const was = alt();
    await user.click(
      within(region).getByRole("button", { name: "Take a reading" }),
    );
    expect(alt()).not.toBe(was);
    expect(live()).toContain("Since 10:31");
  });

  it("starts with no history: one reading as the page opens", async () => {
    const view = open("");
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getAllByText(/^One reading, at \d+:\d\d/u).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("img", { name: /^Network in: no reading yet\.$/u })
        .length,
    ).toBeGreaterThan(0);
    view.unmount();
  });
});
