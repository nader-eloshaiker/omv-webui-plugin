// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disks through the whole app on MSW (phase 5 disks design 1): the four reads on opening,
// the "Used for" words from them, failing closed when what the disks hold cannot be checked, the RAID
// plugin's absence as no failure, the health line read only on request, rescan and Refresh, sorting,
// every state, backend text rendered as text, and a normal user kept off the page without a call.
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const WAKING = [
  "Smart.getListBg",
  "Smart.getInformation",
  "Smart.getAttributes",
  "Smart.getSelfTestLogs",
  "Smart.getExtendedInformation",
  "Smart.executeScheduledTest",
  "Smart.enumerateDevices",
  "Smart.enumerateMonitoredDevices",
];
const waking = () => callNames().filter((c) => WAKING.includes(c));

async function disks(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    signedIn: true,
    path: "/storage/disks",
    ...options,
  });
  await screen.findByRole("heading", { level: 1, name: "Disks" });
  return app;
}

/** Wait until no read is running, so a count taken next is not raced by the opening reads. */
const settled = (app: { queryClient: { isFetching(): number } }) =>
  waitFor(() => expect(app.queryClient.isFetching()).toBe(0));

const count = (call: string) => seenCalls.filter((c) => c.call === call).length;

const table = () => screen.getByRole("table", { name: "Disks" });
/** The body rows, once read. */
async function rows() {
  await within(table()).findAllByRole("link", { name: /^Open disk / });
  return within(table()).getAllByRole("row").slice(1);
}
const rowOf = async (device: string) => {
  const link = await within(table()).findByRole("link", {
    name: `Open disk ${device}`,
  });
  return link.closest("tr") as HTMLElement;
};

