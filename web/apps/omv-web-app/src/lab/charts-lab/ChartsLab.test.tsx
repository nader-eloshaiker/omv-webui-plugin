// SPDX-License-Identifier: GPL-3.0-or-later
// The chart lab as the owner meets it: each subject with its chosen chart, the meters carrying their
// values, the live charts' text alternatives and their per-half scales, the drive pictures by kind,
// the temperatures grouped by array, pool and kind at 6 and 24 disks with captions that claim no
// slot, the dashboard's disclosure that never hides a disk over the limit, every bar filled with no
// outline, nothing of the generated look, and still=1 the same on every render. Lab
// fixtures only; nothing here reaches the network.
/// <reference types="node" />
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import ChartsLab from "./ChartsLab.tsx";

/** The lab's stylesheet as text: Vitest hands a CSS import over empty, so it is read from disk. */
const chartsCss = readFileSync(`${import.meta.dirname}/charts.css`, "utf8");

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
      "One row of segments",
      "Two charts, four series",
      "Drive pictures",
      "By kind, with each array and pool as a group",
    ]);
    for (const article of candidates) {
      const caption = article.querySelector(".ch-caption")?.textContent ?? "";
      expect(caption).toMatch(/^[A-Z].+\.$/u);
    }
    const notChosen = screen.getByRole("region", { name: "Not chosen" });
    expect(within(notChosen).getAllByRole("definition")).toHaveLength(7);
    for (const line of within(notChosen).getAllByRole("definition")) {
      expect(line.textContent).toMatch(/^[A-Z].+\.$/u);
    }
  });

  it("exposes every segment bar as a meter with its value, range and name", () => {
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
    // The page writes the mark's value above its rule.
    expect(screen.getByText("Warning at 85 %")).toBeInTheDocument();
  });

  it("gives the used segments past the mark the warning fill only where the drive is almost full", () => {
    const { container } = open("still=1");
    const overSegments = container.querySelectorAll(
      "[data-slot=segment-bar] [data-over] [data-part=used]",
    );
    // Media is at 91 % past its mark of 85 % in the map row and in the table: in each, the 18th
    // segment and a fifth of the 19th.
    expect(overSegments).toHaveLength(4);
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

  it("groups the six disks as the dashboard has them, and says which is asleep", () => {
    open("still=1");
    const byKind = screen.getByRole("article", {
      name: "By kind, with each array and pool as a group",
    });
    expect(
      within(byKind)
        .getAllByRole("heading", { level: 4 })
        .map((h) => h.textContent),
    ).toEqual([
      "Backup, Mirror (RAID 1)",
      "tank, ZFS pool (single disk)",
      "Hard disks",
      "SSDs",
      "NVMe SSDs, on the mainboard",
    ]);
    const backup = within(byKind).getByRole("list", {
      name: "Backup, Mirror (RAID 1), read at 10:31",
    });
    expect(
      within(backup)
        .getAllByRole("listitem")
        .map((t) => t.textContent),
    ).toEqual(["sdb: 35 °C", "sdc: 37 °C"].map(nb));
    const tank = within(byKind).getByRole("list", {
      name: "tank, ZFS pool (single disk), read at 10:31",
    });
    expect(within(tank).getByRole("listitem").textContent).toBe("sdd: Asleep");
    // A sleeping disk has no level, and its bar has no track (charts.css, data-unread).
    expect(tank.querySelector(".ch-kt-level")).toBeNull();
    expect(tank.querySelector(".ch-kt[data-unread]")).not.toBeNull();
    // The candidate, the dashboard and the Disks page say it once each.
    expect(
      screen.getAllByText(/sdd is asleep, so its temperature was not read/u),
    ).toHaveLength(3);
  });

  it("draws each disk as its kind, decoratively, and names the kinds in the sheet", () => {
    const { container } = open("still=1");
    const temps = tempsSubject();
    const sheet = within(temps).getByRole("article", {
      name: "Drive pictures",
    });
    for (const name of ["Hard disk", "SSD", "NVMe SSD"]) {
      expect(within(sheet).getByText(name)).toBeInTheDocument();
    }
    const sheetPictures = sheet.querySelectorAll(
      "svg[data-slot=drive-picture]",
    );
    expect(sheetPictures).toHaveLength(9);
    for (const kind of ["hdd", "ssd", "nvme"]) {
      for (const size of ["marker", "tile", "large"]) {
        expect(
          sheet.querySelector(`svg[data-kind="${kind}"][data-size="${size}"]`),
        ).not.toBeNull();
      }
    }
    // Every picture is the library's, decorative, and its inks come from classes alone: no colour
    // is written into the drawing.
    for (const svg of container.querySelectorAll(
      "svg[data-slot=drive-picture]",
    )) {
      expect(svg.closest("[aria-hidden='true']")).not.toBeNull();
      expect(svg.querySelectorAll("[fill], [stroke], [style]")).toHaveLength(0);
      for (const part of svg.querySelectorAll("[class]")) {
        expect(part.getAttribute("data-part")).toMatch(/^[a-z]+$/u);
      }
    }
  });

  it("groups the 24 disks by array, pool and kind on one scale, and claims no slot", () => {
    const { container } = open("still=1&disks=24");
    const byKind = screen.getByRole("article", {
      name: "By kind, with each array and pool as a group",
    });
    expect(
      within(byKind)
        .getAllByRole("heading", { level: 4 })
        .map((h) => h.textContent),
    ).toEqual([
      "Backup, Mirror (RAID 1)",
      "Apps, Mirror (RAID 1)",
      "Archive, Double parity (RAID 6)",
      "tank, ZFS pool (mirror)",
      "Hard disks",
      "SSDs",
    ]);
    // Every disk once.
    const tiles = within(byKind).getAllByRole("listitem");
    expect(tiles).toHaveLength(24);
    const devices = tiles.map((t) => t.textContent.split(":")[0]);
    expect(new Set(devices).size).toBe(24);
    // The NVMe sticks stay in their array, drawn lying down.
    const apps = within(byKind).getByRole("list", {
      name: "Apps, Mirror (RAID 1), read at 10:31",
    });
    expect(
      within(apps)
        .getAllByRole("listitem")
        .map((t) => t.textContent),
    ).toEqual(["nvme0n1: 41 °C", "nvme1n1: 43 °C"].map(nb));
    expect(apps.querySelectorAll(".ch-kt[data-kind='nvme']")).toHaveLength(2);
    expect(
      within(byKind).queryByText(/NVMe SSDs, on the mainboard/u),
    ).toBeNull();
    // The rebuilding array says so in words, with its status icon.
    const archive = within(byKind)
      .getByRole("heading", { name: "Archive, Double parity (RAID 6)" })
      .closest("section");
    expect(
      archive?.querySelector("[data-slot='status-pill'][data-status='warning']")
        ?.textContent,
    ).toBe("Rebuilding");
    const hdd = within(byKind).getByRole("list", {
      name: "Hard disks, read at 10:31",
    });
    const hddTiles = within(hdd).getAllByRole("listitem");
    expect(hddTiles.map((t) => t.textContent.split(":")[0])).toEqual([
      "sda",
      "sdi",
      "sdo",
      "sdp",
      "sdr",
      "sds",
      "sdt",
      "sdu",
    ]);
    expect(hddTiles[1]?.textContent).toBe("sdi: Asleep");
    expect(hddTiles[6]?.textContent).toBe(
      nb("sdt: 46 °C, at or over the alert limit"),
    );
    // One scale and one limit for every group: each tile's limit is at the same height.
    const limits = [...byKind.querySelectorAll<HTMLElement>(".ch-kt-limit")];
    expect(limits).toHaveLength(24);
    expect(new Set(limits.map((l) => l.style.getPropertyValue("--y")))).toEqual(
      new Set(["0.8"]),
    );
    // The words say what is true: device order within a group, and no slot reported.
    const caption = byKind.querySelector(".ch-caption")?.textContent ?? "";
    expect(caption).toContain("device order");
    expect(caption).toContain(
      "the NAS does not report which slot of the case a disk is in",
    );
    expect(container.textContent).not.toMatch(/bay order|where it sits/iu);
  });

  it("on the dashboard, shows the 24 disks' group over the limit and opens the rest on request", async () => {
    const user = userEvent.setup();
    open("still=1&disks=24");
    const inPlace = screen.getByRole("region", { name: "In place" });
    const dash = within(inPlace).getByRole("region", {
      name: "Disk temperatures",
    });
    // The group with sdt, over the limit, is shown whole; sdt is never behind the disclosure.
    const hdd = within(dash).getByRole("list", {
      name: "Hard disks, read at 10:31",
    });
    const sdt = within(hdd)
      .getAllByRole("listitem")
      .find((t) => t.textContent.startsWith("sdt"));
    expect(sdt).toBeVisible();
    expect(within(dash).getAllByRole("listitem")).toHaveLength(8);
    expect(
      within(dash).getByText(
        "The other 16 disks are between 31 °C and 43 °C, under the alert limit of 45 °C.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dash).queryByRole("list", {
        name: "Backup, Mirror (RAID 1), read at 10:31",
      }),
    ).toBeNull();
    const more = within(dash).getByRole("button", {
      name: "Show the other 16 disks",
    });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(
      within(dash).getByRole("list", {
        name: "Backup, Mirror (RAID 1), read at 10:31",
      }),
    ).toBeInTheDocument();
    expect(within(dash).getAllByRole("listitem")).toHaveLength(24);
    // The Disks page shows every disk, with no disclosure.
    const page = within(inPlace).getByRole("region", { name: "Temperatures" });
    expect(within(page).getAllByRole("listitem")).toHaveLength(24);
    expect(within(page).queryByRole("button")).toBeNull();
  });

  it("on the dashboard, shows all six disks with no disclosure", () => {
    open("still=1");
    const inPlace = screen.getByRole("region", { name: "In place" });
    const dash = within(inPlace).getByRole("region", {
      name: "Disk temperatures",
    });
    expect(within(dash).getAllByRole("listitem")).toHaveLength(6);
    expect(within(dash).queryByRole("button")).toBeNull();
  });

  it("draws every bar and the segment bar filled, with no outline", () => {
    const { container } = open("still=1&disks=24");
    // The stylesheet: the temperature track and level are fills, and none has a border, an
    // outline, a shadow or a stroke; the empty part is the one --ch-empty. The segment bar is the
    // library's, tested there (segment-bar.test.tsx) and below in the markup.
    const rules = [...chartsCss.matchAll(/([^{}]+)\{([^}]*)\}/gu)];
    const amounts = rules.filter(([, selector]) =>
      /\.ch-kt-bar|\.ch-kt-level/u.test(selector ?? ""),
    );
    expect(amounts.length).toBeGreaterThan(4);
    for (const [, selector, body] of amounts) {
      expect(selector).not.toMatch(/::?(after|before)/u);
      // No property that draws round it (a token's name may say "stroke"; a property may not).
      expect(body).not.toMatch(
        /(^|[;{\s])(border(?!-radius)[\w-]*|outline[\w-]*|box-shadow|stroke[\w-]*)\s*:/u,
      );
    }
    expect(chartsCss).toMatch(
      /\.ch-kt-bar \{[^}]*background: var\(--ch-empty\)/u,
    );
    // The empty part is the system's slate token, in both themes.
    expect(chartsCss).toMatch(/--ch-empty: var\(--theme-usage-empty\);/u);
    expect(chartsCss).not.toMatch(/dashed var\(--theme-usage-track-edge\)/u);
    // The markup: no stroke on a segment, no element drawn round a bar.
    const segments = container.querySelectorAll(
      "[data-slot=segment-bar] [data-part=empty], [data-slot=segment-bar] [data-part=used]",
    );
    expect(segments.length).toBeGreaterThan(100);
    for (const segment of segments) {
      expect(segment.getAttribute("stroke")).toBeNull();
    }
    for (const empty of container.querySelectorAll(
      "[data-slot=segment-bar] [data-part=empty]",
    )) {
      expect(empty.getAttribute("class")).toBe("fill-usage-empty");
    }
    for (const bar of container.querySelectorAll(".ch-kt-bar")) {
      expect(
        [...bar.children].every((c) => c.classList.contains("ch-kt-level")),
      ).toBe(true);
    }
    // The empty segments have no switch.
    expect(container.querySelector("[data-empty]")).toBeNull();
    expect(screen.queryByText("Empty squares")).toBeNull();
  });

  it("switches between 6 and 24 disks from the lab and says so in the query", async () => {
    const user = userEvent.setup();
    open("still=1");
    await user.click(screen.getByRole("button", { name: "24 disks" }));
    expect(window.location.search).toContain("disks=24");
    expect(
      screen.getAllByRole("heading", {
        name: "Archive, Double parity (RAID 6)",
      }).length,
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
