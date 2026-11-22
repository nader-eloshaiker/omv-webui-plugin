// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > ZFS and a pool's page through the whole app on MSW (phase 5 ZFS design 0.11, 1, 2): the
// menu item only when the plugin answers, the not-installed state, the list with its states worst
// first, a pool's page with its disks' roles and file systems, the poll only while a check or rebuild
// runs (P13), and what is refused, each in words.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 15000 };

async function open(scenario: ScenarioName, path = "/storage/zfs") {
  const app = await renderApp({ signedIn: true, scenario, path });
  return app;
}
const calls = (call: string) => seenCalls.filter((c) => c.call === call);

describe("the ZFS menu item and the not-installed state (0.11)", () => {
  it("is not in the menu when the plugin answers 404, and the page says what to install", async () => {
    await open("admin");
    expect(
      await screen.findByText(
        "ZFS needs the openmediavault-zfs plugin, which is not installed on this NAS.",
        {},
        LONG,
      ),
    ).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).queryByRole("link", { name: "ZFS" })).toBeNull();
    // Nothing but the probe and the list read asked ZFS.
    expect(
      callNames().filter(
        (c) =>
          c.startsWith("Zfs.") &&
          c !== "Zfs.listCompressionTypes" &&
          c !== "Zfs.listPools",
      ),
    ).toEqual([]);
  });

  it("is in the menu, after RAID, once the plugin answers", async () => {
    await open("zfsMirror");
    const nav = await screen.findByRole("navigation", {
      name: "Main navigation",
    });
    expect(
      await within(nav).findByRole("link", { name: "ZFS" }, LONG),
    ).toHaveAttribute("href", "/ui/storage/zfs");
  });
});