describe("Storage > Disks", () => {
  it("reads the four lists on opening, never a waking read, and names the page", async () => {
    const { app } = await disks();
    await rows();
    for (const call of [
      "DiskMgmt.getList",
      "FileSystemMgmt.getList",
      "FileSystemMgmt.enumerateFilesystems",
      "MdMgmt.enumerateDevices",
    ]) {
      // StrictMode mounts the page twice in a test, so a read on opening can be seen twice.
      expect(
        seenCalls.filter((c) => c.call === call).length,
      ).toBeGreaterThanOrEqual(1);
      expect(seenCalls.find((c) => c.call === call)?.background).toBe(false);
    }
    expect(
      seenCalls.find((c) => c.call === "DiskMgmt.getList")?.params,
    ).toEqual({
      start: 0,
      limit: null,
      sortfield: "devicename",
      sortdir: "asc",
    });
    expect(waking()).toEqual([]);
    await waitFor(() => expect(document.title).toBe("Disks – openmediavault"));
    expect(
      screen
        .getByRole("navigation", { name: "Main navigation" })
        .querySelector('[aria-current="page"]'),
    ).toHaveTextContent("Disks");
    expect(app.router.state.location.pathname).toBe("/storage/disks");
    expect(
      screen.getByRole("link", {
        name: "Disks in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/storage/disks");
  });

  it("shows the test VM's disks with what each holds, the RAID plugin not installed being no failure", async () => {
    await disks({ scenario: "disksNoRaidPlugin" });
    const all = await rows();
    expect(all).toHaveLength(6);
    expect(await rowOf("/dev/nvme0n1")).toHaveTextContent(
      "System disk (openmediavault runs from it)",
    );
    expect(await rowOf("/dev/sda")).toHaveTextContent(
      "File system EXT4 on /dev/sda1, in use",
    );
    expect(await rowOf("/dev/sdb")).toHaveTextContent("No file system found");
    expect(await rowOf("/dev/sdb")).toHaveTextContent("8.0 GiB");
    expect(await rowOf("/dev/sdb")).toHaveTextContent("EXAMPLE-SERIAL-0003");
    expect(await rowOf("/dev/sdb")).toHaveTextContent("Awake");
    expect(await rowOf("/dev/sr0")).toHaveTextContent("Not reported");
    // Not checked this session: no health is claimed.
    expect(await rowOf("/dev/sdb")).toHaveTextContent("Not checked");
    // The MdMgmt 404 means "not installed": no failure is shown.
    expect(
      screen.queryByText(/^Could not check what the disks hold/),
    ).not.toBeInTheDocument();
    expect(
      within(await rowOf("/dev/sdb")).getByRole("link", {
        name: "Open disk /dev/sdb",
      }),
    ).toHaveAttribute("href", "/ui/storage/disks/sdb");
  });

  it("names every use on a NAS with data disks, a USB disk and a RAID mirror", async () => {
    await disks({ scenario: "disksNas" });
    await rows();
    expect(await rowOf("/dev/sda")).toHaveTextContent(
      "File system data, in use",
    );
    expect(await rowOf("/dev/sdb")).toHaveTextContent(
      "File system media, in use",
    );
    expect(await rowOf("/dev/sdc")).toHaveTextContent("No file system found");
    expect(await rowOf("/dev/sdd")).toHaveTextContent(
      "File system old-pc, not used on this NAS",
    );
    // Named by its device, never mdadm's "host:name", and linked to the array's page (RAID 9.2).
    expect(await rowOf("/dev/sde")).toHaveTextContent("Part of RAID /dev/md0");
    expect(await rowOf("/dev/sdf")).toHaveTextContent("Part of RAID /dev/md0");
    expect(
      within(await rowOf("/dev/sde")).getByRole("link", {
        name: "Open RAID /dev/md0",
      }),
    ).toHaveAttribute("href", "/ui/storage/md/md0");
    const system = await rowOf("/dev/nvme0n1");
    expect(within(system).getAllByRole("listitem")[0]).toHaveTextContent(
      "System disk (openmediavault runs from it)",
    );
    expect(system).toHaveTextContent(
      "File system EXT4 on /dev/nvme0n1p2, in use",
    );
    expect(await rowOf("/dev/sdc")).toHaveTextContent("7.3 TiB");
  });

  it("names the ZFS pool its disks are part of, though no UUID comes with the pool's file systems", async () => {
    await disks({ scenario: "fsZfs" });
    await rows();
    for (const device of ["/dev/sdb", "/dev/sdc"]) {
      const row = await rowOf(device);
      expect(row).toHaveTextContent("Part of ZFS pool tank");
      // The pool is not a file system on the disk.
      expect(row).not.toHaveTextContent(/File system tank/);
    }
    expect(await rowOf("/dev/sdd")).toHaveTextContent("No file system found");
    expect(await rowOf("/dev/sda")).toHaveTextContent(
      "File system EXT4 on /dev/sda1, in use",
    );
  });

  it("says Not known and refuses every wipe when the file systems cannot be read (fail closed)", async () => {
    await disks({ scenario: "disksUseFails" });
    expect(
      await screen.findByText(
        "Could not check what the disks hold. No disk can be wiped until this has been checked.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No file system backend exists for the type 'zfs_member'.",
      ),
    ).toBeInTheDocument();
    for (const row of await rows()) {
      expect(row).toHaveTextContent("Not known");
    }
  });

  it("fails closed when the RAID plugin's read fails for another reason, and reads again on Try again", async () => {
    const { user } = await disks({ scenario: "disksRaidFails" });
    await screen.findByText(/^Could not check what the disks hold\./);
    expect(await rowOf("/dev/sda")).toHaveTextContent("Not known");
    const before = seenCalls.filter(
      (c) => c.call === "MdMgmt.enumerateDevices",
    ).length;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(
        seenCalls.filter((c) => c.call === "MdMgmt.enumerateDevices").length,
      ).toBe(before + 1),
    );
    expect(waking()).toEqual([]);
  });

  it("shows a loading table, then the rows", async () => {
    await renderApp({ signedIn: true, path: "/storage/disks" });
    const loading = await screen.findByRole("table", { name: "Disks" });
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByText("Loading the disks…")).toBeInTheDocument();
    await rows();
    expect(table()).not.toHaveAttribute("aria-busy");
  });

  it("shows the list error with the server's message, without a header row, and reads again", async () => {
    const { user, app } = await disks({ scenario: "disksReadFails" });
    expect(
      await screen.findByText("Could not read the disks."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Failed to read the list of disks: lsblk exited with code 1.",
      ),
    ).toBeInTheDocument();
    expect(within(table()).queryAllByRole("columnheader")).toHaveLength(0);
    expect(screen.queryByText(/mock trace/)).not.toBeInTheDocument();
    await settled(app);
    const before = count("DiskMgmt.getList");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(count("DiskMgmt.getList")).toBe(before + 1));
  });

  it("shows the empty state when no disk is listed", async () => {
    await disks({
      answers: {
        diskMgmtGetList: { status: 200, value: { total: 0, data: [] } },
      },
    });
    expect(
      await screen.findByText(
        "No disks were found. Connect a disk, then press Look for new disks.",
      ),
    ).toBeInTheDocument();
  });

  it("renders models and serial numbers as text, keeps right-to-left text in its direction, and tells twins apart", async () => {
    await disks({ scenario: "disksHostile" });
    await rows();
    const markup = await rowOf("/dev/sde");
    expect(markup).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(markup.querySelector("img")).toBeNull();
    const rtl = within(await rowOf("/dev/sdd")).getByText("قرص تخزين خارجي");
    expect(rtl).toHaveAttribute("dir", "auto");
    expect(await rowOf("/dev/sda")).toHaveTextContent("EXAMPLE-SERIAL-0141");
    expect(await rowOf("/dev/sdb")).toHaveTextContent("EXAMPLE-SERIAL-0142");
    expect(await rowOf("/dev/sdf")).toHaveTextContent("Model not reported");
  });

  it("says a sleeping disk is asleep, as a word", async () => {
    await disks({ scenario: "disksAsleep" });
    expect(await rowOf("/dev/sdb")).toHaveTextContent("Asleep (spun down)");
  });

  it("checks disk health only when asked, and shows each disk's state and temperature", async () => {
    const { user } = await disks({ scenario: "disksNas" });
    await rows();
    expect(
      screen.getByText(
        "Disk health is read only when you ask. Reading it wakes any disk that has gone to sleep to save power.",
      ),
    ).toBeInTheDocument();
    expect(waking()).toEqual([]);
    const check = screen.getByRole("button", { name: "Check disk health" });
    await user.click(check);
    expect(
      await screen.findByText("1 of 6 disks: Warning", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(callNames().filter((c) => c === "Smart.getListBg")).toHaveLength(1);
    expect(await rowOf("/dev/sdb")).toHaveTextContent("Warning");
    expect(await rowOf("/dev/sdb")).toHaveTextContent("41 °C");
    expect(await rowOf("/dev/sda")).toHaveTextContent("OK");
    // The USB disk passes no health readings through.
    expect(await rowOf("/dev/sdd")).toHaveTextContent("Not reported");
    expect(screen.getByRole("button", { name: "Check again" })).toHaveFocus();
  });

  it("looks for new disks and lists the ones found", async () => {
    let rescanned = false;
    const { user } = await disks({
      answers: {
        diskMgmtRescan: () => {
          rescanned = true;
          return "null";
        },
        diskMgmtGetList: () => (rescanned ? "withHdparm" : "standby"),
      },
    });
    await rows();
    const button = screen.getByRole("button", { name: "Look for new disks" });
    await user.click(button);
    expect(
      await screen.findByText(
        /^Looked for new disks at .* Found \d+ new disks?: /,
      ),
    ).toBeInTheDocument();
    expect(callNames()).toContain("DiskMgmt.rescan");
    expect(button).toHaveFocus();
  });

  it("says when a rescan found nothing new", async () => {
    const { user } = await disks();
    await rows();
    await user.click(
      screen.getByRole("button", { name: "Look for new disks" }),
    );
    expect(
      await screen.findByText(
        /^Looked for new disks at .* No new disk found\. A disk connected a moment ago can take a few seconds to appear; press Refresh if it is not listed\.$/,
      ),
    ).toHaveAttribute("role", "status");
  });

  it("says when looking for new disks failed, and keeps the list", async () => {
    const { user } = await disks({
      answers: {
        diskMgmtRescan: { status: 500, message: "udevadm failed." },
      },
    });
    await rows();
    await user.click(
      screen.getByRole("button", { name: "Look for new disks" }),
    );
    expect(
      await screen.findByText("Could not look for new disks."),
    ).toBeInTheDocument();
    expect(screen.getByText("udevadm failed.")).toBeInTheDocument();
    expect(await rows()).toHaveLength(6);
    expect(callNames().filter((c) => c === "DiskMgmt.rescan")).toHaveLength(1);
  });

  it("reads again on Refresh, as foreground reads, keeping focus on the button", async () => {
    const { user, app } = await disks();
    await rows();
    await settled(app);
    const refresh = screen.getByRole("button", { name: "Refresh" });
    const lists = count("DiskMgmt.getList");
    const detected = count("FileSystemMgmt.enumerateFilesystems");
    await user.click(refresh);
    await waitFor(() => expect(count("DiskMgmt.getList")).toBe(lists + 1));
    await waitFor(() => expect(refresh).toHaveAccessibleName("Refresh"));
    expect(refresh).toHaveFocus();
    expect(count("FileSystemMgmt.enumerateFilesystems")).toBe(detected + 1);
    expect(
      seenCalls
        .filter((c) => c.call === "DiskMgmt.getList")
        .every((c) => !c.background),
    ).toBe(true);
    expect(screen.getByText(/^Read at /)).toHaveAttribute("role", "status");
    expect(waking()).toEqual([]);
  });

  it("sorts by size and back, and announces it", async () => {
    const { user } = await disks({ scenario: "disksNas" });
    await rows();
    await user.click(screen.getByRole("button", { name: "Size" }));
    const devices = () =>
      within(table())
        .getAllByRole("link", { name: /^Open disk / })
        .map((l) => l.textContent);
    expect(devices()[0]).toBe("/dev/nvme0n1");
    expect(devices().at(-1)).toBe("/dev/sdc");
    expect(screen.getByText("Sorted by Size, ascending")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disk" }));
    expect(devices()).toEqual([
      "/dev/nvme0n1",
      "/dev/sda",
      "/dev/sdb",
      "/dev/sdc",
      "/dev/sdd",
      "/dev/sde",
      "/dev/sdf",
    ]);
  });

  it("keeps a normal user off the page without a call", async () => {
    await renderApp({
      scenario: "user",
      signedIn: true,
      path: "/storage/disks",
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Disks" }),
    ).toBeInTheDocument();
    await act(() => Promise.resolve());
    expect(callNames()).not.toContain("DiskMgmt.getList");
    expect(callNames()).not.toContain("FileSystemMgmt.getList");
  });
});
