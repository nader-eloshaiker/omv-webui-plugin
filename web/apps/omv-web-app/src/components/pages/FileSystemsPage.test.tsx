// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > File systems through the whole app on MSW (phase 5 file-systems design 1, 3): the reads on
// opening and none that wakes a disk or looks for candidates, the system drive first, each row's state,
// usage, type, disks and use in words, the found section and the mount dialog, the unfinished-work
// notices, every state, backend text as text, and a normal user kept off the page without a call.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { recordCreated, recordCreatedOn } from "../../filesystems/fsSession.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const SDA1 = CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value.data[0];

async function list(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    signedIn: true,
    path: "/storage/filesystems",
    ...options,
  });
  await screen.findByRole("heading", { level: 1, name: "File systems" });
  return app;
}

const table = () => screen.getByRole("table", { name: "File systems" });
// The compact meter repeats the name for assistive technology, so the first match is the cell's.
const rowOf = async (name: RegExp | string) => {
  const cells = await within(table()).findAllByText(name);
  return cells[0]?.closest("tr") as HTMLElement;
};
/** Text broken up by elements (a device in code type), matched on one element's whole text. */
const whole = (text: string | RegExp) => (_: string, node: Element | null) =>
  node !== null &&
  (typeof text === "string"
    ? node.textContent === text
    : text.test(node.textContent ?? "")) &&
  [...node.children].every((child) =>
    typeof text === "string"
      ? child.textContent !== text
      : !text.test(child.textContent ?? ""),
  );
const settled = (app: { queryClient: { isFetching(): number } }) =>
  waitFor(() => expect(app.queryClient.isFetching()).toBe(0));

