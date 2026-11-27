// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's settings through the whole app on MSW (phase 5 disks design 2.5, 2.7): whether the NAS
// watches the disk, its own temperature limit, the scheduled-tests lock (D13), and its power settings,
// first chosen (D18) with the write cache on (P6), each saved with the row's stable device file and
// then pending in the band.
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const NEW_UUID = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";
const SDB =
  "/dev/disk/by-id/ata-VMware_Virtual_SATA_Hard_Drive_EXAMPLE-SERIAL-0003";

async function diskPage(
  disk: string,
  options: Parameters<typeof renderApp>[0] = {},
) {
  const app = await renderApp({
    signedIn: true,
    path: `/storage/disks/${disk}`,
    ...options,
  });
  await screen.findByRole("heading", { level: 1, name: `Disk /dev/${disk}` });
  return app;
}

const monitoring = () => screen.getByRole("form", { name: "Monitoring" });
const power = () => screen.getByRole("form", { name: "Power settings" });
const watch = () =>
  within(monitoring()).getByRole("checkbox", {
    name: "Watch this disk's health",
  });
const params = (call: string) =>
  seenCalls.filter((c) => c.call === call).map((c) => c.params);

async function choose(
  user: Awaited<ReturnType<typeof renderApp>>["user"],
  combobox: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name: combobox }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("a disk's monitoring", () => {
  it("reads a disk with no settings saved as not watched, and creates them on Save", async () => {
    const { user } = await diskPage("sdb");
    await screen.findByRole("form", { name: "Monitoring" });
    expect(watch()).not.toBeChecked();
    expect(
      within(monitoring()).getByText(
        "Monitoring is off for the whole NAS, so no disk is watched, even when this is ticked.",
      ),
    ).toBeInTheDocument();
    expect(
      within(monitoring()).getByRole("link", {
        name: "Open the disk health settings",
      }),
    ).toHaveAttribute("href", "/ui/storage/smart/settings");
    const save = within(monitoring()).getByRole("button", { name: "Save" });
    expect(save).toHaveAttribute("aria-disabled", "true");

    await user.click(watch());
    expect(watch()).toBeChecked();
    expect(save).toHaveAttribute("aria-disabled", "false");
    await user.click(save);
    expect(
      await within(monitoring()).findByText(
        "Saved. The changes take effect when you apply them in the band at the top of the page.",
      ),
    ).toBeInTheDocument();
    expect(params("Smart.setDeviceSettings")).toEqual([
      {
        uuid: NEW_UUID,
        devicefile: SDB,
        enable: true,
        tempdiff: 0,
        tempmax: 0,
      },
    ]);
    // The page's pending mark follows the save, beside the title.
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1 }).parentElement,
      ).toHaveTextContent("Not applied yet"),
    );
  });

  it("shows the saved setting of a watched disk", async () => {
    await diskPage("nvme0n1");
    await screen.findByRole("form", { name: "Monitoring" });
    expect(watch()).toBeChecked();
  });

  it("does not take a failed read for 'not watched', and offers to read again", async () => {
    const { user } = await diskPage("sdb", {
      answers: {
        smartGetDeviceSettings: {
          status: 500,
          message: "Failed to connect to the configuration database.",
        },
      },
    });
    expect(
      await screen.findByText("Could not read whether this disk is watched."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Failed to connect to the configuration database."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Monitoring" })).toBeNull();
    const before = params("Smart.getDeviceSettings").length;
    const section = screen.getByRole("region", { name: "Monitoring" });
    // The first "Try again" of the section is the form's; the self-tests below have their own.
    const [retry] = within(section).getAllByRole("button", {
      name: "Try again",
    });
    await user.click(retry!);
    await waitFor(() =>
      expect(params("Smart.getDeviceSettings").length).toBeGreaterThan(before),
    );
  });

  it("keeps watching on while scheduled self-tests refer to the disk (D13), and says why", async () => {
    const { user } = await diskPage("sda", { scenario: "disksNas" });
    await screen.findByRole("form", { name: "Monitoring" });
    await waitFor(() => expect(watch()).toBeChecked());
    expect(watch()).toHaveAttribute("aria-disabled", "true");
    await waitFor(() =>
      expect(watch()).toHaveAccessibleDescription(
        /This disk has 1 scheduled self-test\. Delete it under Scheduled self-tests below before you stop watching it\./,
      ),
    );
    // Unavailable but reachable, so the reason can be read.
    watch().focus();
    expect(watch()).toHaveFocus();
    await user.click(watch());
    expect(watch()).toBeChecked();
    expect(
      within(monitoring()).getByRole("button", { name: "Save" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("saves the disk's own temperature limit, refusing one outside 1 to 100", async () => {
    const { user } = await diskPage("sdb", { scenario: "disksNas" });
    await screen.findByRole("form", { name: "Monitoring" });
    await waitFor(() => expect(watch()).toBeChecked());
    await user.click(
      within(monitoring()).getByRole("button", {
        name: "Temperature limit for this disk",
      }),
    );
    expect(
      within(monitoring()).getByRole("radio", {
        name: /^Same as for all disks \(50\s°C\)$/,
      }),
    ).toBeChecked();
    await user.click(
      within(monitoring()).getByRole("radio", { name: "Its own limit" }),
    );
    const limit = within(monitoring()).getByRole("textbox", {
      name: /^Limit\s°C$/,
    });
    await user.type(limit, "200");
    await user.click(
      within(monitoring()).getByRole("button", { name: "Save" }),
    );
    expect(
      within(monitoring()).getByText("Enter a whole number from 1 to 100."),
    ).toBeInTheDocument();
    expect(limit).toHaveFocus();
    expect(callNames()).not.toContain("Smart.setDeviceSettings");

    await user.clear(limit);
    await user.type(limit, "48");
    expect(
      within(monitoring()).getByText(
        "Recorded at this temperature, and emailed at 53 °C.",
      ),
    ).toBeInTheDocument();
    await user.click(
      within(monitoring()).getByRole("button", { name: "Save" }),
    );
    await waitFor(() =>
      expect(params("Smart.setDeviceSettings")).toEqual([
        {
          uuid: "00000000-0000-4000-8000-000000000602",
          devicefile: "/dev/disk/by-id/ata-Example_HDD_4TB_EXAMPLE-SERIAL-0102",
          enable: true,
          tempdiff: 0,
          tempmax: 48,
        },
      ]),
    );
  });

  it("keeps the edits and says so when the save is refused", async () => {
    const { user } = await diskPage("sdb", {
      answers: {
        smartSetDeviceSettings: {
          status: 500,
          message: "The device does not support S.M.A.R.T.",
        },
      },
    });
    await screen.findByRole("form", { name: "Monitoring" });
    await user.click(watch());
    await user.click(
      within(monitoring()).getByRole("button", { name: "Save" }),
    );
    const alert = await within(monitoring()).findByText(
      "The monitoring setting was not saved.",
    );
    expect(
      within(monitoring()).getByText("The device does not support S.M.A.R.T."),
    ).toBeInTheDocument();
    await waitFor(() => expect(alert.closest("[tabindex='-1']")).toHaveFocus());
    expect(watch()).toBeChecked();
    expect(document.body).not.toHaveTextContent("mock trace");
  });

  it("puts the form back on Discard changes", async () => {
    const { user } = await diskPage("sdb");
    await screen.findByRole("form", { name: "Monitoring" });
    await user.click(watch());
    await user.click(
      within(monitoring()).getByRole("button", { name: "Discard changes" }),
    );
    expect(watch()).not.toBeChecked();
  });

  it("says when the disk did not report its health in the last check", async () => {
    const { user, app } = await renderApp({
      signedIn: true,
      scenario: "disksNas",
      path: "/",
    });
    const map = await screen.findByRole(
      "region",
      { name: "Your NAS" },
      { timeout: 8000 },
    );
    // The check sits in the dashboard's answer, once the map has been read.
    expect(map).toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", { name: "Check disk health" }),
    );
    await waitFor(
      () =>
        expect(
          within(map).queryByRole("button", { name: /Checking disk health/ }),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    await waitFor(() =>
      expect(seenCalls.some((c) => c.call === "Exec.getOutput")).toBe(true),
    );
    await act(() =>
      app.router.navigate({
        to: "/storage/disks/$disk",
        params: { disk: "sdd" },
      }),
    );
    await screen.findByRole("form", { name: "Monitoring" });
    expect(watch()).toHaveAccessibleDescription(
      /This disk did not report its health in the last check, so it may not support monitoring\. Saving checks this\./,
    );
  });
});

describe("a disk's power settings", () => {
  it("starts with nothing set, and reveals the form at its starting values on request (D18, P6)", async () => {
    const { user } = await diskPage("sdb");
    const section = screen.getByRole("region", { name: "Power settings" });
    expect(
      within(section).getByText(
        "The NAS does not set this disk's power settings now, so the disk uses its own.",
      ),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(
        "Once saved, these settings can be changed but not removed. The NAS then sends all four to the disk each time it starts or wakes.",
      ),
    ).toBeInTheDocument();
    await user.click(
      within(section).getByRole("button", { name: "Choose power settings" }),
    );
    const spinDown = screen.getByRole("combobox", { name: "Spin down after" });
    expect(spinDown).toHaveFocus();
    expect(spinDown).toHaveTextContent("Never");
    expect(
      screen.getByRole("combobox", { name: "Power-saving level" }),
    ).toHaveTextContent("Off: the disk does not save power by itself");
    expect(
      screen.getByRole("combobox", { name: "Noise level" }),
    ).toHaveTextContent("Off");
    expect(
      within(power()).getByRole("checkbox", {
        name: "Use the disk's write cache",
      }),
    ).toBeChecked();

    await user.click(within(power()).getByRole("button", { name: "Save" }));
    expect(
      await within(power()).findByText(
        "Saved. The changes take effect when you apply them in the band at the top of the page.",
      ),
    ).toBeInTheDocument();
    expect(params("DiskMgmt.setHdParm")).toEqual([
      {
        uuid: NEW_UUID,
        devicefile: SDB,
        apm: 0,
        aam: 0,
        spindowntime: 0,
        writecache: true,
      },
    ]);
    // Saved: the form shows the stored settings, with nothing left to save until the next change,
    // whatever a later read of the (stateless) mock says.
    await waitFor(() =>
      expect(
        within(power()).getByRole("button", { name: "Save" }),
      ).toHaveAttribute("aria-disabled", "true"),
    );
    expect(
      within(power()).queryByRole("button", { name: "Choose power settings" }),
    ).toBeNull();
  });

  it("offers the spin-down times in groups of minutes and hours", async () => {
    const { user } = await diskPage("sdb", { scenario: "disksAsleep" });
    await user.click(screen.getByRole("combobox", { name: "Spin down after" }));
    const listbox = await screen.findByRole("listbox");
    const groups = within(listbox).getAllByRole("group");
    const names = groups.map((g) =>
      within(g)
        .getAllByRole("option")
        .map((o) => o.textContent),
    );
    expect(names).toEqual([
      ["5 minutes", "10 minutes", "20 minutes", "30 minutes"],
      [
        "1 hour",
        "2 hours",
        "3 hours",
        "4 hours",
        "5 hours",
        "5 hours, 30 minutes",
      ],
    ]);
  });

  it("shows saved settings, warns that monitoring keeps the disk awake, and saves a change", async () => {
    const { user } = await diskPage("sdb", { scenario: "disksAsleep" });
    expect(
      screen.getByRole("combobox", { name: "Spin down after" }),
    ).toHaveTextContent("30 minutes");
    expect(
      screen.getByRole("combobox", { name: "Power-saving level" }),
    ).toHaveTextContent("Balanced (level 127)");
    const save = within(power()).getByRole("button", { name: "Save" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(
      await within(power()).findByText(
        "Disk monitoring checks this disk every 30 minutes and wakes it to do so, so it may never stay asleep. To let it sleep, change what happens to sleeping disks in the disk health settings.",
      ),
    ).toBeInTheDocument();

    await choose(user, "Spin down after", "Never");
    expect(
      within(power()).queryByText(/^Disk monitoring checks this disk/),
    ).toBeNull();
    await user.click(save);
    await waitFor(() =>
      expect(params("DiskMgmt.setHdParm")).toEqual([
        {
          uuid: "00000000-0000-4000-8000-000000000401",
          devicefile: SDB,
          apm: 127,
          aam: 0,
          spindowntime: 0,
          writecache: true,
        },
      ]),
    );
  });

  it("keeps a value set elsewhere as its own choice", async () => {
    await diskPage("sdd", { scenario: "disksAsleep" });
    expect(
      screen.getByRole("combobox", { name: "Spin down after" }),
    ).toHaveTextContent("8 minutes (set elsewhere)");
    expect(
      screen.getByRole("combobox", { name: "Power-saving level" }),
    ).toHaveTextContent("Level 200 (set elsewhere)");
    expect(
      within(power()).getByRole("checkbox", {
        name: "Use the disk's write cache",
      }),
    ).not.toBeChecked();
    // The disk is not watched, so monitoring does not wake it.
    expect(
      within(power()).queryByText(/^Disk monitoring checks this disk/),
    ).toBeNull();
  });

  it("says when the power settings were not saved", async () => {
    const { user } = await diskPage("sdc", {
      scenario: "disksAsleep",
      answers: {
        diskMgmtSetHdParm: {
          status: 500,
          message: "The object already exists.",
        },
      },
    });
    await choose(user, "Noise level", "Quiet, slower");
    await user.click(within(power()).getByRole("button", { name: "Save" }));
    expect(
      await within(power()).findByText("The power settings were not saved."),
    ).toBeInTheDocument();
    expect(
      within(power()).getByText("The object already exists."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Noise level" }),
    ).toHaveTextContent("Quiet, slower");
  });
});
