// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > RAID through the whole app on MSW (phase 5 RAID design 1, 0.10): the not-installed state,
// empty, error and populated tables, counts and roles from each array's report, the roll-up, progress
// from the state or the report, the poll only while an array is busy, and backend text as text with no
// host part ever shown.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 8000 };

async function list(scenario: ScenarioName = "raidMirror") {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: "/storage/md",
  });
  await screen.findByRole("heading", { level: 1, name: "RAID" });
  return app;
}
const table = () => screen.findByRole("table", { name: "RAID arrays" }, LONG);
const settled = (app: { queryClient: { isFetching(): number } }) =>
  waitFor(() => expect(app.queryClient.isFetching()).toBe(0), LONG);

describe("Storage > RAID", () => {
  it("lists a healthy mirror with its state, level, size, disks from the report, and what uses it", async () => {
    const { app } = await list();
    const t = await table();
    const link = await within(t).findByRole(
      "link",
      { name: "Open RAID /dev/md0" },
      LONG,
    );
    expect(link).toHaveAttribute("href", "/ui/storage/md/md0");
    await settled(app);
    const row = link.closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("OK");
    expect(row).toHaveTextContent("Mirror (RAID1)");
    expect(row).toHaveTextContent("8.0 GiB");
    expect(row).toHaveTextContent("2 of 2 disks working");
    expect(row).toHaveTextContent("Nothing");
    // The phone layout repeats the disks on a second line (hidden by CSS, which happy-dom does not
    // apply), so the link is found at least once.
    expect(
      within(row).getAllByRole("link", { name: "Open disk /dev/sdb" }).length,
    ).toBeGreaterThan(0);
    // Nothing is wrong, so nothing is claimed; nothing polls an idle NAS.
    expect(screen.queryByText(/arrays?: /)).toBeNull();
    expect(
      screen.queryByText(
        "Updated every 30 seconds while an array is synchronising, rebuilding or being checked.",
      ),
    ).toBeNull();
    expect(
      seenCalls.filter((c) => c.call.startsWith("MdMgmt.") && c.background),
    ).toEqual([]);
    // Nothing that changes an array, and the plugin's candidates only for the menu.
    for (const call of [
      "MdMgmt.create",
      "MdMgmt.add",
      "MdMgmt.grow",
      "MdMgmt.remove",
      "MdMgmt.delete",
      "MdMgmt.setSyncAction",
    ]) {
      expect(callNames()).not.toContain(call);
    }
    expect(screen.getByRole("link", { name: "Create array" })).toHaveAttribute(
      "href",
      "/ui/storage/md/create",
    );
  });

  it("leads with the worst: a mirror with a failed disk is Critical, counted from the report", async () => {
    await list("raidFailed");
    const t = await table();
    await waitFor(
      () => expect(t).toHaveTextContent("1 of 2 disks working"),
      LONG,
    );
    expect(screen.getByText("1 of 1 array: Critical")).toBeVisible();
    expect(t).toHaveTextContent(
      "A disk is missing or has failed. If one more fails, its files are lost. Replace the disk.",
    );
  });

  it("says a RAID6 with two failed disks cannot lose another, not that it is missing four", async () => {
    await list("raidRaid6TwoFailed");
    const t = await table();
    await waitFor(
      () => expect(t).toHaveTextContent("2 of 4 disks working"),
      LONG,
    );
  });

  it("shows a resync's progress from the state, and says it polls while busy", async () => {
    await list("raidSyncing");
    const t = await table();
    await within(t).findByRole("progressbar", {}, LONG);
    expect(t).toHaveTextContent(
      /Synchronising its disks: \d+\.\d% done, about/,
    );
    expect(t).toHaveTextContent("Warning");
    expect(
      screen.getByText(
        "Updated every 30 seconds while an array is synchronising, rebuilding or being checked.",
      ),
    ).toBeVisible();
  });

  it("shows a reshape's progress, which only the report has", async () => {
    await list("raidReshaping");
    const t = await table();
    await waitFor(
      () =>
        expect(t).toHaveTextContent(
          /Being reshaped to use the added disks: \d+\.0% done/,
        ),
      LONG,
    );
  });

  it("says when there is no array yet, with Create array", async () => {
    await list("admin");
    expect(
      await screen.findByText(
        "There are no RAID arrays yet. Create one to combine two or more disks so that your files survive a failed disk.",
        {},
        LONG,
      ),
    ).toBeVisible();
  });

  it("shows a failed read as an error, not as no arrays", async () => {
    await list("raidReadFails");
    expect(
      await screen.findByText("Could not read the RAID arrays.", {}, LONG),
    ).toBeVisible();
    expect(screen.getByText(/mdadm --detail --scan/)).toBeVisible();
    expect(screen.queryByText(/There are no RAID arrays yet/)).toBeNull();
  });

  it("says the plugin is needed, links to the classic Plugins page, and resolves no array", async () => {
    await list("raidNoPlugin");
    expect(
      await screen.findByText(
        "RAID needs the openmediavault-md plugin, which is not installed on this NAS.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Plugins in the classic interface/ }),
    ).toHaveAttribute("href", "/#/system/plugins");
    expect(callNames()).not.toContain("MdMgmt.getDetail");
    expect(callNames()).not.toContain("MdMgmt.getSlaves");
  });

  it("never shows a host part; names and states from the server stay text", async () => {
    await list("raidHostile");
    const t = await table();
    await within(t).findByRole("link", { name: "Open RAID /dev/md0" }, LONG);
    expect(t).not.toHaveTextContent("otherpc");
    expect(t.querySelector("img")).toBeNull();
    // An array whose device file is not /dev/mdN has no page.
    expect(t).toHaveTextContent(
      "This page cannot open this array. Manage it in the classic interface.",
    );
    expect(
      within(t).queryByRole("link", { name: "Open RAID /dev/md/media" }),
    ).toBeNull();
  });

  it("shows an unrecognised state as Unknown, in the server's words as text", async () => {
    await list("raidUnrecognised");
    const t = await table();
    await waitFor(
      () =>
        expect(t).toHaveTextContent(
          "Its state is “clean, frobnicating”, which this page does not recognise.",
        ),
      LONG,
    );
    expect(t).toHaveTextContent("Unknown");
  });

  it("lists twenty arrays without paging", async () => {
    await list("raidMany");
    const t = await table();
    await waitFor(
      () =>
        expect(
          within(t).getAllByRole("link", { name: /^Open RAID / }),
        ).toHaveLength(20),
      LONG,
    ); // The plural follows the number of arrays, not the number in trouble.
    expect(screen.getByText("1 of 20 arrays: Warning")).toBeVisible();
  });

  it("gives a normal user the administrators-only page, and asks nothing about RAID", async () => {
    await renderApp({ signedIn: true, scenario: "user", path: "/storage/md" });
    await screen.findByRole("heading", { level: 1, name: "RAID" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(callNames().filter((c) => c.startsWith("MdMgmt."))).toEqual([]);
  });
});
