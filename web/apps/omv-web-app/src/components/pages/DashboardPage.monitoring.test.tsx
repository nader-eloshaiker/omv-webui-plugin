// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's Phase 5 cards through the whole app on MSW serving the contract's examples and the
// mock's scenarios: Storage, Disk health, Services, Network, the Usage chart and the new attention
// rows, each in its loading, error, empty and populated states; every poll a background call (UI-14);
// disk health read only when asked (owner); backend text as text (UI-2); nothing for a normal user.
import {
  getFileSystemMgmtEnumerateMountedFilesystemsQueryKey,
  getSystemGetInformationQueryKey,
} from "@omv-webui/react-api-omv/generated";
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOUNTED_REQUEST } from "../../hooks/useMonitoringReads.ts";
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
    expect(
      within(storage).getByRole("link", {
        name: "File systems in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/storage/filesystems");
  });

  it("rolls up a file system past its level and lists it in the attention list", async () => {
    await dashboard({ scenario: "storageWarning" });
    const storage = card("Storage");
    expect(
      await within(storage).findByText("1 of 2 file systems: Warning"),
    ).toBeInTheDocument();
    const rows = within(await attention()).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(
      "Warning/dev/sda1 is 91% full, at or above its warning level of 85%.",
    );
    expect(within(rows[0]!).getByRole("link")).toHaveAttribute(
      "href",
      "/#/storage/filesystems",
    );
  });

  it("calls a full file system Critical even without a warning level", async () => {
    await dashboard({ scenario: "storageFull" });
    const rows = within(await attention()).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(
      "Criticalbackups is full. Nothing more can be saved on it until you delete or move some files.",
    );
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
    expect(within(storage).getByText("Unknown")).toBeInTheDocument();
    expect(within(storage).getAllByRole("meter")).toHaveLength(2);
    expect(
      screen.queryByRole("region", { name: "Needs attention" }),
    ).not.toBeInTheDocument();
  });

  it("shows six file systems, the rest behind a disclosure", async () => {
    const { user } = await dashboard({ scenario: "storageMany" });
    const storage = card("Storage");
    expect(await within(storage).findAllByRole("meter")).toHaveLength(6);
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
        "Missing. Its disk may be disconnected or have failed.",
      ),
    ).toBeInTheDocument();
    const rows = within(await attention()).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(
      /^Critical\/dev\/disk\/by-uuid\/\S+ is missing\. Its disk may be disconnected or have failed\. Shared folders on it cannot be reached\./,
    );
    const reads = seenCalls.filter((c) => c.call === "FileSystemMgmt.getList");
    expect(reads.length).toBeGreaterThanOrEqual(1);
    expect(reads[0]?.params).toEqual({
      start: 0,
      limit: null,
      sortfield: null,
      sortdir: null,
    });
    expect(reads.every((c) => c.background)).toBe(true);
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

