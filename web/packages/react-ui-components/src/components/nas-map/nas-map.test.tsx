// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import {
  baseNas,
  dashboardReadsNas,
  diskCriticalNas,
  laneFailedNas,
  loadingNas,
  newNas,
  poolDisksUnreadNas,
  withFirstStorage,
  withSdbWarning,
} from "../../fixtures/nas-fixtures";
import { NAS_MAP_WORDS } from "../../fixtures/nas-words";
import { NasMap, type NasMapProps } from "./nas-map";
import { nasMapView, type NasMapInput } from "./nas-map-model";

function renderMap(input: NasMapInput, props: Partial<NasMapProps> = {}) {
  const onOpen = vi.fn();
  const view = nasMapView(input);
  const result = render(
    <NasMap
      view={view}
      words={NAS_MAP_WORDS}
      meter={(s) => <span data-testid="meter">{s.name}</span>}
      onOpen={onOpen}
      {...props}
    />,
  );
  return { ...result, onOpen };
}

const rows = () =>
  within(screen.getByRole("list", { name: "Your storage, a row each" }))
    .getAllByRole("listitem")
    .filter((li) => li.dataset.slot === "nas-map-row");

describe("NasMap", () => {
  it("draws a row per storage, named for assistive technology, the system drive last and unused disks at the end", () => {
    renderMap(baseNas());
    expect(
      rows().map((r) => r.getAttribute("aria-label")?.split(":")[0]),
    ).toEqual([
      "Data drive, on disk sda",
      "Backup, on disks sdb and sdc",
      "tank, on disk sdd",
      "System drive, on disk nvme0n1",
      "Not in use",
    ]);
    expect(rows()[0]).toHaveAccessibleName(
      "Data drive, on disk sda: 62 percent used. Shared folders: Photos, Music and Documents.",
    );
  });

  it("puts each storage's meter, the page's own, in its row", () => {
    renderMap(baseNas());
    expect(screen.getAllByTestId("meter").map((m) => m.textContent)).toEqual([
      "Data drive",
      "Backup",
      "tank",
      "System drive",
    ]);
  });

  it("lets a disk's problem flow along its row: its icon, the connectors' tone and At risk", () => {
    const { container } = renderMap(diskCriticalNas());
    const row = rows()[0];
    expect(row).toHaveAttribute("data-tone", "critical");
    expect(within(row as HTMLElement).getByText("At risk")).toBeVisible();
    expect(
      row?.querySelectorAll('[data-part="wire"][data-tone="critical"]'),
    ).toHaveLength(2);
    // Nothing on the other rows changes.
    expect(
      container.querySelectorAll(
        '[data-tone="critical"][data-slot="nas-map-row"]',
      ),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", {
        name: /^sda, Failing, 36.°C, Hard disk 3\.6.TiB$/,
      }),
    ).toBeVisible();
  });

  it("names each disk with its state in words and opens it", () => {
    const { onOpen } = renderMap(baseNas());
    const sdb = screen.getByRole("button", { name: /^sdb, .*Hard disk/ });
    expect(sdb).toHaveAccessibleName(
      `sdb, 35\u00a0°C, OK, Hard disk 3.6\u00a0TiB`,
    );
    fireEvent.click(sdb);
    expect(onOpen).toHaveBeenCalledWith({
      kind: "disk",
      rowId: "row:backup",
      id: "sdb",
    });
  });

  it("is one tab stop on the rows, moved by the arrow keys", () => {
    renderMap(baseNas());
    const first = screen.getByRole("button", { name: /^sda,/ });
    expect(first).toHaveAttribute("tabindex", "0");
    const storage = screen.getByRole("button", { name: /^Data drive/ });
    expect(storage).toHaveAttribute("tabindex", "-1");
    act(() => {
      first.focus();
    });
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(storage).toHaveFocus();
    expect(storage).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(storage, { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: /^Backup/ })).toHaveFocus();
  });

  it("names each control with the words it shows first, in their order (WCAG 2.5.3)", () => {
    // What a person sees and what voice control matches: commas and colons do not count.
    const words = (s: string) =>
      s.toLowerCase().replace(/[,:]/g, " ").replace(/\s+/g, " ").trim();
    for (const input of [baseNas(), diskCriticalNas(), dashboardReadsNas()]) {
      const { unmount, container } = renderMap(input);
      const named = [
        ...container.querySelectorAll<HTMLElement>("button[aria-label]"),
      ];
      expect(named.length).toBeGreaterThan(5);
      for (const el of named) {
        const shown = words(el.textContent);
        expect(words(el.getAttribute("aria-label") ?? "")).toContain(shown);
      }
      unmount();
    }
  });

  it("reads each heading of the band just before its own list", () => {
    renderMap(baseNas());
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const waysHead = screen.getByRole("heading", { name: "Ways in" });
    const ways = screen.getByRole("list", { name: "Ways in" });
    const netHead = screen.getByRole("heading", { name: "Network" });
    const net = screen.getByRole("list", { name: "Network" });
    expect(before(waysHead, ways)).toBe(true);
    expect(before(ways, netHead)).toBe(true);
    expect(before(netHead, net)).toBe(true);
  });

  it("keeps an interface's name apart from its speed and address", () => {
    renderMap(baseNas());
    expect(
      screen.getByRole("button", { name: /^enp2s0 1\sGbit\/s, / }),
    ).toBeInTheDocument();
  });

  it("lights a folder's row and the ways in it reaches, and dims the rest", () => {
    const onTraced = vi.fn();
    renderMap(baseNas(), { onTraced });
    const music = screen.getByRole("button", { name: /^Music,/ });
    fireEvent.pointerEnter(music);
    expect(onTraced).toHaveBeenCalled();
    expect(music).toHaveAttribute("data-trace", "lit");
    expect(rows()[0]).toHaveAttribute("data-trace", "lit");
    expect(rows()[1]).toHaveAttribute("data-trace", "dim");
    expect(
      screen.getByRole("button", { name: /^Linux and Unix, NFS/ }),
    ).toHaveAttribute("data-trace", "lit");
    expect(
      screen.getByRole("button", { name: /^Remote sign-in/ }),
    ).toHaveAttribute("data-trace", "dim");
    fireEvent.pointerLeave(music);
    expect(rows()[0]).not.toHaveAttribute("data-trace");
  });

  it("lights every folder a way in reaches when it is focused", () => {
    renderMap(baseNas());
    act(() => {
      screen.getByRole("button", { name: /^Linux and Unix/ }).focus();
    });
    expect(screen.getByRole("button", { name: /^Archive,/ })).toHaveAttribute(
      "data-trace",
      "lit",
    );
    expect(screen.getByRole("button", { name: /^Photos,/ })).toHaveAttribute(
      "data-trace",
      "dim",
    );
  });

  it("lists the ways in that are on with their state, says running once, and the rest in one line", () => {
    renderMap(baseNas());
    expect(screen.getByText("All running")).toBeVisible();
    expect(screen.queryByText("Running")).toBeNull();
    expect(screen.getByText("Off: Copies to other NAS")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Windows and Mac, SMB: running, over enp2s0",
      }),
    ).toBeVisible();
  });

  it("shows a failed read's message as text in place, and reads it again", () => {
    const onRetry = vi.fn();
    renderMap(laneFailedNas(), {
      errors: { disks: "<b>The request timed out</b>" },
      onRetry,
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not read the disks");
    expect(
      within(alert).getByText("<b>The request timed out</b>"),
    ).toBeVisible();
    expect(alert.querySelector("b")).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledWith("disks");
    // The rows stand; the unused disks are not claimed while the disks are unread.
    expect(screen.getAllByText("Disks: not read").length).toBeGreaterThan(0);
    expect(rows().some((r) => r.dataset.kind === "unused")).toBe(false);
  });

  it("stands still while the first read is in flight", () => {
    renderMap(loadingNas());
    expect(screen.getByRole("region", { name: "Your NAS" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.queryByText("All running")).toBeNull();
  });

  it("gives a new NAS its unused disks, said once, an example hidden from assistive technology, and the captions", () => {
    const { container } = renderMap(newNas(), {
      captions: ["disks", "storage", "folders", "ways", "network"],
      example: true,
      addStorage: <button type="button">Add storage</button>,
    });
    expect(
      screen.getByText("Not checked yet: sda, sdb, sdc, sdd and sde"),
    ).toBeVisible();
    expect(
      screen.getByText("Disks sda, sdb, sdc, sdd and sde are not in use yet."),
    ).toBeVisible();
    const add = screen.getByRole("button", { name: "Add storage" });
    expect(add).toHaveAttribute("data-key", "add-storage");
    const example = container.querySelector('[data-kind="example"]');
    expect(example).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.getByText("The drives the NAS found inside it."),
    ).toBeInTheDocument();
  });

  it("draws a row that appears later as a ghost becoming real", () => {
    const words = NAS_MAP_WORDS;
    function Grow() {
      const [input, setInput] = React.useState(newNas);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setInput(withFirstStorage(input));
            }}
          >
            Add
          </button>
          <NasMap
            view={nasMapView(input)}
            words={words}
            meter={() => null}
            onOpen={() => undefined}
          />
        </>
      );
    }
    const { container } = render(<Grow />);
    expect(container.querySelector("[data-fresh]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(
      container.querySelector('[data-fresh][data-kind="storage"]'),
    ).toHaveAttribute("aria-label", expect.stringMatching(/^Data drive/));
  });

  it("assembles on a first visit only, and says it has been seen", () => {
    const onSeen = vi.fn();
    const { container, unmount } = renderMap(baseNas(), {
      seen: false,
      onSeen,
    });
    expect(container.querySelector('[data-slot="nas-map"]')).toHaveAttribute(
      "data-assemble",
      "full",
    );
    expect(onSeen).toHaveBeenCalledTimes(1);
    unmount();
    const later = renderMap(baseNas(), { seen: true });
    expect(
      later.container.querySelector('[data-slot="nas-map"]'),
    ).not.toHaveAttribute("data-assemble");
  });

  it("draws a row's connectors again when a problem arrives on it", () => {
    const { container } = renderMap(diskCriticalNas(), {
      arrival: { id: "sda", n: 1 },
    });
    expect(container.querySelector("[data-arrival]")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/^Data drive/),
    );
  });

  it("says where an array's disks are in their place, with no connector to nothing", () => {
    renderMap(dashboardReadsNas());
    const backup = rows().find((r) =>
      r.getAttribute("aria-label")?.startsWith("Backup"),
    );
    expect(backup).toHaveAccessibleName(
      "Backup: 41 percent used. Shared folders: Time Machine and a4share. Its disks are listed on the RAID page.",
    );
    const cell = within(backup as HTMLElement);
    expect(
      cell.getByText("Its disks are listed on the RAID page."),
    ).toBeVisible();
    expect(cell.queryByText("Disks: none")).toBeNull();
    // Only the connector to its folders is drawn.
    expect(
      [...(backup?.querySelectorAll('[data-part="wire"]') ?? [])].map((w) =>
        w.getAttribute("data-place"),
      ),
    ).toEqual(["folders"]);
  });

  it("draws the RAID members on a row of their own, before the unused disks", () => {
    renderMap(dashboardReadsNas());
    const labels = rows().map((r) => r.getAttribute("aria-label"));
    expect(labels.slice(-2)).toEqual([
      "In a RAID array: disks sdb and sdc. The RAID page shows the array.",
      "Not in use: disk sde. Add storage to keep files on it.",
    ]);
    const raid = rows().at(-2) as HTMLElement;
    expect(raid).toHaveAttribute("data-kind", "raid");
    expect(
      within(raid).getByText(
        "Disks sdb and sdc are part of a RAID array, shown on the RAID page.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/sdb.*not in use/u)).toBeNull();
  });

  it("shows a RAID member's warning in place and moves its row up", () => {
    const { onOpen } = renderMap(withSdbWarning(dashboardReadsNas()));
    const raid = rows()[0] as HTMLElement;
    expect(raid).toHaveAttribute("data-kind", "raid");
    expect(raid).toHaveAttribute("data-tone", "warning");
    expect(raid.querySelector('[data-part="wire"]')).toHaveAttribute(
      "data-tone",
      "warning",
    );
    expect(raid).toHaveAccessibleName(
      "In a RAID array: disks sdb and sdc, disk sdb warning. The RAID page shows the array.",
    );
    const sdb = within(raid).getByRole("button", { name: /^sdb, .*Hard disk/ });
    expect(within(raid).getByText("Warning")).toBeVisible();
    fireEvent.click(sdb);
    expect(onOpen).toHaveBeenCalledWith({
      kind: "disk",
      rowId: "row:raid",
      id: "sdb",
    });
  });

  it("moves into the RAID row with the arrow keys", () => {
    renderMap(dashboardReadsNas());
    const system = screen.getByRole("button", { name: /^System drive/ });
    act(() => {
      system.focus();
    });
    fireEvent.keyDown(system, { key: "ArrowDown" });
    expect(
      screen.getByRole("button", { name: /^sdb, .*Hard disk/ }),
    ).toHaveFocus();
  });

  it("says a pool's disks could not be read, and calls no disk unused", () => {
    renderMap(poolDisksUnreadNas(), {
      addStorage: <button type="button">Add storage</button>,
    });
    expect(
      screen.getByText("Which disks it is on could not be read."),
    ).toBeVisible();
    expect(rows().some((r) => r.dataset.kind === "unused")).toBe(false);
    expect(screen.queryByRole("button", { name: "Add storage" })).toBeNull();
  });

  it("writes no style attribute but its own custom properties", () => {
    const { container } = renderMap(baseNas());
    for (const el of container.querySelectorAll("[style]")) {
      const declarations = (el.getAttribute("style") ?? "")
        .split(";")
        .map((d) => d.trim())
        .filter((d) => d !== "");
      expect(declarations.length).toBeGreaterThan(0);
      for (const declaration of declarations) {
        expect(declaration).toMatch(/^--[a-z-]+:/u);
      }
    }
  });
});
