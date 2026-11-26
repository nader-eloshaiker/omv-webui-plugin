// SPDX-License-Identifier: GPL-3.0-or-later
// The temperatures as a page meets them: each group headed by the caller's words with its disks as a
// list; a sleeping disk with no bar; one scale and one limit for every tile; the warning only on a disk
// over the limit, with its sentence; on the dashboard, past eight disks, the group over the limit
// shown and the rest opened on request, a disk over the limit never behind it; every level filled with
// no outline; and none of the generated look.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  dashboardTemperatureGroups,
  DISKS_24,
  DISKS_6,
  REST_LABELS,
  temperatureGroups,
  temperatureLabels,
  VOLUMES_24,
  VOLUMES_6,
  withTemperature,
} from "../../fixtures/chart-fixtures";
import { DiskTemperatures } from "./disk-temperatures";

const labels = temperatureLabels("10:31");
const nb = (words: string) => words.replace(/(\d) (?=[%A-Za-z°])/gu, "$1 ");

describe("DiskTemperatures", () => {
  it("groups the six disks as the dashboard has them, and says which is asleep", () => {
    render(
      <DiskTemperatures
        groups={temperatureGroups(DISKS_6, VOLUMES_6)}
        labels={labels}
      />,
    );
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      "Backup, Mirror (RAID 1)",
      "tank, ZFS pool (single disk)",
      "Hard disks",
      "SSDs",
      "NVMe SSDs, on the mainboard",
    ]);
    const backup = screen.getByRole("list", {
      name: "Backup, Mirror (RAID 1), read at 10:31",
    });
    expect(
      within(backup)
        .getAllByRole("listitem")
        .map((t) => t.textContent),
    ).toEqual(["sdb: 35 °C", "sdc: 37 °C"].map(nb));
    const tank = screen.getByRole("list", {
      name: "tank, ZFS pool (single disk), read at 10:31",
    });
    expect(within(tank).getByRole("listitem").textContent).toBe("sdd: Asleep");
    // A sleeping disk has no level, and its bar has no track.
    expect(tank.querySelector("[data-part=level]")).toBeNull();
    expect(tank.querySelector("[data-part=track]")?.className).toContain(
      "bg-transparent",
    );
    expect(
      screen.getByText(/^sdd is asleep, so its temperature was not read/u),
    ).toBeInTheDocument();
  });

  it("puts the 24 disks on one scale with one limit, and shows a rebuild in words", () => {
    const { container } = render(
      <DiskTemperatures
        groups={temperatureGroups(DISKS_24, VOLUMES_24)}
        labels={labels}
      />,
    );
    const tiles = screen.getAllByRole("listitem");
    expect(tiles).toHaveLength(24);
    expect(new Set(tiles.map((t) => t.textContent.split(":")[0])).size).toBe(
      24,
    );
    const limits = [...container.querySelectorAll("[data-part=limit]")];
    expect(limits).toHaveLength(24);
    expect(new Set(limits.map((l) => l.getAttribute("data-at")))).toEqual(
      new Set(["0.8"]),
    );
    const archive = screen
      .getByRole("heading", { name: "Archive, Double parity (RAID 6)" })
      .closest("section");
    expect(
      archive?.querySelector("[data-slot='status-pill'][data-status='warning']")
        ?.textContent,
    ).toBe("Rebuilding");
    const apps = screen.getByRole("list", {
      name: "Apps, Mirror (RAID 1), read at 10:31",
    });
    expect(apps.querySelectorAll("li[data-kind=nvme]")).toHaveLength(2);
  });

  it("gives only a disk over the limit the warning, with its words", () => {
    const { container } = render(
      <DiskTemperatures
        groups={temperatureGroups(
          withTemperature(DISKS_6, "sda", "47"),
          VOLUMES_6,
        )}
        labels={labels}
      />,
    );
    const over = container.querySelectorAll("[data-state=over]");
    expect(over).toHaveLength(1);
    expect(over[0]?.textContent).toBe(
      nb("sda: 47 °C, at or over the alert limit"),
    );
    expect(container.querySelectorAll(".bg-warning-stroke")).toHaveLength(1);
    expect(
      screen.getByText("sda is at 47 °C, at or over the alert limit of 45 °C."),
    ).toBeInTheDocument();
  });

  it("on the dashboard, shows the 24 disks' group over the limit and opens the rest on request", async () => {
    const user = userEvent.setup();
    render(
      <DiskTemperatures
        groups={temperatureGroups(DISKS_24, VOLUMES_24)}
        labels={labels}
        mode="dashboard"
        restLabels={REST_LABELS}
      />,
    );
    const hdd = screen.getByRole("list", { name: "Hard disks, read at 10:31" });
    const sdt = within(hdd)
      .getAllByRole("listitem")
      .find((t) => t.textContent.startsWith("sdt"));
    expect(sdt).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(
      screen.getByText(
        "The other 16 disks are between 31 °C and 43 °C, under the alert limit of 45 °C.",
      ),
    ).toBeInTheDocument();
    const more = screen.getByRole("button", {
      name: "Show the other 16 disks",
    });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("list", {
        name: "Backup, Mirror (RAID 1), read at 10:31",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(24);
  });

  it("on the dashboard, never hides a disk over the limit, wherever it is", () => {
    for (const hot of DISKS_24) {
      const device = hot.row.devicename;
      const { unmount } = render(
        <DiskTemperatures
          groups={temperatureGroups(
            withTemperature(DISKS_24, device, "47"),
            VOLUMES_24,
          )}
          labels={labels}
          mode="dashboard"
          restLabels={REST_LABELS}
        />,
      );
      // Only what is visible: the closed panel's groups are hidden from the accessibility tree.
      const visible = screen
        .getAllByRole("listitem")
        .map((t) => t.textContent.split(":")[0]);
      expect(visible).toContain(device);
      expect(visible).toContain("sdt");
      unmount();
    }
  });

  it("on the dashboard, shows six disks with no disclosure", () => {
    render(
      <DiskTemperatures
        groups={temperatureGroups(DISKS_6, VOLUMES_6)}
        labels={labels}
        mode="dashboard"
        restLabels={REST_LABELS}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("with none over the limit on the dashboard, puts every disk behind one disclosure", () => {
    render(
      <DiskTemperatures
        groups={temperatureGroups(
          withTemperature(DISKS_24, "sdt", "37"),
          VOLUMES_24,
        )}
        labels={labels}
        mode="dashboard"
        restLabels={REST_LABELS}
      />,
    );
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(
      screen.getByText(
        "22 of the 24 disks are between 31 °C and 43 °C, under the alert limit of 45 °C.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show all 24 disks" }),
    ).toBeInTheDocument();
  });

  it("fills every level and track, and outlines none", () => {
    const { container } = render(
      <DiskTemperatures
        groups={temperatureGroups(
          withTemperature(DISKS_24, "sda", "47"),
          VOLUMES_24,
        )}
        labels={labels}
      />,
    );
    const parts = container.querySelectorAll(
      "[data-part=track], [data-part=level]",
    );
    expect(parts.length).toBeGreaterThan(40);
    for (const part of parts) {
      for (const utility of part.className.split(/\s+/u)) {
        expect(utility).not.toMatch(/^(border|outline|ring|shadow|stroke)/u);
      }
      expect(part.className).not.toMatch(/(before|after):/u);
    }
    for (const track of container.querySelectorAll("[data-part=track]")) {
      expect(
        [...track.children].every(
          (c) => c.getAttribute("data-part") === "level",
        ),
      ).toBe(true);
    }
    // The empty part is the one usage-empty slate, the level the usage blue.
    expect(
      container.querySelectorAll("[data-part=track].bg-usage-empty").length,
    ).toBeGreaterThan(20);
    expect(
      container.querySelectorAll("[data-part=level].bg-usage"),
    ).toHaveLength(20);
  });

  it("gives a hint on pointing at a disk, a fact also in the list", async () => {
    const user = userEvent.setup();
    render(
      <DiskTemperatures
        groups={temperatureGroups(DISKS_6, VOLUMES_6)}
        labels={labels}
      />,
    );
    const sda = screen
      .getAllByRole("listitem")
      .find((t) => t.textContent.startsWith("sda"));
    if (!sda) {
      throw new Error("no sda");
    }
    await user.hover(sda);
    expect(
      await screen.findByText("Hard disk, alert limit 45 °C"),
    ).toBeInTheDocument();
  });
});

describe("DiskTemperatures, a disk whose kind was not read", () => {
  it("draws it as the plain drive in the hard disk's footprint, its level and limit where every upright tile has them", () => {
    const { container } = render(
      <DiskTemperatures
        groups={dashboardTemperatureGroups(DISKS_6, VOLUMES_6, ["sde"])}
        labels={labels}
      />,
    );
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      "Backup, Mirror (RAID 1)",
      "tank, ZFS pool (single disk)",
      "Hard disks",
      "NVMe SSDs, on the mainboard",
      "Disks whose kind is not known",
    ]);
    const unknown = screen.getByRole("list", {
      name: "Disks whose kind is not known, read at 10:31",
    });
    const sde = within(unknown).getByRole("listitem");
    expect(sde.textContent).toBe(nb("sde: 31 °C"));
    expect(sde).toHaveAttribute("data-kind", "unknown");
    const hdd = container.querySelector("li[data-kind=hdd]");
    // The same tile, art box, track and limit as a hard disk's; only the drawing differs.
    expect(sde.className).toBe(hdd?.className);
    for (const part of [
      ":scope > span",
      "[data-part=track]",
      "[data-part=limit]",
    ]) {
      expect(sde.querySelector(part)?.className).toBe(
        hdd?.querySelector(part)?.className,
      );
    }
    expect(sde.querySelector("svg[data-slot=drive-picture]")).toHaveAttribute(
      "data-kind",
      "disk",
    );
    expect(sde.querySelector("[data-part=limit]")).toHaveAttribute(
      "data-at",
      "0.8",
    );
    // Asleep in the pool, sdd keeps its place there, drawn the same way.
    const tank = screen.getByRole("list", {
      name: "tank, ZFS pool (single disk), read at 10:31",
    });
    expect(tank.querySelector("svg[data-slot=drive-picture]")).toHaveAttribute(
      "data-kind",
      "disk",
    );
  });

  it("on the dashboard, shows its group when one of it is over the limit", () => {
    render(
      <DiskTemperatures
        groups={dashboardTemperatureGroups(DISKS_24, VOLUMES_24, ["sdt"])}
        labels={labels}
        mode="dashboard"
        restLabels={REST_LABELS}
      />,
    );
    const unknown = screen.getByRole("list", {
      name: "Disks whose kind is not known, read at 10:31",
    });
    expect(
      within(unknown)
        .getAllByRole("listitem")
        .map((t) => t.textContent.split(":")[0]),
    ).toEqual(["sdi", "sdt", "sdu"]);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(
      screen.getByText("sdt is at 46 °C, at or over the alert limit of 45 °C."),
    ).toBeInTheDocument();
  });

  it("gives a hint without a kind", async () => {
    const user = userEvent.setup();
    render(
      <DiskTemperatures
        groups={dashboardTemperatureGroups(DISKS_6, VOLUMES_6, ["sde"])}
        labels={labels}
      />,
    );
    const sde = screen
      .getAllByRole("listitem")
      .find((t) => t.textContent.startsWith("sde"));
    if (!sde) {
      throw new Error("no sde");
    }
    await user.hover(sde);
    expect(
      await screen.findByText("Kind not known, alert limit 45 °C"),
    ).toBeInTheDocument();
  });
});
