// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's cards through the whole app on MSW serving the contract's examples and the mock's
// scenarios: Storage (rings), Disks (the drive bay and the check), Services, Network, Right now and
// the attention cards, each in its loading, error, empty and populated states, and the answer's
// fail-closed areas; every poll a background call (UI-14); disk health read only when asked (owner);
// backend text as text (UI-2); nothing for a normal user.
import {
  getFileSystemMgmtEnumerateMountedFilesystemsQueryKey,
  getNetworkEnumerateDevicesListQueryKey,
  getSystemGetInformationQueryKey,
} from "@omv-webui/react-api-omv/generated";
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ALL_INTERFACES,
  MOUNTED_REQUEST,
} from "../../hooks/useMonitoringReads.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const NBSP = "\u00a0";

async function dashboard(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    signedIn: true,
    scenario: "checklistHidden",
    ...options,
  });
  await screen.findByRole("heading", { level: 1, name: "Dashboard" });
  return app;
}

const card = (name: string) => screen.getByRole("region", { name });
/** The page's answer: a region named by the page title. */
const answer = () => card("Dashboard");
const attention = () =>
  screen.findByRole("region", { name: "Needs attention" });

describe("the Storage card", () => {
  it("lists the system drive and the data file system with their figures and warning levels", async () => {
    await dashboard();
    const storage = card("Storage");
    const meters = await within(storage).findAllByRole("meter");
    // Both below their levels: no pill, no roll-up, and the fuller one first.
    expect(meters[0]).toHaveAccessibleName("System drive");
    expect(meters[0]).toHaveAttribute(
      "aria-valuetext",
      `10% full · 16.9${NBSP}GiB free of 19.5${NBSP}GiB`,
    );
    expect(meters[1]).toHaveAccessibleName("/dev/sda1");
    expect(
      within(storage).getByText("Where openmediavault is installed"),
    ).toBeInTheDocument();
    expect(within(storage).getByText("Warns at 85%")).toBeInTheDocument();
    expect(
      within(storage).getByText("No warning level set"),
    ).toBeInTheDocument();
    expect(
      within(storage).queryByText(/file systems:/),
    ).not.toBeInTheDocument();
    // No OK roll-up: below its level is not claimed as fine (phase 5 1.2.1).
    expect(within(storage).getByText("2 file systems")).toBeInTheDocument();
    // A ring with a page of its own is a link tile to it; the system drive is not.
    expect(
      within(storage).getByRole("link", { name: "Open file system /dev/sda1" }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/ui\/storage\/filesystems\//),
    );
    expect(
      within(storage).queryByRole("link", { name: /System drive/ }),
    ).not.toBeInTheDocument();
    expect(
      within(storage).getByRole("link", { name: "Open File systems" }),
    ).toHaveAttribute("href", "/ui/storage/filesystems");
  });

  it("shows a ZFS pool as one item for its file systems, with no link without the plugin (ZFS design 10.1)", async () => {
    await dashboard({ scenario: "fsZfs" });
    const storage = card("Storage");
    const meters = await within(storage).findAllByRole("meter");
    expect(meters).toHaveLength(3);
    const meter = within(storage).getByRole("meter", { name: "ZFS pool tank" });
    expect(meter).toHaveAttribute(
      "aria-valuetext",
      `0% full · 7.3${NBSP}GiB free of 7.3${NBSP}GiB`,
    );
    expect(
      within(storage).getByText("2 file systems share this space"),
    ).toBeInTheDocument();
    // The plugin is not known to be installed in this story: the pool's name is text.
    expect(
      within(storage).queryByRole("link", { name: "Open pool tank" }),
    ).not.toBeInTheDocument();
    // The data file system beside it keeps its link.
    expect(
      within(storage)
        .getAllByRole("link")
        .some((a) =>
          a.getAttribute("href")?.startsWith("/ui/storage/filesystems/0000"),
        ),
    ).toBe(true);
  });

  it("rolls up a file system past its level and lists it in the attention list", async () => {
    await dashboard({ scenario: "storageWarning" });
    const storage = card("Storage");
    expect(
      await within(storage).findByText("1 of 2 file systems: Warning"),
    ).toBeInTheDocument();
    const rows = within(await attention()).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(
      "Warning/dev/sda1 is almost fullIt is 91% full, at or above its warning level of 85%.",
    );
    // The file system's page when the list has it, else the File systems list (file-systems 9).
    expect(within(rows[0]!).getByRole("link").getAttribute("href")).toMatch(
      /^\/ui\/storage\/filesystems(\/|$)/,
    );
  });

  it("calls a full file system Critical even without a warning level", async () => {
    await dashboard({ scenario: "storageFull" });
    const rows = within(await attention()).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(
      "Critical“backups” is fullNothing more can be saved on it until you delete or move some files.",
    );
    expect(answer()).toHaveTextContent("1 thing needs you");
    expect(
      within(card("Storage")).getByText("1 of 3 file systems: Critical"),
    ).toBeInTheDocument();
  });

  it("never draws a file system with no reading as fine, and raises no row for it", async () => {
    await dashboard({ scenario: "storageNoReading" });
    const storage = card("Storage");
    expect(
      await within(storage).findByText("Could not read how full it is"),
    ).toBeInTheDocument();
    // A dashed ring, and no meter claiming a value.
    expect(within(storage).getAllByRole("meter")).toHaveLength(2);
    expect(
      within(answer()).getByRole("group", { name: "Health of this NAS" }),
    ).toHaveTextContent("StorageUnknown");
    expect(
      screen.queryByRole("region", { name: "Needs attention" }),
    ).not.toBeInTheDocument();
  });

  it("draws four file systems as rings, the rest behind a disclosure", async () => {
    const { user } = await dashboard({ scenario: "storageMany" });
    const storage = card("Storage");
    expect(await within(storage).findAllByRole("meter")).toHaveLength(4);
    const more = within(storage).getByRole("button", {
      name: "Show all 14 file systems",
    });
    await user.click(more);
    expect(within(storage).getAllByRole("meter")).toHaveLength(14);
    expect(more).toHaveAccessibleName("Show fewer");
    expect(more).toHaveFocus();
  });

  it("shows a file system whose disk is missing, read once from the list of every file system", async () => {
    await dashboard({ scenario: "storageMissing" });
    const storage = card("Storage");
    expect(
      await within(storage).findByText(
        "Not found. Its disk may be disconnected or have failed.",
      ),
    ).toBeInTheDocument();
    // Known to be bad without a reading: Critical, never the calm Unknown.
    expect(within(storage).getAllByText("Critical").length).toBeGreaterThan(0);
    const rows = within(await attention()).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(
      /^Critical\/dev\/disk\/by-uuid\/\S+ is missingIts disk may be disconnected or have failed\. Shared folders on it cannot be reached\./,
    );
    const reads = seenCalls.filter((c) => c.call === "FileSystemMgmt.getList");
    expect(reads.length).toBeGreaterThanOrEqual(1);
    expect(reads[0]?.params).toEqual({
      start: 0,
      limit: null,
      sortfield: null,
      sortdir: null,
    });
    // Read on opening, never polled: the Storage card and the Disks card's inventory share the entry.
    expect(reads.length).toBeLessThanOrEqual(2);
  });

  it("says when no file system is mounted", async () => {
    await dashboard({ scenario: "storageEmpty" });
    expect(
      await within(card("Storage")).findByText(
        /^No file systems are mounted\./,
      ),
    ).toBeInTheDocument();
  });

  it("says plainly when the file systems were never read, and reads again in the foreground", async () => {
    let fail = true;
    const { user } = await dashboard({
      answers: {
        fileSystemMgmtEnumerateMountedFilesystems: () =>
          fail ? { status: 500, message: "<i>df</i> failed." } : "withRoot",
      },
    });
    const storage = card("Storage");
    const alert = await within(storage).findByRole("alert");
    expect(alert).toHaveTextContent("Could not read the file systems.");
    expect(alert).toHaveTextContent("<i>df</i> failed.");
    expect(alert.querySelector("i")).toBeNull();
    fail = false;
    const before = seenCalls.length;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await within(storage).findAllByRole("meter")).toHaveLength(2);
    const retry = seenCalls
      .slice(before)
      .find((c) => c.call === "FileSystemMgmt.enumerateMountedFilesystems");
    expect(retry?.background).toBe(false);
  });

  it("keeps its items when a background read fails, and says since when", async () => {
    let fail = false;
    const { app } = await dashboard({
      answers: {
        fileSystemMgmtEnumerateMountedFilesystems: () =>
          fail ? { status: 500, message: "Busy." } : "withRoot",
      },
    });
    const storage = card("Storage");
    await within(storage).findAllByRole("meter");
    fail = true;
    await act(() =>
      app.queryClient.refetchQueries({
        queryKey:
          getFileSystemMgmtEnumerateMountedFilesystemsQueryKey(MOUNTED_REQUEST),
      }),
    );
    const stale = await within(storage).findByText(/^Could not update since /);
    expect(stale).toHaveAttribute("role", "status");
    expect(within(storage).getAllByRole("meter")).toHaveLength(2);
    expect(
      within(storage).getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});

describe("the Disks card", () => {
  it("shows every disk as Not checked, reads nothing until asked, says why, and checks every disk when asked", async () => {
    const { user } = await dashboard();
    const disks = card("Disks");
    const bay = await within(disks).findByRole("figure", {
      name: "The disks in this NAS",
    });
    const slots = within(bay).getAllByRole("listitem");
    expect(slots).toHaveLength(6);
    // Said once in the header; each slot keeps the word for screen readers only.
    for (const slot of slots) {
      expect(within(slot).getByText("Not checked")).toHaveClass("sr-only");
    }
    expect(slots[0]).toHaveTextContent(/^nvme0n1Not checked/);
    expect(within(bay).getByRole("link", { name: /^sda/ })).toHaveAttribute(
      "href",
      "/ui/storage/disks/sda",
    );
    expect(disks).toHaveTextContent("6 disks · health not checked yet");
    // The why is one click away.
    await user.click(
      within(disks).getByRole("button", { name: "Why do I have to ask?" }),
    );
    expect(within(disks).getByText(/Reading it wakes any disk/)).toBeVisible();
    expect(callNames()).toContain("DiskMgmt.getList");
    expect(callNames()).not.toContain("Smart.getListBg");
    const button = within(disks).getByRole("button", {
      name: "Check disk health",
    });
    await user.click(button);
    expect(
      await within(disks).findByText(
        "4 of 5 disks: Unknown",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    // The same button, now "Check again", keeps focus.
    expect(button).toHaveAccessibleName("Check again");
    expect(button).toHaveFocus();
    const start = seenCalls.find((c) => c.call === "Smart.getListBg");
    expect(start?.background).toBe(false);
    expect(start?.params).toEqual({
      start: 0,
      limit: null,
      sortfield: null,
      sortdir: null,
    });
    // The bay shows each disk's word; a disk the check did not list has no reading.
    const after = within(bay).getAllByRole("listitem");
    expect(after[0]).toHaveTextContent(/^nvme0n1OK/);
    expect(after[1]).toHaveTextContent(/^sdaUnknown/);
    expect(after[5]).toHaveTextContent(/^sr0No reading/);

    await user.click(
      within(disks).getByRole("button", { name: "Disk details" }),
    );
    const list = within(disks).getByRole("list", { name: "Disks" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    // Worst first (Unknown above OK), then by device.
    expect(items[0]).toHaveTextContent(
      "Unknown/dev/sdaVMware Virtual SATA Hard Drive, 8.0 GiBIts health could not be read.Monitoring off",
    );
    expect(items[4]).toHaveTextContent(
      "OK/dev/nvme0n1VMware Virtual NVMe Disk, 20.0 GiB · 30 °CMonitoring off",
    );
    expect(
      within(disks).getByText(/^Monitoring is off for every disk\./),
    ).toBeInTheDocument();
    // The links lead to this interface's own pages (disks design 8).
    expect(
      within(disks).getByRole("link", { name: "Set up disk monitoring" }),
    ).toHaveAttribute("href", "/ui/storage/smart/set-up");
    expect(
      within(disks).getByRole("link", { name: "Open Disk health" }),
    ).toHaveAttribute("href", "/ui/storage/smart/overview");
    expect(
      within(disks).getByRole("link", { name: "Open Disks" }),
    ).toHaveAttribute("href", "/ui/storage/disks");
    expect(
      within(disks).getByRole("link", { name: "Open disk /dev/sda" }),
    ).toHaveAttribute("href", "/ui/storage/disks/sda");
    expect(within(disks).queryByText(/Turn it on in Settings/)).toBeNull();
    expect(
      within(disks).getByText(
        /^Checked at .*The readings do not update by themselves\.$/,
      ),
    ).toBeInTheDocument();
    expect(within(disks).getByRole("status")).toHaveTextContent(
      "Disk health checked: 4 of 5 disks: Unknown",
    );
    // No serial number or WWN on the dashboard.
    expect(disks).not.toHaveTextContent("EXAMPLE-SERIAL");
    // Unknown is not a failure: no attention card.
    expect(
      screen.queryByRole("region", { name: "Needs attention" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the result for the session when the reader leaves the dashboard and comes back", async () => {
    const { user, app } = await dashboard();
    await user.click(
      within(card("Disks")).getByRole("button", {
        name: "Check disk health",
      }),
    );
    await within(card("Disks")).findByText(
      "4 of 5 disks: Unknown",
      {},
      { timeout: 5000 },
    );
    await act(() => app.router.navigate({ to: "/services/ssh" }));
    await screen.findByRole("heading", { level: 1, name: "SSH" });
    await act(() => app.router.navigate({ to: "/" }));
    await screen.findByRole("heading", { level: 1, name: "Dashboard" });
    expect(
      within(card("Disks")).getByText("4 of 5 disks: Unknown"),
    ).toBeInTheDocument();
    expect(seenCalls.filter((c) => c.call === "Smart.getListBg")).toHaveLength(
      1,
    );
  });

  it("lists failing disks and warnings as attention cards, monitored or not", async () => {
    const { user } = await dashboard({ scenario: "disksMixed" });
    await user.click(
      within(card("Disks")).getByRole("button", {
        name: "Check disk health",
      }),
    );
    const rows = within(await attention()).getAllByRole("listitem");
    const text = rows.map((r) => r.textContent ?? "");
    expect(text[0]).toMatch(
      /^CriticalDisk \/dev\/sdc may fail soonMany damaged areas \(bad sectors\)\. It may fail soon\. Copy your data off it and replace it\. \(\u2068Example HDD 4TB\u2069\) Monitoring is off for this disk, so the NAS will not email you about it\.Open disk \/dev\/sdcRead at /,
    );
    expect(
      within(rows[0] as HTMLElement).getByRole("link", {
        name: "Open disk /dev/sdc",
      }),
    ).toHaveAttribute("href", "/ui/storage/disks/sdc");
    expect(text[1]).toMatch(
      /^CriticalDisk \/dev\/sdd may fail soonIt is working outside its safe limits now\./,
    );
    expect(text[2]).toMatch(
      /^WarningDisk \/dev\/sda reported a problemA few damaged areas/,
    );
    expect(text[3]).toMatch(
      /^WarningDisk \/dev\/sdb reported a problemIt was once used outside its safe limits/,
    );
    for (const device of within(rows[0]!).getAllByText("/dev/sdc")) {
      expect(device.tagName).toBe("CODE");
    }
    const disks = card("Disks");
    expect(
      within(disks).getByText("2 of 6 disks: Critical"),
    ).toBeInTheDocument();
    expect(
      within(disks).getByText(/^Monitoring is off for 2 of 6 disks\./),
    ).toBeInTheDocument();
    // The answer counts the cards and names the worst.
    expect(answer()).toHaveTextContent("4 things need you");
    expect(answer()).toHaveTextContent(
      "Worst first: Disk /dev/sdc may fail soon.",
    );
  });

  it("says plainly when the check fails, with the server's message and a way to check again", async () => {
    const { user } = await dashboard({ scenario: "disksFail" });
    const disks = card("Disks");
    await user.click(
      within(disks).getByRole("button", { name: "Check disk health" }),
    );
    const alert = await within(disks).findByRole(
      "alert",
      {},
      { timeout: 5000 },
    );
    expect(alert).toHaveTextContent("Could not check disk health.");
    expect(alert).toHaveTextContent("smartctl");
    expect(alert).not.toHaveTextContent("mock trace");
    expect(
      within(disks).getByRole("button", { name: "Check again" }),
    ).toBeInTheDocument();
    // The answer names the area that could not be read, and never claims it fine.
    expect(answer()).toHaveTextContent("Part of the NAS could not be read");
    expect(answer()).toHaveTextContent("Could not read: Disks.");
  });

  it("says every disk is fine, with no monitoring advice, when all are good and monitored", async () => {
    const { user } = await dashboard({ scenario: "disksAllGood" });
    const disks = card("Disks");
    await user.click(
      within(disks).getByRole("button", { name: "Check disk health" }),
    );
    expect(
      await within(disks).findByText("3 disks: OK", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(within(disks).queryByText(/Monitoring/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Needs attention" }),
    ).not.toBeInTheDocument();
  });

  it("says when no disk reports its health", async () => {
    const { user } = await dashboard({ scenario: "disksEmpty" });
    const disks = card("Disks");
    await user.click(
      within(disks).getByRole("button", { name: "Check disk health" }),
    );
    expect(
      await within(disks).findByText(
        /^No disk reported its health\./,
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    const bay = within(disks).getByRole("figure", {
      name: "The disks in this NAS",
    });
    for (const slot of within(bay).getAllByRole("listitem")) {
      expect(slot).toHaveTextContent("No reading");
    }
  });

  it("shows a reading it does not know as text, in the mono face", async () => {
    const { user } = await dashboard({ scenario: "disksUnrecognised" });
    const disks = card("Disks");
    await user.click(
      within(disks).getByRole("button", { name: "Check disk health" }),
    );
    await user.click(
      await within(disks).findByRole(
        "button",
        { name: "Disk details" },
        { timeout: 5000 },
      ),
    );
    const code = within(disks).getByText("<b>SOMETHING_NEW</b>");
    expect(code.tagName).toBe("CODE");
    expect(disks.querySelector("b")).toBeNull();
    expect(
      within(disks).getByText(/^Health reading not recognised:/),
    ).toBeInTheDocument();
  });

  it("says what each disk holds only when that is known without waking a disk", async () => {
    // Without the RAID and ZFS plugins, the reads that wake no disk say it all.
    await dashboard({ scenario: "disksNoRaidPlugin" });
    const bay = await within(card("Disks")).findByRole("figure", {
      name: "The disks in this NAS",
    });
    await waitFor(() =>
      expect(within(bay).getAllByRole("listitem")[0]).toHaveTextContent(
        /^nvme0n1Not checkedSystem/,
      ),
    );
    // Nothing that reads a member disk is asked from the dashboard (RAID 0.5, ZFS 10).
    expect(callNames()).not.toContain("MdMgmt.enumerateDevices");
    expect(callNames()).not.toContain("Zfs.getPoolDevices");
  });

  it("fails closed: no role at all while the RAID plugin is installed, or a read failed", async () => {
    // The default story has the RAID plugin: its arrays are not read here, so no disk is "Empty".
    await dashboard();
    const bay = await within(card("Disks")).findByRole("figure", {
      name: "The disks in this NAS",
    });
    await waitFor(() =>
      expect(callNames()).toContain("FileSystemMgmt.enumerateFilesystems"),
    );
    expect(bay).not.toHaveTextContent("Empty");
    expect(bay).not.toHaveTextContent("System");
    expect(callNames()).not.toContain("MdMgmt.enumerateDevices");
  });

  it("fails closed when the file systems could not be read, even without the plugins", async () => {
    await dashboard({
      scenario: "disksNoRaidPlugin",
      answers: {
        fileSystemMgmtEnumerateFilesystems: {
          status: 500,
          message: "blkid failed.",
        },
      },
    });
    const bay = await within(card("Disks")).findByRole("figure", {
      name: "The disks in this NAS",
    });
    await waitFor(() =>
      expect(callNames()).toContain("FileSystemMgmt.enumerateFilesystems"),
    );
    expect(bay).not.toHaveTextContent("Empty");
    expect(bay).not.toHaveTextContent("System");
  });

  it("says when the disks could not be read, and the check still works", async () => {
    await dashboard({
      answers: {
        diskMgmtGetList: { status: 500, message: "<i>udev</i> failed." },
      },
    });
    const disks = card("Disks");
    const alert = await within(disks).findByRole("alert");
    expect(alert).toHaveTextContent("Could not read the disks.");
    expect(alert).toHaveTextContent("<i>udev</i> failed.");
    expect(alert.querySelector("i")).toBeNull();
    expect(
      within(disks).getByRole("button", { name: "Check disk health" }),
    ).toBeEnabled();
  });
});

describe("the answer", () => {
  it("says Everything is OK only after a disk check this session, and moves focus to it when its button goes", async () => {
    const { user } = await dashboard({ scenario: "disksAllGood" });
    expect(
      await within(answer()).findByText("No problems found"),
    ).toBeVisible();
    expect(answer()).not.toHaveTextContent("Everything is OK");
    const button = within(answer()).getByRole("button", {
      name: "Check disk health",
    });
    await user.click(button);
    const headline = await within(answer()).findByText(
      "Everything is OK",
      {},
      { timeout: 5000 },
    );
    expect(answer()).toHaveTextContent(
      /Disk health was checked at .*\. The rest is read while this page is open\./,
    );
    expect(
      within(answer()).queryByRole("button", { name: /Check/ }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(headline).toHaveFocus());
    // Announced once, by the Disks card's live region.
    expect(within(card("Disks")).getByRole("status")).toHaveTextContent(
      "Disk health checked: 3 disks: OK",
    );
  });

  it("fails closed: a services read that failed is Could not read, never fine, with a foreground retry", async () => {
    let fail = true;
    const { user } = await dashboard({
      answers: {
        servicesGetStatus: () =>
          fail ? { status: 500, message: "systemctl failed." } : "sshOnly",
      },
    });
    await within(card("Services")).findByRole("alert");
    expect(answer()).toHaveTextContent("Part of the NAS could not be read");
    expect(answer()).toHaveTextContent("Could not read: Services.");
    expect(answer()).not.toHaveTextContent("systemctl failed.");
    expect(
      within(answer()).getByRole("group", { name: "Health of this NAS" }),
    ).toHaveTextContent("ServicesCould not read");
    // No card claims a service is down from a read that failed.
    expect(
      screen.queryByRole("region", { name: "Needs attention" }),
    ).not.toBeInTheDocument();
    fail = false;
    const before = seenCalls.length;
    await user.click(
      within(answer()).getByRole("button", { name: "Try again" }),
    );
    await waitFor(() =>
      expect(answer()).toHaveTextContent("No problems found"),
    );
    const retry = seenCalls
      .slice(before)
      .find((c) => c.call === "Services.getStatus");
    expect(retry?.background).toBe(false);
  });

  it("says there is nowhere to keep files yet, and leads to Add storage", async () => {
    await dashboard({ scenario: "storageEmpty" });
    await within(card("Storage")).findByText(/^No file systems are mounted\./);
    expect(answer()).toHaveTextContent("No problems found");
    expect(answer()).toHaveTextContent(
      "There is no file system yet, so the NAS has nowhere to keep files.",
    );
    expect(
      within(answer()).getByRole("link", { name: "Add storage" }),
    ).toHaveAttribute("href", "/ui/storage/filesystems/add");
  });
});

describe("the Services card", () => {
  it("lists the services that are on and summarises the ones that are off", async () => {
    await dashboard();
    const services = card("Services");
    expect(
      await within(services).findByText("The 1 service that is on is running"),
    ).toBeInTheDocument();
    const list = within(services).getByRole("list", {
      name: "Services that are on",
    });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["OKSSH"]);
    // Joined as the locale joins a list.
    expect(within(services).getByText(/^Off: /)).toHaveTextContent(
      /^Off: NFS, RSync server,? and SMB\/CIFS\.$/,
    );
    expect(
      within(services).getByRole("link", { name: "Service details" }),
    ).toHaveAttribute("href", "/ui/diagnostics/services");
  });

  it("raises one attention row for a service that is on but not running, with its settings", async () => {
    await dashboard({ scenario: "serviceDown" });
    const services = card("Services");
    expect(
      await within(services).findByText(
        "1 of 2 services that are on: Critical",
      ),
    ).toBeInTheDocument();
    const row = within(await attention()).getAllByRole("listitem")[0]!;
    expect(row).toHaveTextContent(
      "CriticalSSH is not runningIt is turned on, but it has stopped. Computers cannot use it until it starts.",
    );
    expect(
      within(row).getByRole("link", { name: "Open SSH settings" }),
    ).toHaveAttribute("href", "/ui/services/ssh");
  });

  it("points to the logs for a plugin's service, whose settings page it does not know", async () => {
    await dashboard({ scenario: "servicePlugin" });
    const row = within(await attention()).getAllByRole("listitem")[0]!;
    expect(row).toHaveTextContent("DLNA is not running");
    expect(
      within(row).getByRole("link", {
        name: "Look for the reason in the system logs",
      }),
    ).toHaveAttribute("href", "/ui/diagnostics/system-logs");
  });

  it("marks a service saved but not applied as pending, not as down", async () => {
    await dashboard({ scenario: "servicePending" });
    const services = card("Services");
    const list = await within(services).findByRole("list", {
      name: "Services that are on",
    });
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent(
      "Not applied yetSMB/CIFSChanged settings are waiting to be applied.",
    );
    // The SMB row's name leads to the Windows and Mac sharing page (shares design 9.2).
    expect(
      within(list).getByRole("link", { name: "SMB/CIFS" }),
    ).toHaveAttribute("href", "/ui/services/smb");
    expect(within(services).queryByText(/Critical/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Needs attention" }),
    ).not.toBeInTheDocument();
  });

  it("says when no service is on", async () => {
    await dashboard({ scenario: "servicesNoneOn" });
    const services = card("Services");
    expect(
      await within(services).findByText(/^No services are on\./),
    ).toBeInTheDocument();
    expect(within(services).getByText(/^Off: /)).toHaveTextContent("SSH");
  });

  it("says plainly when the services were never read", async () => {
    await dashboard({
      answers: {
        servicesGetStatus: { status: 500, message: "systemctl failed." },
      },
    });
    const alert = await within(card("Services")).findByRole("alert");
    expect(alert).toHaveTextContent("Could not read the services.");
    expect(alert).toHaveTextContent("systemctl failed.");
  });
});

describe("the Network card", () => {
  it("shows each port's connection and addresses, without the loopback interface", async () => {
    await dashboard();
    const network = card("Network");
    expect(await within(network).findByText("enp2s0")).toBeInTheDocument();
    expect(network).toHaveTextContent("enp2s0Ethernet");
    expect(network).toHaveTextContent("Connected at 1 Gbit/s");
    expect(network).toHaveTextContent("IPv4192.0.2.10/24");
    expect(network).toHaveTextContent("IPv6fe80::200:5eff:fe00:5301/64");
    expect(within(network).queryByText("lo")).not.toBeInTheDocument();
    // Not shown: the MAC address.
    expect(network).not.toHaveTextContent("00:00:5e:00:53:01");
  });

  it("states an unplugged port as a fact, with no status", async () => {
    await dashboard({ scenario: "networkTwoPorts" });
    const network = card("Network");
    expect(
      await within(network).findByText("Not connected"),
    ).toBeInTheDocument();
    expect(network).toHaveTextContent(
      "enp3s0EthernetNot connectedIPv4No addressIPv6No address",
    );
    expect(network.querySelector("[data-slot=status-pill]")).toBeNull();
  });

  it("counts the virtual interfaces instead of listing them", async () => {
    await dashboard({ scenario: "networkVirtual" });
    const network = card("Network");
    expect(
      await within(network).findByText(
        "Also 12 virtual interfaces, used by containers or VPNs, not shown.",
      ),
    ).toBeInTheDocument();
    expect(within(network).queryByText(/^veth/)).not.toBeInTheDocument();
  });

  it("says Connected when the speed is not reported, and No address without IPv6", async () => {
    await dashboard({ scenario: "networkNoIpv6" });
    const network = card("Network");
    expect(await within(network).findByText("bond0")).toBeInTheDocument();
    expect(network).toHaveTextContent(
      "bond0BondConnectedIPv4192.0.2.10/24IPv6No address",
    );
  });

  it("names a Wi-Fi interface and never shows its key", async () => {
    await dashboard({ scenario: "networkWifiDown" });
    const network = card("Network");
    expect(await within(network).findByText("wlp3s0")).toBeInTheDocument();
    expect(network).toHaveTextContent("wlp3s0Wi-FiNot connected");
    // Neither as text nor in any attribute.
    expect(document.body.textContent).not.toContain("EXAMPLE-PASSWORD");
    for (const element of document.body.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(attribute.value).not.toContain("EXAMPLE-PASSWORD");
      }
    }
  });
});

describe("the dashboard's reads", () => {
  it("polls every card in the background, and a normal user's dashboard reads none of them", async () => {
    await dashboard();
    await within(card("Network")).findByText("enp2s0");
    // The polled reads. FileSystemMgmt.getList and the disk inventory are read on opening only.
    for (const call of [
      "FileSystemMgmt.enumerateMountedFilesystems",
      "Services.getStatus",
      "Network.enumerateDevicesList",
    ]) {
      const calls = seenCalls.filter((c) => c.call === call);
      expect(calls.length, call).toBeGreaterThan(0);
      expect(
        calls.every((c) => c.background),
        call,
      ).toBe(true);
    }
    const network = seenCalls.find(
      (c) => c.call === "Network.enumerateDevicesList",
    );
    expect(network?.params).toEqual({
      start: 0,
      limit: null,
      sortfield: "devicename",
      sortdir: "asc",
    });
    const mounted = seenCalls.find(
      (c) => c.call === "FileSystemMgmt.enumerateMountedFilesystems",
    );
    expect(mounted?.params).toEqual({ includeroot: true });
  });

  it("makes none of these calls for a normal user", async () => {
    await renderApp({ signedIn: true, scenario: "user" });
    await screen.findByRole("region", { name: "This NAS" });
    for (const call of [
      "FileSystemMgmt.enumerateMountedFilesystems",
      "FileSystemMgmt.getList",
      "Services.getStatus",
      "Network.enumerateDevicesList",
      "Smart.getListBg",
      "DiskMgmt.getList",
    ]) {
      expect(callNames()).not.toContain(call);
    }
    for (const name of [
      "Storage",
      "Disks",
      "Services",
      "Network",
      "Right now",
    ]) {
      expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
    }
  });
});

describe("Right now", () => {
  it("draws the session's samples, says the span it covers, and lists every reading", async () => {
    const { app, user } = await dashboard();
    const live = card("Right now");
    // The session already has the shell's first sample: a lone point, "the last 0 s".
    expect(
      await within(live).findByText(/^Processor over the last 0 s: now <1%/),
    ).toBeInTheDocument();
    // A rate needs two readings of the counters.
    expect(
      within(within(live).getByRole("group", { name: "Network" })).getAllByText(
        "Waiting for a second reading",
      ).length,
    ).toBeGreaterThan(0);
    // The shell's poll answers again: a second sample of each.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await act(async () => {
      await app.queryClient.refetchQueries({
        queryKey: getSystemGetInformationQueryKey(),
      });
      await app.queryClient.refetchQueries({
        queryKey: getNetworkEnumerateDevicesListQueryKey(ALL_INTERFACES),
      });
    });
    expect(
      await within(live).findByText(
        /^Processor over the last \d+ s: now <1%, highest <1%, lowest <1%\.$/,
      ),
    ).toBeInTheDocument();
    expect(
      within(live).getByText(
        /^Memory over the last \d+ s: now 9%, highest 9%, lowest 9%\.$/,
      ),
    ).toBeInTheDocument();
    expect(
      await within(live).findByText(
        /^Network on enp2s0 over the last \d+ s: in now .+ KiB\/s, highest .+; out now .+, highest .+\.$/,
      ),
    ).toBeInTheDocument();
    expect(
      within(live).getByRole("group", { name: "Network" }),
    ).toHaveTextContent(/In.*Out.*KiB\/s/);
    const show = within(live).getByRole("button", {
      name: "Show the readings",
    });
    await user.click(show);
    const table = await within(live).findByRole("table", {
      name: "Readings shown above, newest first",
    });
    // A header row and one row per reading.
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(show).toHaveAccessibleName("Hide the readings");
  });

  it("says plainly when the live read failed, and keeps what it drew", async () => {
    let fail = false;
    const { app } = await dashboard({
      answers: {
        systemGetInformation: () =>
          fail ? { status: 500, message: "Busy." } : "adminWelcomeDismissed",
      },
    });
    const live = card("Right now");
    await within(live).findByText(/^Processor over the last/);
    fail = true;
    await act(() =>
      app.queryClient.refetchQueries({
        queryKey: getSystemGetInformationQueryKey(),
      }),
    );
    const stale = await within(live).findByText(/^Could not read since /);
    expect(stale).toHaveAttribute("role", "status");
    expect(
      within(live).getByRole("group", { name: "Processor" }),
    ).toHaveTextContent("<1 %");
  });
});

describe("the attention list's order", () => {
  it("puts file system problems before services, and both before a restart", async () => {
    await dashboard({
      scenario: "attention",
      answers: {
        fileSystemMgmtEnumerateMountedFilesystems: "nearlyFull",
        servicesGetStatus: "serviceStopped",
      },
    });
    const list = await attention();
    await waitFor(() =>
      expect(within(list).getAllByRole("listitem")).toHaveLength(4),
    );
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent?.slice(0, 32))).toEqual([
      expect.stringMatching(/^CriticalSSH is not running/),
      expect.stringMatching(/^Warning\/dev\/sda1 is almost full/),
      expect.stringMatching(/^WarningThe NAS needs a restart/),
      expect.stringMatching(/^The clocks differ by/),
    ]);
  });
});
