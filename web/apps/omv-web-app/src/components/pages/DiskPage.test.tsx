// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's page through the whole app on MSW (phase 5 disks design 2.1 to 2.3, 2.9): the address only
// selects a disk, which the page finds in DiskMgmt.getList and then names by the row's stable device
// file in every call (UI-3, UI-4); a value that fails the pattern makes no call; the summary card's
// facts; and a normal user kept off the page without a call.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { answer, callNames, seenCalls } from "../../test/server.ts";

const VM = CONTRACT_EXAMPLES.diskMgmtGetList.vmDisks.value;
const WAKING = [
  "Smart.getInformation",
  "Smart.getAttributes",
  "Smart.getSelfTestLogs",
  "Smart.getExtendedInformation",
  "Smart.getListBg",
  "Smart.executeScheduledTest",
  "Smart.enumerateDevices",
  "Smart.enumerateMonitoredDevices",
];

async function diskPage(
  disk: string,
  options: Parameters<typeof renderApp>[0] = {},
) {
  const app = await renderApp({
    signedIn: true,
    path: `/storage/disks/${disk}`,
    ...options,
  });
  return app;
}

/** The summary card's value for a label. */
function fact(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: "dt" });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement)) {
    throw new Error(`No value for ${label}`);
  }
  return value;
}

describe("a disk's page", () => {
  it("keeps a right-to-left model in its own isolate in the subtitle", async () => {
    await diskPage("sdd", { scenario: "disksHostile" });
    await screen.findByRole("heading", { level: 1, name: "Disk /dev/sdd" });
    const subtitle = screen.getByText(
      (_, element) =>
        element?.tagName === "P" &&
        /^قرص تخزين خارجي, 3\.6\sTiB$/.test(element.textContent),
    );
    expect(within(subtitle).getByText("قرص تخزين خارجي").tagName).toBe("BDI");
  });

  it("names the disk by its device, with breadcrumbs, and calls with the row's stable device file", async () => {
    await diskPage("sdb");
    const title = await screen.findByRole("heading", {
      level: 1,
      name: "Disk /dev/sdb",
    });
    expect(within(title).getByText("/dev/sdb").tagName).toBe("CODE");
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Disks" })).toHaveAttribute(
      "href",
      "/ui/storage/disks",
    );
    const current = within(crumbs).getByText("/dev/sdb");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.closest("a")).toBeNull();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          /^VMware Virtual SATA Hard Drive, 8\.0\sGiB$/.test(
            element.textContent,
          ),
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(document.title).toBe("/dev/sdb – Disks – openmediavault"),
    );
    // The serial number is on the page, never in the title.
    expect(document.title).not.toContain("EXAMPLE-SERIAL");
    await waitFor(() =>
      expect(callNames()).toContain("Smart.getDeviceSettings"),
    );
    const asked = seenCalls
      .filter((c) => c.call === "Smart.getDeviceSettings")
      .map((c) => (c.params as { devicefile: string }).devicefile);
    expect(asked).toContain(
      "/dev/disk/by-id/ata-VMware_Virtual_SATA_Hard_Drive_EXAMPLE-SERIAL-0003",
    );
    // Every disk is named by a stable device file from the reply, never by the address.
    for (const devicefile of asked) {
      expect(devicefile).toMatch(/^\/dev\/disk\/by-id\//);
    }
    // Nothing that wakes a disk is read on opening the page.
    for (const call of WAKING) {
      expect(callNames()).not.toContain(call);
    }
    // The menu marks Disks.
    expect(
      screen
        .getByRole("navigation", { name: "Main navigation" })
        .querySelector('[aria-current="page"]'),
    ).toHaveTextContent("Disks");
  });

  it.each(["SDA", "..%2F..%2Frpc", "sda1%3Bx", "cciss!c0d0"])(
    "makes no call at all for an address value that fails the pattern (%s)",
    async (value) => {
      await diskPage(value);
      expect(
        await screen.findByText("This disk is not connected."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Show all disks" }),
      ).toHaveAttribute("href", "/ui/storage/disks");
      expect(
        callNames().filter(
          (c) =>
            c.startsWith("DiskMgmt.") ||
            c.startsWith("Smart.") ||
            c.startsWith("FileSystemMgmt.") ||
            // The shell's one probe of the RAID plugin for the menu is not about this disk.
            (c.startsWith("MdMgmt.") && c !== "MdMgmt.getCandidates"),
        ),
      ).toEqual([]);
    },
  );

  it("says no disk of that name is connected, and makes no disk-specific call", async () => {
    await diskPage("sdz");
    expect(
      await screen.findByText(
        "No disk called sdz is connected. Its name may have changed when the NAS restarted.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Disks" }),
    ).toBeVisible();
    expect(callNames()).toContain("DiskMgmt.getList");
    expect(callNames().filter((c) => c.startsWith("Smart."))).toEqual([]);
  });

  it("shows the server's message when the disks cannot be read, and reads again on Try again", async () => {
    const { user } = await diskPage("sdb", { scenario: "disksReadFails" });
    expect(
      await screen.findByText("Could not read this disk."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Failed to read the list of disks: lsblk exited with code 1.",
      ),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("mock trace");
    const reads = () =>
      seenCalls.filter((c) => c.call === "DiskMgmt.getList").length;
    const before = reads();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });

  it("shows the not-found state when the disk is gone after a re-read", async () => {
    const { app } = await diskPage("sdd");
    await screen.findByRole("heading", { level: 1, name: "Disk /dev/sdd" });
    const without = {
      ...VM,
      total: 5,
      data: VM.data.filter((d) => d.devicename !== "sdd"),
    };
    answer({ diskMgmtGetList: { status: 200, value: without } });
    await act(() => app.queryClient.invalidateQueries());
    expect(
      await screen.findByText(/^No disk called sdd is connected\./),
    ).toBeInTheDocument();
  });

  it("keeps a normal user off the page without asking the server (UI-4)", async () => {
    await diskPage("sda", { scenario: "user" });
    expect(
      await screen.findByText(
        "Only administrators can open this page. Your account is a normal user account.",
      ),
    ).toBeInTheDocument();
    expect(
      callNames().filter(
        (c) =>
          c.startsWith("DiskMgmt.") ||
          c.startsWith("Smart.") ||
          c.startsWith("FileSystemMgmt."),
      ),
    ).toEqual([]);
  });
});