describe("the Disk health card", () => {
  it("reads nothing until asked, says why, and checks every disk when asked", async () => {
    const { user } = await dashboard();
    const disks = card("Disk health");
    expect(disks).toHaveTextContent(/^Disk health.*Reading it wakes any disk/);
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
    // Unknown is not a failure: no attention row.
    expect(
      screen.queryByRole("region", { name: "Needs attention" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the result for the session when the reader leaves the dashboard and comes back", async () => {
    const { user, app } = await dashboard();
    await user.click(
      within(card("Disk health")).getByRole("button", {
        name: "Check disk health",
      }),
    );
    await within(card("Disk health")).findByText(
      "4 of 5 disks: Unknown",
      {},
      { timeout: 5000 },
    );
    await act(() => app.router.navigate({ to: "/services/ssh" }));
    await screen.findByRole("heading", { level: 1, name: "SSH" });
    await act(() => app.router.navigate({ to: "/" }));
    await screen.findByRole("heading", { level: 1, name: "Dashboard" });
    expect(
      within(card("Disk health")).getByText("4 of 5 disks: Unknown"),
    ).toBeInTheDocument();
    expect(seenCalls.filter((c) => c.call === "Smart.getListBg")).toHaveLength(
      1,
    );
  });

  it("lists failing disks and warnings in the attention list, monitored or not", async () => {
    const { user } = await dashboard({ scenario: "disksMixed" });
    await user.click(
      within(card("Disk health")).getByRole("button", {
        name: "Check disk health",
      }),
    );
    const rows = within(await attention()).getAllByRole("listitem");
    const text = rows.map((r) => r.textContent ?? "");
    expect(text[0]).toMatch(
      /^CriticalDisk \/dev\/sdc \(Example HDD 4TB\) may fail soon: Many damaged areas \(bad sectors\)\. It may fail soon\. Copy your data off it and replace it\. Monitoring is off for this disk, so the NAS will not email you about it\.Open disk \/dev\/sdcRead at /,
    );
    expect(
      within(rows[0] as HTMLElement).getByRole("link", {
        name: "Open disk /dev/sdc",
      }),
    ).toHaveAttribute("href", "/ui/storage/disks/sdc");
    expect(text[1]).toMatch(
      /^CriticalDisk \/dev\/sdd \(Example HDD 4TB\) may fail soon: It is working outside its safe limits now\./,
    );
    expect(text[2]).toMatch(
      /^WarningDisk \/dev\/sda \(Example HDD 4TB\): A few damaged areas/,
    );
    expect(text[3]).toMatch(
      /^WarningDisk \/dev\/sdb \(Example HDD 4TB\): It was once used outside its safe limits/,
    );
    for (const device of within(rows[0]!).getAllByText("/dev/sdc")) {
      expect(device.tagName).toBe("CODE");
    }
    const disks = card("Disk health");
    expect(
      within(disks).getByText("2 of 6 disks: Critical"),
    ).toBeInTheDocument();
    expect(
      within(disks).getByText(/^Monitoring is off for 2 of 6 disks\./),
    ).toBeInTheDocument();
  });

  it("says plainly when the check fails, with the server's message and a way to try again", async () => {
    const { user } = await dashboard({ scenario: "disksFail" });
    const disks = card("Disk health");
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
      within(disks).getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("says every disk is fine, with no monitoring advice, when all are good and monitored", async () => {
    const { user } = await dashboard({ scenario: "disksAllGood" });
    const disks = card("Disk health");
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
    const disks = card("Disk health");
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
  });

  it("shows a reading it does not know as text, in the mono face", async () => {
    const { user } = await dashboard({ scenario: "disksUnrecognised" });
    const disks = card("Disk health");
    await user.click(
      within(disks).getByRole("button", { name: "Check disk health" }),
    );
    const code = await within(disks).findByText(
      "<b>SOMETHING_NEW</b>",
      {},
      { timeout: 5000 },
    );
    expect(code.tagName).toBe("CODE");
    expect(disks.querySelector("b")).toBeNull();
    expect(
      within(disks).getByText(/^Health reading not recognised:/),
    ).toBeInTheDocument();
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
      "CriticalSSH is on, but not running. Computers cannot use it until it starts.",
    );
    expect(
      within(row).getByRole("link", { name: "Open SSH settings" }),
    ).toHaveAttribute("href", "/ui/services/ssh");
  });

  it("points to the logs for a plugin's service, whose settings page it does not know", async () => {
    await dashboard({ scenario: "servicePlugin" });
    const row = within(await attention()).getAllByRole("listitem")[0]!;
    expect(row).toHaveTextContent("DLNA is on, but not running.");
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
    await dashboard({ scenario: "networkWifi" });
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
    for (const call of [
      "FileSystemMgmt.enumerateMountedFilesystems",
      "FileSystemMgmt.getList",
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
    ]) {
      expect(callNames()).not.toContain(call);
    }
    for (const name of ["Storage", "Disk health", "Services", "Network"]) {
      expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
    }
  });
});

describe("the Usage chart", () => {
  it("waits for two readings, then draws them with a summary and a table of every reading", async () => {
    const { app, user } = await dashboard();
    const usage = card("Usage");
    expect(
      await within(usage).findByText(/^Not enough readings yet\./),
    ).toBeInTheDocument();
    expect(
      within(usage).queryByRole("button", { name: "Show the readings" }),
    ).not.toBeInTheDocument();
    // The shell's poll answers again: a second sample.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await act(() =>
      app.queryClient.refetchQueries({
        queryKey: getSystemGetInformationQueryKey(),
      }),
    );
    const chart = within(usage).getByRole("img", {
      name: /^Processor and memory over the last /,
    });
    await waitFor(() =>
      expect(chart).toHaveAccessibleDescription(
        /^Processor now <1%, highest <1%, lowest <1%\. Memory now 9%, highest 9%, lowest 9%\.$/,
      ),
    );
    const show = within(usage).getByRole("button", {
      name: "Show the readings",
    });
    await user.click(show);
    const table = within(usage).getByRole("table", {
      name: "Readings of the last 10 minutes, newest first",
    });
    // A header row and one row per reading.
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(show).toHaveAccessibleName("Hide the readings");
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
    expect(rows.map((r) => r.textContent?.slice(0, 20))).toEqual([
      expect.stringMatching(/^CriticalSSH is on/),
      expect.stringMatching(/^Warning\/dev\/sda1 is/),
      expect.stringMatching(/^WarningA restart/),
      expect.stringMatching(/^The NAS clock/),
    ]);
  });
});
