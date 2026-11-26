// SPDX-License-Identifier: GPL-3.0-or-later
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import {
  baseNas,
  diskCriticalNas,
  laneFailedNas,
  loadingNas,
  newNas,
  withFirstStorage,
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
        name: /^sda, Hard disk 3\.6.TiB, Failing, 36.°C$/,
      }),
    ).toBeVisible();
  });

  it("names each disk with its state in words and opens it", () => {
    const { onOpen } = renderMap(baseNas());
    const sdb = screen.getByRole("button", { name: /^sdb, Hard disk/ });
    expect(sdb).toHaveAccessibleName(
      `sdb, Hard disk 3.6\u00a0TiB, OK, 35\u00a0°C`,
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

  it("lights a folder's row and the ways in it reaches, and dims the rest", () => {
    const onTraced = vi.fn();
    renderMap(baseNas(), { onTraced });
    const music = screen.getByRole("button", { name: /^Music:/ });
    fireEvent.pointerEnter(music);
    expect(onTraced).toHaveBeenCalled();
    expect(music).toHaveAttribute("data-trace", "lit");
    expect(rows()[0]).toHaveAttribute("data-trace", "lit");
    expect(rows()[1]).toHaveAttribute("data-trace", "dim");
    expect(
      screen.getByRole("button", { name: /^Linux and Unix \(NFS\)/ }),
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
    expect(screen.getByRole("button", { name: /^Archive:/ })).toHaveAttribute(
      "data-trace",
      "lit",
    );
    expect(screen.getByRole("button", { name: /^Photos:/ })).toHaveAttribute(
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
        name: "Windows and Mac (SMB): running, over enp2s0",
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

  it("writes no style attribute but its own custom properties", () => {
    const { container } = renderMap(baseNas());
    for (const el of container.querySelectorAll("[style]")) {
      const style = el.getAttribute("style") ?? "";
      expect(style).toMatch(/^(\s*--[a-z-]+:\s*[^;]+;?)+\s*$/);
    }
  });
});
