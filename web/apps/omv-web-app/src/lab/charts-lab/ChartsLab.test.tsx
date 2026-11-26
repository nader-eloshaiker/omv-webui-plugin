// SPDX-License-Identifier: GPL-3.0-or-later
// The chart lab as the owner meets it: each subject with its chosen chart, the meters carrying their
// values, the live charts' text alternatives and their per-half scales, the drive pictures by kind,
// the temperatures as a list for screen readers at 6 and 24 disks, the groups by kind with captions
// that claim no slot, nothing of the generated look, and still=1 the same on every render. Lab
// fixtures only; nothing here reaches the network.
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

/**
 * The figures carry a non-breaking space before their unit. Attributes keep it; text and accessible
 * names are compared with it collapsed to a space, as Testing Library reads them.
 */
const nb = (words: string) =>
  words.replace(/(\d) (?=[%A-Za-z°])/gu, "$1\u00a0");

/** The temperatures subject; the dashboard in place has a region of the same name. */
function tempsSubject(): HTMLElement {
  const section = screen
    .getByRole("heading", { level: 2, name: "Disk temperatures" })
    .closest("section");
  if (!section) {
    throw new Error("no temperatures subject");
  }
  return section;
}

describe("the chart lab", () => {
  it("shows each subject with its chart and its sentence, then in place, then what was not chosen", () => {
    open("still=1");
    const subjects = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(subjects).toEqual([
      "Space used on a file system",
      "Live readouts",
      "Disk temperatures",
      "In place",
      "Not chosen",
    ]);
    const candidates = screen.getAllByRole("article");
    expect(candidates.map((a) => a.querySelector("h3")?.textContent)).toEqual([
      "The waffle",
      "Two charts, four series",
      "Drive pictures",
      "Along one scale, stacked",
      "By kind, each with its level",
    ]);
    for (const article of candidates) {
      const caption = article.querySelector(".ch-caption")?.textContent ?? "";
      expect(caption).toMatch(/^[A-Z].+\.$/u);
    }
    const notChosen = screen.getByRole("region", { name: "Not chosen" });
    expect(within(notChosen).getAllByRole("definition")).toHaveLength(6);
    for (const line of within(notChosen).getAllByRole("definition")) {
      expect(line.textContent).toMatch(/^[A-Z].+\.$/u);
    }
  });

  it("exposes every waffle as a meter with its value, range and name", () => {
    open("still=1");
    const data = screen.getAllByRole("meter", {
      name: "Data drive: space used",
    });
    // The three sizes, and the row in place.
    expect(data).toHaveLength(4);
    for (const meter of data) {
      expect(meter).toHaveAttribute("aria-valuenow", "62");
      expect(meter).toHaveAttribute("aria-valuemin", "0");
      expect(meter).toHaveAttribute("aria-valuemax", "100");
      expect(meter.getAttribute("aria-valuetext")).toContain(
        nb("1.4 TiB free"),
      );
    }
    for (const meter of screen.getAllByRole("meter", {
      name: "Media: space used",
    })) {
      expect(meter).toHaveAttribute("aria-valuenow", "91");
    }
    expect(screen.getAllByText("Almost full").length).toBeGreaterThan(0);
    // The page writes the mark's value at its gap.
    expect(screen.getByText("Warning at 85 %")).toBeInTheDocument();
  });

  it("gives the used squares past the mark the warning fill only where the drive is almost full", () => {
    const { container } = open("still=1");
    const overSquares = container.querySelectorAll(
      ".ch-wf [data-over] .ch-wf-used",
    );
    // Media is past its mark in the map row (six 1 % squares) and the table (three 2.5 % squares).
    expect(overSquares).toHaveLength(9);
    const data = screen.getAllByRole("meter", {
      name: "Data drive: space used",
    })[0];
    expect(data?.querySelector("[data-over]")).toBeNull();
  });

  it("gives each live chart its value now and the range seen, and each network half its own scale", () => {
    open("still=1");
    expect(
      screen.getAllByRole("img", {
        name: /^Processor: \d+\s% now, between \d+\s% and \d+\s% since 10:31\. Memory: /u,
      }),
    ).toHaveLength(2);
    const network = screen.getAllByRole("img", {
      name: /Network out: [\d.]+\sMiB\/s now/u,
    });
    expect(network).toHaveLength(2);
    for (const chart of network) {
      expect(chart.getAttribute("aria-label")).toContain(
        nb(
          "In is drawn on a scale to 100 MiB/s and out on a scale to 2 MiB/s.",
        ),
      );
    }
    const live = screen.getByRole("region", { name: "Live readouts" });
    expect(within(live).getByText("100 MiB/s")).toBeInTheDocument();
    expect(within(live).getByText("2 MiB/s")).toBeInTheDocument();
    expect(
      within(live).getByText("The two halves are scaled separately."),
    ).toBeInTheDocument();
  });

  it("lists the six disks' temperatures for screen readers, coolest first", () => {
    open("still=1");
    const lists = screen.getAllByRole("list", {
      name: "Disk temperatures read at 10:31",
    });
    // The stacked chart, as a candidate and in place on the dashboard; the groups by kind are lists
    // of their own.
    expect(lists).toHaveLength(2);
    const items = within(lists[0] as HTMLElement)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    // The pictures are decorative, so each disk's kind is said in the words.
    expect(items).toEqual(
      [
        "31 °C: the SSD sde.",
        "34 °C: the NVMe SSD nvme0n1.",
        "35 °C: the hard disk sdb.",
        "36 °C: the hard disk sda.",
        "37 °C: the hard disk sdc.",
      ].map(nb),
    );
    expect(
      screen.getAllByText(/sdd is asleep, so its temperature was not read/u),
    ).toHaveLength(4);
  });

  it("draws each disk as its kind, decoratively, and names the kinds in the key and the sheet", () => {
    const { container } = open("still=1");
    const temps = tempsSubject();
    const sheet = within(temps).getByRole("article", {
      name: "Drive pictures",
    });
    for (const name of ["Hard disk", "SSD", "NVMe SSD"]) {
      expect(within(sheet).getByText(name)).toBeInTheDocument();
    }
    const sheetPictures = sheet.querySelectorAll("svg.ch-dp");
    expect(sheetPictures).toHaveLength(9);
    for (const kind of ["hdd", "ssd", "nvme"]) {
      for (const size of ["marker", "tile", "large"]) {
        expect(
          sheet.querySelector(`svg[data-kind="${kind}"][data-size="${size}"]`),
        ).not.toBeNull();
      }
    }
    // Every picture is decorative, and its inks come from the stylesheet's neutral classes alone:
    // no colour is written into the drawing.
    for (const svg of container.querySelectorAll("svg.ch-dp")) {
      expect(svg.closest("[aria-hidden='true']")).not.toBeNull();
      expect(svg.querySelectorAll("[fill], [stroke], [style]")).toHaveLength(0);
      for (const part of svg.querySelectorAll("[class]")) {
        expect(part.getAttribute("class")).toMatch(/^dp-[a-z]+$/u);
      }
    }
    // The stacked chart draws one marker picture per disk read: five, as a candidate and in place.
    const markers = container.querySelectorAll(
      ".ch-st-svg .ch-dp[data-size='marker']",
    );
    expect(markers).toHaveLength(10);
    const stacked = within(temps).getByRole("article", {
      name: "Along one scale, stacked",
    });
    const key = stacked.querySelector(".ch-st-key");
    expect(key?.textContent).toContain("Hard disk");
    expect(key?.textContent).toContain("NVMe SSD");
    expect(key?.querySelectorAll("svg.ch-dp")).toHaveLength(3);
  });

  it("groups the disks by kind on one scale, says which is asleep, and claims no slot", () => {
    const { container } = open("still=1&disks=24");
    const byKind = screen.getByRole("article", {
      name: "By kind, each with its level",
    });
    expect(
      within(byKind)
        .getAllByRole("heading", { level: 4 })
        .map((h) => h.textContent),
    ).toEqual(["Hard disks", "SSDs", "NVMe SSDs, on the mainboard"]);
    const hdd = within(byKind).getByRole("list", {
      name: "Hard disks, read at 10:31",
    });
    const tiles = within(hdd).getAllByRole("listitem");
    expect(tiles).toHaveLength(20);
    expect(tiles[0]?.textContent).toBe(nb("sda: 34 °C"));
    expect(
      tiles.find((t) => t.textContent.startsWith("sdi"))?.textContent,
    ).toBe("sdi: Asleep");
    // A sleeping disk has no level.
    expect(hdd.querySelector(".ch-kt[data-asleep] .ch-kt-level")).toBeNull();
    expect(
      tiles.find((t) => t.textContent.startsWith("sdt"))?.textContent,
    ).toBe(nb("sdt: 46 °C, at or over the alert limit"));
    const sticks = within(byKind).getByRole("list", {
      name: "NVMe SSDs, on the mainboard, read at 10:31",
    });
    expect(
      within(sticks)
        .getAllByRole("listitem")
        .map((t) => t.textContent),
    ).toEqual(["nvme0n1: 41 °C", "nvme1n1: 43 °C"].map(nb));
    // One scale and one limit for every group: each tile's limit is at the same height.
    const limits = [...byKind.querySelectorAll<HTMLElement>(".ch-kt-limit")];
    expect(limits).toHaveLength(24);
    expect(new Set(limits.map((l) => l.style.getPropertyValue("--y")))).toEqual(
      new Set(["0.8"]),
    );
    // The words say what is true: device order within a kind, and no slot reported.
    const caption = byKind.querySelector(".ch-caption")?.textContent ?? "";
    expect(caption).toContain("device order");
    expect(caption).toContain(
      "the NAS does not report which slot of the case a disk is in",
    );
    expect(byKind.textContent).toContain(
      "the NAS does not report which slot of the case a disk is in",
    );
    expect(container.textContent).not.toMatch(/bay order|where it sits/iu);
  });

  it("stacks the 24 disks' ties, counts a tall column and names it on focus", async () => {
    open("still=1&disks=24");
    const temps = tempsSubject();
    const list = within(temps).getAllByRole("list", {
      name: "Disk temperatures read at 10:31",
    })[0] as HTMLElement;
    expect(within(list).getAllByRole("listitem")).toHaveLength(11);
    expect(
      within(list).getByText(
        "35 °C: the hard disks sdb, sdc, sde, sdk and sdo.",
      ),
    ).toBeInTheDocument();
    expect(
      within(list).getByText(
        "46 °C: the hard disk sdt, at or over the alert limit.",
      ),
    ).toBeInTheDocument();
    const five = within(temps).getByRole("button", {
      name: /^5 disks at 35\s°C$/u,
    });
    act(() => {
      five.focus();
    });
    expect(
      await screen.findByText(
        "35 °C: sdb, sdc, sde, sdk and sdo",
        {},
        { timeout: 2000 },
      ),
    ).toBeInTheDocument();
    expect(
      within(temps).getAllByText(
        "sdt is at 46 °C, at or over the alert limit of 45 °C.",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      within(temps).getAllByText(/sdi and sdu are asleep/u).length,
    ).toBeGreaterThan(0);
  });

  it("switches between 6 and 24 disks from the lab and says so in the query", async () => {
    const user = userEvent.setup();
    open("still=1");
    await user.click(screen.getByRole("button", { name: "24 disks" }));
    expect(window.location.search).toContain("disks=24");
    expect(
      screen.getAllByRole("button", { name: /^5 disks at 35\s°C$/u }).length,
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "6 disks" }));
    expect(window.location.search).not.toContain("disks=");
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
    const { container } = open("still=1&disks=24");
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

  it("starts with no history: one reading as the page opens, on the minimum scales", async () => {
    const view = open("");
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getAllByText(/^One reading, at \d+:\d\d/u).length,
    ).toBeGreaterThan(0);
    const network = screen.getAllByRole("img", {
      name: /^Network in: no reading yet\./u,
    });
    expect(network.length).toBeGreaterThan(0);
    expect(network[0]?.getAttribute("aria-label")).toContain(
      nb("In is drawn on a scale to 1 MiB/s and out on a scale to 1 MiB/s."),
    );
    view.unmount();
  });
});