describe("the pools list (1)", () => {
  it("shows a healthy mirror with its layout, space and last check, and does not poll", async () => {
    await open("zfsMirror");
    const table = await screen.findByRole("table", { name: "ZFS pools" }, LONG);
    const row = await within(table).findByRole("row", { name: /tank/ }, LONG);
    expect(
      within(row).getByRole("link", { name: "Open pool tank" }),
    ).toHaveAttribute("href", "/ui/storage/zfs/pools/tank");
    expect(
      await within(row).findAllByText("Mirror, 2 disks", {}, LONG),
    ).not.toHaveLength(0);
    expect(within(row).getAllByText("1 file system").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Updated every 30 seconds/)).toBeNull();
    // No roll-up when every pool is fine.
    expect(screen.queryByText(/of 1 pool:/)).toBeNull();
  });

  it("puts a degraded pool in the roll-up as Critical, with the reason in words", async () => {
    await open("zfsDegraded");
    expect(
      await screen.findByText("1 of 1 pool: Critical", {}, LONG),
    ).toBeVisible();
    expect(
      (
        await screen.findAllByText(
          /A disk is missing or has failed\./,
          {},
          LONG,
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it("says a check is under way and polls while it runs (P13)", async () => {
    await open("zfsChecking");
    expect(
      (await screen.findAllByText(/Being checked:/, {}, LONG)).length,
    ).toBeGreaterThan(0);
    expect(
      await screen.findByText(
        "Updated every 30 seconds while a pool is being checked or rebuilt.",
      ),
    ).toBeVisible();
  });

  it("offers Create pool from the empty list", async () => {
    await open("zfsNone");
    expect(
      await screen.findByText(/There are no ZFS pools yet/, {}, LONG),
    ).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: "Create pool" })[0],
    ).toHaveAttribute("href", "/ui/storage/zfs/create");
  });

  it("renders hostile names as text", async () => {
    await open("zfsHostile");
    await screen.findByRole("table", { name: "ZFS pools" }, LONG);
    await waitFor(() =>
      expect(calls("Zfs.listPools").length).toBeGreaterThan(0),
    );
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script:not([src])")).toBeNull();
  });
});

describe("a pool's page (2)", () => {
  it("lists the disks with their roles, the file systems, and the actions allowed", async () => {
    await open("zfsMirror", "/storage/zfs/pools/tank");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Pool tank" }, LONG),
    ).toBeVisible();
    const disks = await screen.findByRole(
      "table",
      { name: "Disks in pool tank" },
      LONG,
    );
    expect(within(disks).getAllByText("Working")).toHaveLength(2);
    expect(
      within(disks).getByRole("button", {
        name: "Replace /dev/sdb in pool tank",
      }),
    ).toBeVisible();
    expect(
      within(disks).getByRole("button", { name: "Take /dev/sdb offline" }),
    ).toBeVisible();
    const fs = screen.getByRole("table", { name: "File systems on pool tank" });
    expect(
      within(fs).getByRole("link", { name: "Open file system tank/media" }),
    ).toHaveAttribute("href", "/ui/storage/zfs/fs/tank/media");
    // The pool holds a file system: it cannot be deleted yet, and says which.
    expect(
      screen.getByRole("button", { name: "Delete pool…" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText(/It holds the file systems tank\/media\./),
    ).toBeVisible();
    expect(callNames()).toContain("Zfs.getPoolDevices");
    expect(callNames()).not.toContain("Zfs.getEmptyCandidates");
  });

  it("shows a replacement in progress as one place, and refuses another change", async () => {
    await open("zfsRebuilding", "/storage/zfs/pools/tank");
    const disks = await screen.findByRole(
      "table",
      { name: "Disks in pool tank" },
      LONG,
    );
    expect(
      await within(disks).findByText(/is taking the place of/, {}, LONG),
    ).toBeVisible();
    expect(
      within(disks).queryByRole("button", { name: /^Replace / }),
    ).toBeNull();
    expect(screen.getByRole("heading", { name: "Rebuilding" })).toBeVisible();
  });

  it("offers bringing back an offline disk", async () => {
    await open("zfsDegraded", "/storage/zfs/pools/tank");
    expect(
      await screen.findByRole("heading", { name: "A disk is offline" }, LONG),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Bring it back…" }),
    ).toBeVisible();
  });

  it("refuses to change the disks of a pool ZFS names by kernel names (item 9)", async () => {
    await open("zfsKernelNames", "/storage/zfs/pools/tank");
    expect(
      await screen.findByText(
        "This pool cannot have its disks changed here",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Replace / })).toBeNull();
    expect(screen.queryByRole("button", { name: /offline$/ })).toBeNull();
  });

  it("fails closed when the report cannot be read", async () => {
    await open("zfsReportFails", "/storage/zfs/pools/tank");
    expect(
      (await screen.findAllByText("Could not read its state.", {}, LONG))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^Replace / })).toBeNull();
  });

  it("shows the not-found state for a name outside the pattern, without a pool call", async () => {
    await open("zfsMirror", "/storage/zfs/pools/-rf");
    expect(
      await screen.findByText(/There is no pool with this name/, {}, LONG),
    ).toBeVisible();
    expect(callNames()).not.toContain("Zfs.getObjectDetails");
    expect(callNames()).not.toContain("Zfs.getPoolDevices");
  });

  it("takes a disk offline after a red confirmation, re-reading the pool first", async () => {
    const { user } = await open("zfsMirror", "/storage/zfs/pools/tank");
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Take /dev/sdb offline" },
        LONG,
      ),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/keeps working without it/)).toBeVisible();
    const before = calls("Zfs.getObjectDetails").length;
    await user.click(
      within(dialog).getByRole("button", { name: "Take offline" }),
    );
    await waitFor(
      () => expect(calls("Zfs.deviceOffline")).toHaveLength(1),
      LONG,
    );
    expect(calls("Zfs.getObjectDetails").length).toBeGreaterThan(before);
    expect(
      await screen.findByRole("heading", { name: "A disk is offline" }, LONG),
    ).toBeVisible();
  });
});
