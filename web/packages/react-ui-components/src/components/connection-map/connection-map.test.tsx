// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubLayout } from "../../test/layout";
import { ConnectionMap, type ConnectionMapColumn } from "./connection-map";

const opened = vi.fn();
const COLUMNS: ConnectionMapColumn[] = [
  {
    id: "disks",
    title: "Disks",
    nodes: [
      { id: "sda", label: "sda", detail: "3.6 TiB", feeds: ["data"] },
      {
        id: "sdb",
        label: "sdb",
        detail: "3.6 TiB · 47 °C",
        status: "warning",
        statusLabel: "Warning",
        feeds: ["data"],
      },
      { id: "sdc", label: "sdc", feeds: ["backup"] },
    ],
  },
  {
    id: "fs",
    title: "File systems",
    nodes: [
      { id: "data", label: "data", feeds: ["photos", "music"] },
      { id: "backup", label: "backup", feeds: [] },
    ],
  },
  {
    id: "folders",
    title: "Shared folders",
    nodes: [
      { id: "photos", label: "Photos", onSelect: opened },
      { id: "music", label: "Music" },
    ],
  },
];

const map = () => (
  <ConnectionMap
    aria-label="How storage is shared"
    columns={COLUMNS}
    feedsLabel={(names) => `Feeds ${names.join(", ")}`}
    keyboardHint="Use the arrow keys to move between items."
  />
);

const node = (id: string) =>
  document.querySelector<HTMLElement>(`[data-node-id="${id}"]`) as HTMLElement;

beforeEach(() => {
  // Phone width: the lines are dropped and each node says what it feeds.
  stubLayout(390, 600);
});
afterEach(() => {
  vi.unstubAllGlobals();
  opened.mockReset();
});

describe("ConnectionMap", () => {
  it("is a list of columns with the full text: state and what each node feeds", () => {
    render(map());
    const group = screen.getByRole("group", { name: "How storage is shared" });
    expect(group).toHaveAccessibleDescription(
      "Use the arrow keys to move between items.",
    );
    const disks = screen.getByRole("list", { name: "Disks" });
    expect(within(disks).getAllByRole("listitem")).toHaveLength(3);
    expect(node("sdb")).toHaveTextContent("Warning");
    expect(node("data")).toHaveTextContent("Feeds Photos, Music");
  });

  it("makes only the nodes that act look and behave clickable", async () => {
    const user = userEvent.setup();
    render(map());
    const photos = screen.getByRole("button", { name: /Photos/ });
    expect(photos.querySelector("svg.lucide-chevron-right")).not.toBeNull();
    await user.click(photos);
    expect(opened).toHaveBeenCalledTimes(1);
    // A plain node is not a button and has no chevron.
    expect(node("music").tagName).toBe("DIV");
    expect(node("music").querySelector("svg.lucide-chevron-right")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("traces a lineage by keyboard and dims the rest", async () => {
    const user = userEvent.setup();
    render(map());
    // One tab stop into the map.
    await user.tab();
    expect(node("sda")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(node("sdb")).toHaveFocus();
    // sdb feeds data, which holds Photos and Music.
    for (const id of ["sdb", "data", "photos", "music"]) {
      expect(node(id)).toHaveAttribute("data-trace", "lit");
    }
    for (const id of ["sda", "sdc", "backup"]) {
      expect(node(id)).toHaveAttribute("data-trace", "dim");
    }
    await user.keyboard("{ArrowRight}");
    expect(node("backup")).toHaveFocus();
    expect(node("sdc")).toHaveAttribute("data-trace", "lit");
    expect(node("sdb")).toHaveAttribute("data-trace", "dim");
    // Only the focused node is in the tab order.
    expect(node("backup")).toHaveAttribute("tabindex", "0");
    expect(node("sda")).toHaveAttribute("tabindex", "-1");
    await user.tab();
    expect(document.body).toHaveFocus();
    for (const id of ["sda", "backup"]) {
      expect(node(id)).not.toHaveAttribute("data-trace");
    }
  });

  it("renders a name that looks like markup as text", () => {
    render(
      <ConnectionMap
        aria-label="Map"
        feedsLabel={(n) => n.join(", ")}
        columns={[
          {
            id: "c",
            title: "Folders",
            nodes: [{ id: "x", label: "<img src=x onerror=alert(1)>" }],
          },
        ]}
      />,
    );
    expect(node("x")).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(document.querySelector("img")).toBeNull();
  });
});