describe("Storage > File systems", () => {
  it("reads the lists on opening, never the candidates task or a report, and names the page", async () => {
    const { app } = await list();
    await rowOf("System drive");
    await settled(app);
    for (const call of [
      "FileSystemMgmt.getList",
      "FileSystemMgmt.getMountCandidates",
      "FileSystemMgmt.enumerateMountedFilesystems",
      "DiskMgmt.getList",
    ]) {
      expect(callNames()).toContain(call);
      expect(seenCalls.find((c) => c.call === call)?.background).toBe(false);
    }
    for (const call of [
      "FileSystemMgmt.getCandidatesBg",
      "FileSystemMgmt.getDetails",
      "FileSystemMgmt.create",
      "FileSystemMgmt.setMountPoint",
    ]) {
      expect(callNames()).not.toContain(call);
    }
    await waitFor(() =>
      expect(document.title).toBe("File systems – openmediavault"),
    );
    expect(
      screen
        .getByRole("navigation", { name: "Main navigation" })
        .querySelector('[aria-current="page"]'),
    ).toHaveTextContent("File systems");
  });

  it("lists the system drive first, then each file system with its facts in words", async () => {
    await list();
    await rowOf("System drive");
    const rows = within(table()).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("System drive");
    const system = await rowOf("System drive");
    expect(system).toHaveTextContent(
      "Where openmediavault is installed. It is managed by the system, not here.",
    );
    expect(
      within(system).queryByRole("link", { name: /^Open file system/ }),
    ).toBeNull();
    const link = await within(table()).findByRole("link", {
      name: "Open file system EXT4 on /dev/sda1",
    });
    expect(link).toHaveAttribute(
      "href",
      `/ui/storage/filesystems/${SDA1.uuid}`,
    );
    const row = link.closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("OK");
    expect(within(row).getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      "1% full · 7.8 GiB free of 7.8 GiB",
    );
    expect(row).toHaveTextContent("EXT4");
    expect(
      within(row).getByRole("link", { name: "Open disk /dev/sda" }),
    ).toHaveAttribute("href", "/ui/storage/disks/sda");
    expect(row).toHaveTextContent("Shared folders or other settings");
    expect(
      screen.getByText(
        "Used by: whether shared folders or other settings use the file system. Its page says which.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add storage" })).toHaveAttribute(
      "href",
      "/ui/storage/filesystems/add",
    );
    expect(
      screen.getByRole("link", { name: "Combine disks (BTRFS)" }),
    ).toHaveAttribute("href", "/ui/storage/filesystems/add-multi");
    expect(
      screen.getByRole("link", {
        name: "File systems in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/storage/filesystems");
    // Everything is fine: no roll-up line.
    expect(screen.queryByText(/file systems?: /)).toBeNull();
  });

  it("keeps a normal user off the page without a file-system call", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/storage/filesystems",
    });
    await screen.findByText(/only administrators/i);
    expect(callNames().filter((c) => c.startsWith("FileSystemMgmt"))).toEqual(
      [],
    );
  });

  it("says when the list cannot be read, with the server's words and Try again", async () => {
    await list({
      answers: {
        fileSystemMgmtGetList: {
          status: 500,
          message: "No file system backend exists for the type 'zfs_member'.",
        },
      },
    });
    expect(
      await screen.findByText("Could not read the file systems."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No file system backend exists for the type 'zfs_member'.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(document.body).not.toHaveTextContent("mock trace");
  });

  it("says there is no storage yet, under the system drive, with a link to add it", async () => {
    await list({
      answers: {
        fileSystemMgmtGetList: { status: 200, value: { total: 0, data: [] } },
      },
    });
    expect(
      await screen.findByText(
        "There is no storage for files yet. Add a disk and create a file system on it to start.",
      ),
    ).toBeInTheDocument();
    await rowOf("System drive");
    expect(
      within(table()).getByRole("link", { name: "Add storage" }),
    ).toHaveAttribute("href", "/ui/storage/filesystems/add");
  });

  it("shows every state in words, and backend text as text", async () => {
    await list({ scenario: "fsVariety" });
    expect(
      await screen.findByText(/of 13 file systems: Critical$/),
    ).toBeInTheDocument();
    const full = await rowOf("backups");
    expect(full).toHaveTextContent("Critical");
    expect(full).toHaveTextContent("Full. Nothing more can be written to it.");
    const nearly = await rowOf("media");
    expect(nearly).toHaveTextContent("Warning");
    expect(nearly).toHaveTextContent("At or above its warning level of 85%");
    expect(nearly).toHaveTextContent("Media, Photos");
    const unread = await rowOf("usb-disk");
    expect(unread).toHaveTextContent("Could not read how full it is");
    const notMounted = await rowOf("not-mounted");
    expect(notMounted).toHaveTextContent(
      "Not mounted. Its files cannot be reached.",
    );
    expect(notMounted).toHaveTextContent("No reading");
    const missing = await rowOf("old-backups");
    expect(missing).toHaveTextContent(
      "Missing. Its disk may be disconnected or have failed.",
    );
    expect(missing).toHaveTextContent("Disk not connected");
    // A missing one recorded by disk ID has no UUID, and so no page.
    const byId = screen
      .getAllByText(
        "This file system has no ID this page can use. Manage it in the classic interface.",
      )
      .map((n) => n.closest("tr"));
    expect(byId).toHaveLength(1);
    const pool = await rowOf("pool");
    // BTRFS on two disks names both (the VM has no such disks, so they are text, not links).
    expect(pool).toHaveTextContent("/dev/sde/dev/sdf");
    const array = await rowOf("array");
    expect(array).toHaveTextContent("RAID /dev/md0");
    // Markup in a label or tags is shown as text; nothing is made of it.
    expect(
      (await within(table()).findAllByText('<img src=x onerror="alert(1)">'))
        .length,
    ).toBeGreaterThan(0);
    expect(table().querySelector("img")).toBeNull();
    expect(
      within(table()).getByText("<b>tag</b>, javascript:alert(2)"),
    ).toBeInTheDocument();
    expect(within(table()).getAllByText("תמונות-משפחה")[0]).toHaveAttribute(
      "dir",
      "auto",
    );
    // A file system that also lists "/" is the system drive's row, once.
    expect(
      within(table()).getAllByText(
        "Where openmediavault is installed. It is managed by the system, not here.",
      ),
    ).toHaveLength(1);
  });

  it("marks a mount that is set up and not applied with the pending words, not a health pill", async () => {
    await list({ scenario: "fsMountPending" });
    const link = await within(table()).findByRole("link", {
      name: "Open file system EXT4 on /dev/sdd1",
    });
    const row = link.closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("Not applied yet");
    expect(row).toHaveTextContent(
      "Set up. It is mounted when the changes are applied.",
    );
    expect(row).not.toHaveTextContent("Critical");
    // A pending mount is not counted as a problem: the band says it.
    expect(screen.queryByText(/file systems?: Critical/)).toBeNull();
  });

  it("sorts by name and by usage, and says so", async () => {
    const { user } = await list({ scenario: "fsMany" });
    await rowOf("disk1");
    await user.click(screen.getByRole("button", { name: "Usage" }));
    expect(screen.getByText("Sorted by Usage, ascending")).toBeInTheDocument();
    const names = () =>
      within(table())
        .getAllByRole("link", { name: /^Open file system / })
        .map((l) => l.textContent);
    expect(names()[0]).toBe("EXT4 on /dev/sda1");
    await user.click(screen.getByRole("button", { name: "Usage" }));
    expect(names()[0]).toBe("disk19");
    await user.click(screen.getByRole("button", { name: "File system" }));
    expect(names().slice(0, 3)).toEqual(["disk1", "disk2", "disk3"]);
  });

  it("lists what is found on the disks, and mounts one through the dialog into the band", async () => {
    const { user } = await list();
    const found = await screen.findByRole("table", {
      name: "File systems found on the disks",
    });
    expect(
      screen.getByText(
        "These file systems are on the disks but not set up on this NAS. Mount one to use its files. Mounting changes nothing on the disk.",
      ),
    ).toBeInTheDocument();
    await user.click(
      within(found).getByRole("button", { name: "Mount cidata" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Mount cidata" });
    expect(dialog).toHaveTextContent(
      "Mounting makes its files reachable, so you can put shared folders on it. Nothing on the disk is changed. It is mounted when you apply the changes.",
    );
    expect(dialog).toHaveTextContent("CD or DVD");
    expect(dialog).toHaveTextContent("Labelcidata");
    // The classic mount form's default level.
    expect(
      within(dialog).getByRole("combobox", {
        name: "Warn when it is this full",
      }),
    ).toHaveTextContent("85%");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Tags" }),
      "Photos, Media, Photos",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      seenCalls.find((c) => c.call === "FileSystemMgmt.setMountPoint")?.params,
    ).toEqual({
      id: CONTRACT_EXAMPLES.fileSystemMgmtGetMountCandidates.created.value[1]
        .devicefile,
      usagewarnthreshold: 85,
      // Sorted, without repeats, joined as OMV stores them (observed).
      comment: "Media,Photos",
    });
    expect(
      await screen.findByText(
        "cidata is set up. Apply the changes to mount it.",
      ),
    ).toHaveAttribute("role", "status");
    // A CD's ID is a time stamp, not a UUID, so its row has no page and its name is text.
    const moved = await rowOf("cidata");
    expect(moved).toHaveTextContent("Not applied yet");
    expect(
      await screen.findByText(/4 changes waiting to be applied/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "File systems found on the disks" }),
    ).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Refresh" })).toHaveFocus(),
    );
  });

  it("says when another tab mounted it first, and offers Refresh", async () => {
    const { user } = await list({
      answers: { fileSystemMgmtSetMountPoint: "alreadyExists" },
    });
    const found = await screen.findByRole("table", {
      name: "File systems found on the disks",
    });
    await user.click(
      within(found).getByRole("button", { name: "Mount cidata" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("The file system was not set up."),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      CONTRACT_EXAMPLES.fileSystemMgmtSetMountPoint.alreadyExists.value.message,
    );
    expect(
      within(dialog).getByRole("button", { name: "Refresh" }),
    ).toBeVisible();
  });

  it("lists ZFS file systems, which have no UUID, as managed with their pool and with no page (ZFS 10.3)", async () => {
    // The captured mirror tank; mount candidates here also list its file systems, which OMV's never
    // do, so leaving them out is this page's own rule.
    const zfs = CONTRACT_EXAMPLES.fileSystemMgmtEnumerateFilesystems.zfs.value;
    await list({
      scenario: "fsZfs",
      answers: {
        fileSystemMgmtGetMountCandidates: {
          status: 200,
          value: zfs.filter((fs) => fs.type === "zfs"),
        },
      },
    });
    for (const name of ["tank", "tank/media"]) {
      const row = await rowOf(name);
      expect(row).toHaveTextContent("ZFS");
      expect(row).toHaveTextContent(
        "Part of the ZFS pool tank. It is managed with the pool in the classic interface, not here.",
      );
      expect(row).not.toHaveTextContent(/no ID this page can use/);
      expect(within(row).getByRole("meter")).toHaveAccessibleName(name);
      // No page, so no grow, unmount or remove; and nothing on the row itself.
      expect(
        within(row).queryByRole("link", { name: /^Open file system/ }),
      ).toBeNull();
      expect(within(row).queryByRole("button")).toBeNull();
    }
    // The file system beside them keeps its page.
    expect(
      within(table()).getByRole("link", {
        name: "Open file system EXT4 on /dev/sda1",
      }),
    ).toHaveAttribute("href", `/ui/storage/filesystems/${SDA1.uuid}`);
    // Never under "Found on the disks, not mounted", and never offered for mounting.
    for (const node of screen.getAllByText("tank/media")) {
      expect(table().contains(node)).toBe(true);
    }
    expect(screen.queryByRole("button", { name: /^Mount tank/ })).toBeNull();
  });

  it("says when it cannot look for unmounted file systems, and keeps the main table", async () => {
    await list({ scenario: "fsFoundFail" });
    expect(
      await screen.findByText(
        "Could not look for file systems that are not mounted.",
      ),
    ).toBeInTheDocument();
    expect(
      await within(table()).findByRole("link", {
        name: "Open file system EXT4 on /dev/sda1",
      }),
    ).toBeVisible();
  });

  it("offers the next step for this session's unfinished work (R8)", async () => {
    act(() => recordCreatedOn(["/dev/sdd"]));
    await list({
      answers: { fileSystemMgmtGetMountCandidates: "created" },
    });
    expect(
      await screen.findByText(
        whole("A file system on /dev/sdd is not mounted yet."),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Mount EXT4 on /dev/sdd1" }),
    ).toHaveLength(2);
    // Nothing was created and mounted here, so nothing is offered about sharing.
    expect(screen.queryByText(/nothing is shared from it yet/)).toBeNull();
  });

  it("offers how to share a file system this session created and nothing is shared from", async () => {
    act(() => recordCreated(SDA1.uuid));
    await list({ answers: { shareMgmtGetList: "empty" } });
    expect(
      await screen.findByText(
        "EXT4 on /dev/sda1 is mounted, but nothing is shared from it yet.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See how to share a folder on it" }),
    ).toHaveAttribute("href", `/ui/storage/filesystems/${SDA1.uuid}`);
  });
});