describe("the summary card", () => {
  it("states what the disk holds and how to recognise it", async () => {
    const { user } = await diskPage("sda");
    await screen.findByRole("heading", { level: 1, name: "Disk /dev/sda" });
    await waitFor(() =>
      expect(fact("Used for")).toHaveTextContent(
        "File system EXT4 on /dev/sda1, in useShared folders or services use it.",
      ),
    );
    expect(fact("Health")).toHaveTextContent(
      "Not checked this session.Check disk health on the Disk health page",
    );
    expect(
      within(fact("Health")).getByRole("link", {
        name: "Check disk health on the Disk health page",
      }),
    ).toHaveAttribute("href", "/ui/storage/smart/overview");
    expect(fact("Temperature")).toHaveTextContent("Not read");
    expect(fact("Power")).toHaveTextContent("Awake");
    // "ATA" is the bus, not a maker: the model alone.
    expect(fact("Model")).toHaveTextContent(/^VMware Virtual SATA Hard Drive$/);
    expect(
      within(fact("Serial number")).getByText("EXAMPLE-SERIAL-0002").tagName,
    ).toBe("CODE");
    expect(
      within(fact("Serial number")).getByRole("button", {
        name: "Copy serial number",
      }),
    ).toBeInTheDocument();
    expect(fact("Size")).toHaveTextContent("8.0 GiB (8.6 GB on the label)");
    expect(fact("Connection")).toHaveTextContent(
      "Removable while running (USB or a hot-swap bay)",
    );

    const names = screen.getByRole("button", {
      name: "Other names for this disk",
    });
    await user.click(names);
    expect(
      screen.getByText(
        "The device name (/dev/sda) can change when the NAS restarts. These names stay the same.",
      ),
    ).toBeVisible();
    expect(fact("Stable name")).toHaveTextContent(
      "/dev/disk/by-id/ata-VMware_Virtual_SATA_Hard_Drive_EXAMPLE-SERIAL-0002",
    );
    expect(fact("Other names")).toHaveTextContent("/dev/disk/by-diskseq/2");
    expect(fact("World Wide Name")).toHaveTextContent("EXAMPLE-WWN-0002");
    expect(names).toHaveAccessibleName("Hide other names");
  });

  it("reads the cached temperature, and the system disk's facts", async () => {
    await diskPage("nvme0n1");
    await screen.findByRole("heading", { level: 1, name: "Disk /dev/nvme0n1" });
    expect(fact("Temperature")).toHaveTextContent(/^30\s°C$/);
    expect(fact("Power")).toHaveTextContent("Not reported");
    expect(fact("Connection")).toHaveTextContent("Built in");
    await waitFor(() =>
      expect(fact("Used for")).toHaveTextContent(
        /^System disk \(openmediavault runs from it\)/,
      ),
    );
  });

  it("says a disk is asleep in words, with no reading taken", async () => {
    await diskPage("sdb", { scenario: "disksAsleep" });
    await screen.findByRole("heading", { level: 1, name: "Disk /dev/sdb" });
    expect(fact("Power")).toHaveTextContent("Asleep (spun down)");
    expect(fact("Temperature")).toHaveTextContent("Not read");
  });

  it.each([
    [40, "Warning", "At or above its limit of 40 °C"],
    [35, "Critical", "At or above its alert level of 40 °C"],
  ])(
    "gives a temperature at the NAS-wide limit of %d a status",
    async (tempmax, status, words) => {
      await diskPage("sdb", {
        scenario: "disksNas",
        answers: {
          smartGetSettings: {
            status: 200,
            value: {
              enable: true,
              interval: 1800,
              powermode: "standby",
              tempdiff: 0,
              tempmax,
            },
          },
        },
      });
      await screen.findByRole("heading", { level: 1, name: "Disk /dev/sdb" });
      await waitFor(() =>
        expect(fact("Temperature")).toHaveTextContent(`41 °C${status}${words}`),
      );
    },
  );

  it("has no temperature status without a limit (D11)", async () => {
    await diskPage("sdb", { scenario: "disksNas" });
    await screen.findByRole("heading", { level: 1, name: "Disk /dev/sdb" });
    await waitFor(() => expect(callNames()).toContain("Smart.getSettings"));
    // The NAS-wide limit is 50 °C and the disk reads 41 °C.
    expect(fact("Temperature")).toHaveTextContent(/^41\s°C$/);
  });

  it("shows the session's disk-health check, and fills it from the dashboard", async () => {
    const { user, app } = await renderApp({
      signedIn: true,
      scenario: "disksNas",
      path: "/",
    });
    const card = await screen.findByRole("region", { name: "Disks" });
    await user.click(
      within(card).getByRole("button", { name: "Check disk health" }),
    );
    await within(card).findByText("Check again", {}, { timeout: 5000 });
    await act(() =>
      app.router.navigate({
        to: "/storage/disks/$disk",
        params: { disk: "sdb" },
      }),
    );
    await screen.findByRole("heading", { level: 1, name: "Disk /dev/sdb" });
    expect(fact("Health")).toHaveTextContent(
      /^WarningA few damaged areas \(bad sectors\)\..*Checked at /,
    );
    await act(() =>
      app.router.navigate({
        to: "/storage/disks/$disk",
        params: { disk: "sdd" },
      }),
    );
    await screen.findByRole("heading", { level: 1, name: "Disk /dev/sdd" });
    expect(fact("Health")).toHaveTextContent(/^Not reported/);
    // Only the press read every disk; opening the pages read nothing that wakes one.
    expect(seenCalls.filter((c) => c.call === "Smart.getListBg")).toHaveLength(
      1,
    );
    expect(callNames()).not.toContain("Smart.getInformation");
  });

  it("names the vendor when it is a maker's name, and says when the disk is a hardware RAID set", async () => {
    const row = {
      ...VM.data[2],
      vendor: "WDC",
      model: "WD40EFRX",
      israid: true,
    };
    await diskPage("sdb", {
      answers: {
        diskMgmtGetList: {
          status: 200,
          value: {
            ...VM,
            data: VM.data.map((d) => (d.devicename === "sdb" ? row : d)),
          },
        },
      },
    });
    await screen.findByRole("heading", { level: 1, name: "Disk /dev/sdb" });
    expect(fact("Model")).toHaveTextContent(/^WDC WD40EFRX$/);
    expect(
      screen.getByText(
        "This is a set of disks made by a hardware RAID controller, which the NAS sees as one disk.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a model that looks like markup as text (UI-2)", async () => {
    await diskPage("sde", { scenario: "disksHostile" });
    await screen.findByRole("heading", { level: 1, name: "Disk /dev/sde" });
    expect(fact("Model")).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  it("says when a disk reports neither model nor serial number", async () => {
    await diskPage("sdf", { scenario: "disksHostile" });
    await screen.findByRole("heading", { level: 1, name: "Disk /dev/sdf" });
    expect(fact("Model")).toHaveTextContent("Model not reported");
    expect(fact("Serial number")).toHaveTextContent("Not reported");
    expect(
      screen.queryByRole("button", { name: "Copy serial number" }),
    ).toBeNull();
  });
});
