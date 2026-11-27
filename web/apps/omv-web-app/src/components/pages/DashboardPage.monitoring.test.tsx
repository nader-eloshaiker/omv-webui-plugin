// SPDX-License-Identifier: GPL-3.0-or-later
// What the dashboard reads and draws (journal 2026-11-27, binding), through the whole app on MSW and
// the mock's dashboard scenarios: every poll a background call (UI-14); a disk's kind read once, only
// for the disks awake, and never again by itself; RAID arrays never read, their file systems shown
// without disks and their members never unused; ZFS pool disks read once per pool and only with the
// plugin; the segment bar fed by the file system's own figures; the temperatures by kind; Right now
// from this tab's samples.
import { focusManager, onlineManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { liveDemand } from "../../live/liveDemand.ts";
import { showAround } from "../../shell/showAround.ts";
import { useSeenStore } from "../../stores/useSeenStore.ts";
import { useTipsStore } from "../../stores/useTipsStore.ts";
import { useWelcomeStore } from "../../stores/useWelcomeStore.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 8000 };

beforeEach(() => {
  useWelcomeStore.setState({ seen: true });
  useSeenStore.setState({ seen: ["tip.new-interface", "tip.trace"] });
  useTipsStore.setState({ show: true });
  showAround.reset();
});
afterEach(() => {
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

async function dashboard(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({ signedIn: true, ...options });
  await screen.findByRole("heading", { level: 2, name: "Your NAS" }, LONG);
  return app;
}

const region = (name: string) => screen.getByRole("region", { name });
const calls = (name: string) => seenCalls.filter((c) => c.call === name);
const devicefileOf = (params: unknown) =>
  (params as { devicefile?: string } | null)?.devicefile ?? "";

/** The map's rows, by their names (rethink 6.8 item 13). */
const rows = () =>
  within(region("Your NAS"))
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("aria-label") ?? "")
    .filter((label) => label !== "");

describe("the dashboard's reads", () => {
  it("polls in the background with the whole-list parameters", async () => {
    await dashboard({ scenario: "dashboardAllOk" });
    await waitFor(() =>
      expect(calls("Network.enumerateDevicesList").length).toBeGreaterThan(0),
    );
    for (const call of [
      "FileSystemMgmt.enumerateMountedFilesystems",
      "Services.getStatus",
      "Network.enumerateDevicesList",
    ]) {
      expect(calls(call).length, call).toBeGreaterThan(0);
      expect(
        calls(call).every((c) => c.background),
        call,
      ).toBe(true);
    }
    expect(
      calls("FileSystemMgmt.enumerateMountedFilesystems")[0]?.params,
    ).toEqual({ includeroot: true });
  });

  it("reads each disk's kind once, only for the disks awake and not known by name, and never again by itself", async () => {
    const { app } = await dashboard({ scenario: "dashboard24Disks" });
    // 24 disks: two NVMe sticks known by name, sdi and sdu asleep.
    await waitFor(
      () => expect(calls("Smart.getInformation")).toHaveLength(20),
      LONG,
    );
    const read = calls("Smart.getInformation").map((c) =>
      devicefileOf(c.params),
    );
    expect(read.some((d) => /nvme/.test(d))).toBe(false);
    expect(read.some((d) => /SERIAL-0111|SERIAL-0123/.test(d))).toBe(false);
    // Focus, reconnect, a refresh of every query (as after a task): no read starts again.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await act(() => app.queryClient.invalidateQueries());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    await waitFor(() => expect(app.queryClient.isFetching()).toBe(0), LONG);
    expect(calls("Smart.getInformation")).toHaveLength(20);
    // Coming back to the dashboard keeps the kinds for the session.
    await act(() => app.router.navigate({ to: "/storage/disks" }));
    await act(() => app.router.navigate({ to: "/" }));
    await screen.findByRole("heading", { level: 2, name: "Your NAS" }, LONG);
    await waitFor(() => expect(app.queryClient.isFetching()).toBe(0), LONG);
    expect(calls("Smart.getInformation")).toHaveLength(20);
  });

  it("makes no ZFS read without the plugin, and no RAID read at all", async () => {
    await dashboard({ scenario: "dashboardNewNas" });
    await within(region("Disk temperatures")).findByText(/^Read at /, {}, LONG);
    expect(callNames()).toContain("Zfs.listCompressionTypes");
    expect(callNames()).not.toContain("Zfs.getPoolStatus");
    expect(callNames()).not.toContain("Zfs.getPoolDevices");
    for (const call of [
      "MdMgmt.enumerateDevices",
      "MdMgmt.getDetail",
      "MdMgmt.getSlaves",
    ]) {
      expect(callNames()).not.toContain(call);
    }
  });

  it("reads each pool's disks once, with the plugin", async () => {
    await dashboard({ scenario: "dashboard24Disks" });
    await waitFor(
      () => expect(calls("Zfs.getPoolDevices")).toHaveLength(1),
      LONG,
    );
    expect(calls("Zfs.getPoolDevices")[0]?.params).toEqual({ name: "tank" });
  });

  it("makes none of the administrator's reads for a normal user", async () => {
    await renderApp({ signedIn: true, scenario: "user" });
    await screen.findByRole("region", { name: "This NAS" });
    for (const call of [
      "FileSystemMgmt.enumerateMountedFilesystems",
      "FileSystemMgmt.getList",
      "Services.getStatus",
      "Network.enumerateDevicesList",
      "Smart.getListBg",
      "Smart.getInformation",
      "Smart.getSettings",
      "DiskMgmt.getList",
      "ShareMgmt.getList",
      "SMB.getShareList",
      "NFS.getShareList",
    ]) {
      expect(callNames()).not.toContain(call);
    }
  });
});

describe("the map", () => {
  it("draws an array's file system without disks, its members on their own row, and never calls them unused", async () => {
    await dashboard({ scenario: "dashboardAllOk" });
    await waitFor(() =>
      expect(rows().some((r) => r.startsWith("Backup"))).toBe(true),
    );
    const backup = rows().find((r) => r.startsWith("Backup"));
    expect(backup).toMatch(/^Backup: 41 percent used\./);
    expect(backup).toMatch(/Its disks are listed on the RAID page\.$/);
    expect(rows()).toContainEqual(
      expect.stringMatching(/^In a RAID array: disks sdb and sdc\./),
    );
    const unused = rows().find((r) => r.startsWith("Not in use"));
    expect(unused).toBe(
      "Not in use: disk sde. Add storage to keep files on it.",
    );
    // The pool's disk comes from Zfs.getPoolDevices.
    expect(rows()).toContainEqual(
      expect.stringMatching(/^tank, on disk sdd: 28 percent used/),
    );
  });

  it("says when a pool's disks could not be read, and then calls no disk unused", async () => {
    await dashboard({
      scenario: "dashboardAllOk",
      answers: {
        zfsGetPoolDevices: { status: 500, message: "zpool failed." },
      },
    });
    await waitFor(() =>
      expect(rows()).toContainEqual(
        expect.stringMatching(
          /^tank: 28 percent used.*Which disks it is on could not be read\.$/,
        ),
      ),
    );
    expect(rows().some((r) => r.startsWith("Not in use"))).toBe(false);
  });

  it("feeds the segment bar the file system's percentage and warning level, and says when it is past it", async () => {
    await dashboard({ scenario: "dashboardNeedsYou" });
    const meter = await within(region("Your NAS")).findByRole("meter", {
      name: "Data drive: space used",
    });
    expect(meter).toHaveAttribute("aria-valuenow", "92");
    expect(meter).toHaveAttribute(
      "aria-valuetext",
      expect.stringMatching(
        /^92\s% used, .* free of .*, the warning mark is at 85\s%, almost full\.$/,
      ),
    );
    // A pool with no warning level set (OMV's 0) has no mark.
    expect(
      within(region("Your NAS")).getByRole("meter", {
        name: "tank: space used",
      }),
    ).toHaveAttribute(
      "aria-valuetext",
      expect.not.stringMatching(/warning mark/),
    );
  });

  it("says plainly when the disks could not be read, in the map and the temperatures", async () => {
    await dashboard({
      scenario: "dashboardAllOk",
      answers: {
        diskMgmtGetList: { status: 500, message: "lsblk exited with code 1." },
      },
    });
    expect(
      await within(region("Your NAS")).findByText(
        "Could not read the disks",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(
      within(region("Disk temperatures")).getByText(
        "Could not read the disks.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(
      "Part of the NAS could not be read.",
    );
  });
});

describe("the disk temperatures", () => {
  it("show every disk past the limit and sum up the rest, with the sleeping ones said once", async () => {
    const { user } = await dashboard({ scenario: "dashboard24Disks" });
    const temps = region("Disk temperatures");
    expect(
      await within(temps).findByText(
        /sdk is at 46.°C, sdt is at 46.°C, and nvme1n1 is at 47.°C, at or over the alert limit of 45.°C\./,
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(temps).toHaveTextContent(
      /sdi and sdu are asleep, so their temperatures were not read/,
    );
    await user.click(
      within(temps).getByRole("button", { name: /^Show the other \d+.disks$/ }),
    );
    // A disk asleep, or one whose kind Smart.getInformation does not say, has no known kind.
    expect(
      await within(temps).findByText("Disks whose kind is not known"),
    ).toBeVisible();
  });
});

describe("Right now", () => {
  it("draws this tab's samples and asks the shell to read every 2 seconds while it is on screen", async () => {
    await dashboard({ scenario: "dashboardAllOk" });
    const live = region("Right now");
    expect(
      await within(live).findByText(/a reading every 2 seconds\.$/),
    ).toBeInTheDocument();
    expect(live).toHaveTextContent("Processor and memory");
    expect(live).toHaveTextContent("Network, in above the line and out below");
    expect(liveDemand.getState().charts).toBeGreaterThan(0);
  });
});
