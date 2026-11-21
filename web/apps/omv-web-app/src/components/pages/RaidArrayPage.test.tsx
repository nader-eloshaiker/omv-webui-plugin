// SPDX-License-Identifier: GPL-3.0-or-later
// An array's page through the whole app on MSW (phase 5 RAID design 2, 5, 6, 7; owner, P6 to P8): the
// address is a validated kernel name and names no call; the summary, each disk's role from the report,
// What to do now, taking a disk out (plain for a failed disk, typed for a working one, refused while
// degraded), checking, deleting with its refusals and typed confirmation, the technical details without
// the host part, and the fail-closed states.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 8000 };

async function page(address = "md0", scenario: ScenarioName = "raidMirror") {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: `/storage/md/${address}`,
  });
  await screen.findByRole("heading", { level: 1 }, LONG);
  return app;
}
const calls = (call: string) => seenCalls.filter((c) => c.call === call);
const disks = () =>
  screen.findByRole("table", { name: "Disks of RAID /dev/md0" }, LONG);
const fact = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling as HTMLElement;

describe("an array's page", () => {
  it("names the array by its device and level, never its UUID or a host part", async () => {
    await page();
    await screen.findByRole(
      "heading",
      { level: 1, name: "RAID /dev/md0" },
      LONG,
    );
    expect(document.title).toBe("RAID /dev/md0 – RAID – openmediavault");
    expect(screen.getByText("Mirror (RAID1), 8.0 GiB")).toBeVisible();
    await waitFor(
      () => expect(fact("Disks")).toHaveTextContent("2 of 2 disks working"),
      LONG,
    );
    expect(fact("Level")).toHaveTextContent(
      "Mirror (RAID1)It can lose 1 disk and keep every file.",
    );
    expect(fact("Device name")).toHaveTextContent("/dev/md0");
    expect(screen.queryByText("Name", { selector: "dt" })).toBeNull();
    // The report is read with the row's devicefile, never the address.
    expect(calls("MdMgmt.getDetail")[0]?.params).toEqual({
      devicefile: "/dev/md0",
    });
    expect(calls("MdMgmt.getSlaves")[0]?.params).toEqual({
      devicefile: "/dev/md0",
    });
    expect(callNames()).not.toContain("MdMgmt.setSyncAction");
  });

  it.each(["md9999", "MD0", "md0%2F..%2F..%2Frpc.php", "sdb"])(
    "shows %s as no such array, and makes no array-specific call",
    async (address) => {
      await page(address);
      expect(
        await screen.findByText(
          "There is no array with this name on this NAS. It may have been deleted, or have a new name after a restart.",
          {},
          LONG,
        ),
      ).toBeVisible();
      expect(callNames()).not.toContain("MdMgmt.getDetail");
      expect(callNames()).not.toContain("MdMgmt.getSlaves");
    },
  );

  it("shows each disk's role, with a Take out button where it is allowed", async () => {
    await page();
    const t = await disks();
    await within(t).findByRole(
      "button",
      { name: "Take /dev/sdb out of RAID /dev/md0" },
      LONG,
    );
    expect(t).toHaveTextContent("Working");
    expect(
      within(t).getByRole("link", { name: "Open disk /dev/sdb" }),
    ).toBeVisible();
  });

  it("tells what to do for a failed disk, and takes it out after a plain confirmation", async () => {
    const { user } = await page("md0", "raidFailed");
    expect(
      await screen.findByRole(
        "heading",
        { name: "Replace the failed disk" },
        LONG,
      ),
    ).toBeVisible();
    const t = await disks();
    await waitFor(() => expect(t).toHaveTextContent("Failed"), LONG);
    // The working disk of a degraded array cannot be taken out; the reason is said once.
    expect(
      within(t).queryByRole("button", {
        name: "Take /dev/sdc out of RAID /dev/md0",
      }),
    ).toBeNull();
    expect(
      screen.getByText(
        "The array is already missing a disk. Taking out another would leave it without protection, or destroy it.",
      ),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Take the failed disk out…" }),
    );
    const dialog = await screen.findByRole("alertdialog", {}, LONG);
    await within(dialog).findByRole(
      "heading",
      { name: "Take /dev/sdb out of RAID /dev/md0?" },
      LONG,
    );
    expect(dialog).toHaveTextContent(
      "It has failed and holds no part of the working array, so nothing is lost.",
    );
    // A failed disk is not among the array's disks with a size: no stray ", ." where it would be.
    expect(dialog).toHaveTextContent(
      "serial number EXAMPLE-SERIAL-0003. Failed.",
    );
    expect(dialog).not.toHaveTextContent(", .");
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(callNames()).not.toContain("MdMgmt.remove");
    await user.click(within(dialog).getByRole("button", { name: "Take out" }));
    expect(
      await screen.findByText(
        "/dev/sdb was taken out of RAID /dev/md0.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(calls("MdMgmt.remove")).toHaveLength(1);
    expect(calls("MdMgmt.remove")[0]?.params).toEqual({
      devicefile: "/dev/md0",
      devices: ["/dev/sdb"],
    });
  });

  it("takes a working disk out of a healthy mirror only after its name is typed", async () => {
    const { user } = await page();
    const t = await disks();
    await user.click(
      await within(t).findByRole(
        "button",
        { name: "Take /dev/sdb out of RAID /dev/md0" },
        LONG,
      ),
    );
    const dialog = await screen.findByRole("alertdialog", {}, LONG);
    await within(dialog).findByRole(
      "heading",
      { name: "Take working disk /dev/sdb out of RAID /dev/md0?" },
      LONG,
    );
    expect(dialog).toHaveTextContent(
      "The array then runs without that disk and loses protection. It cannot lose another disk.",
    );
    const confirm = within(dialog).getByRole("button", {
      name: "Take disk out",
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    await user.click(confirm);
    expect(callNames()).not.toContain("MdMgmt.remove");
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type /dev/sdb to confirm.",
      }),
      "/dev/sdb",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Take disk out" }),
    );
    expect(
      await screen.findByText(
        "/dev/sdb was taken out of RAID /dev/md0.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(calls("MdMgmt.remove")).toHaveLength(1);
    // The array is then short of a disk.
    expect(
      await screen.findByRole(
        "heading",
        { name: "Replace the missing disk" },
        LONG,
      ),
    ).toBeVisible();
  });

  it("fails closed when the report cannot be read: roles not known, nothing taken out or added", async () => {
    await page("md0", "raidDetailFails");
    const t = await disks();
    await waitFor(() => expect(t).toHaveTextContent("Not known"), LONG);
    expect(within(t).queryByRole("button", { name: /^Take / })).toBeNull();
    expect(
      screen.getAllByText(
        "Could not tell what each disk is doing, so this cannot be done now.",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("makes every change unavailable while the state cannot be read", async () => {
    await page("md0", "raidStateFalse");
    expect(
      await screen.findAllByText("Could not read its state.", {}, LONG),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByText(
        "Its state could not be read, so it cannot be changed now.",
      ).length,
    ).toBeGreaterThan(0);
    const t = await disks();
    expect(within(t).queryByRole("button", { name: /^Take / })).toBeNull();
  });

  it("checks a mirror after a plain confirmation, and has no check for a stripe", async () => {
    const { user } = await page();
    await user.click(
      await screen.findByRole("button", { name: "Check now…" }, LONG),
    );
    const dialog = await screen.findByRole(
      "alertdialog",
      { name: "Check RAID /dev/md0?" },
      LONG,
    );
    expect(dialog).toHaveTextContent(
      "The disks are woken and kept busy until it ends.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Start checking" }),
    );
    await waitFor(
      () => expect(calls("MdMgmt.setSyncAction")).toHaveLength(1),
      LONG,
    );
    expect(calls("MdMgmt.setSyncAction")[0]?.params).toEqual({
      devicefile: "/dev/md0",
      action: "check",
    });
    expect(
      await screen.findByRole("button", { name: "Stop checking…" }, LONG),
    ).toBeVisible();
  });

  it("has no check section for a stripe, which keeps no copies", async () => {
    await page("md0", "raidStripe");
    await disks();
    expect(
      screen.queryByRole("heading", { name: "Check this array" }),
    ).toBeNull();
    expect(
      await screen.findByText(
        "A Stripe (RAID0) array cannot take more disks here.",
        {},
        LONG,
      ),
    ).toBeVisible();
  });

  it("refuses to delete an array holding a mounted file system, and names it", async () => {
    await page("md0", "raidInUse");
    const button = await screen.findByRole(
      "button",
      { name: "Delete array…" },
      LONG,
    );
    await waitFor(
      () => expect(button).toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    expect(
      document.getElementById(button.getAttribute("aria-describedby") ?? ""),
    ).toHaveTextContent(
      "It holds the file system array, which is set up on this NAS.",
    );
    expect(callNames()).not.toContain("MdMgmt.delete");
  });

  it("deletes an empty array after its name is typed, and says its disks are free", async () => {
    const { user } = await page();
    const button = await screen.findByRole(
      "button",
      { name: "Delete array…" },
      LONG,
    );
    await waitFor(
      () => expect(button).toHaveAttribute("aria-disabled", "false"),
      LONG,
    );
    await user.click(button);
    const dialog = await screen.findByRole("alertdialog", {}, LONG);
    await within(dialog).findByRole(
      "heading",
      { name: "Delete RAID /dev/md0?" },
      LONG,
    );
    await waitFor(() =>
      expect(dialog).toHaveTextContent(
        "Everything stored on this array is lost, and the array cannot be put back together.",
      ),
    );
    expect(dialog).toHaveTextContent("/dev/sdb");
    expect(dialog).toHaveTextContent("/dev/sdc");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete array" }),
    );
    expect(callNames()).not.toContain("MdMgmt.delete");
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type /dev/md0 to confirm.",
      }),
      "/dev/md0",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Delete array" }),
    );
    expect(
      await screen.findByText("RAID /dev/md0 was deleted.", {}, LONG),
    ).toBeVisible();
    expect(
      screen.getByText(/Its disks are free: \/dev\/sdb, \/dev\/sdc\./),
    ).toBeVisible();
    expect(calls("MdMgmt.delete")).toHaveLength(1);
  });

  it("shows the technical details on request, without the host part", async () => {
    const { user } = await page();
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Show technical details" },
        LONG,
      ),
    );
    const report = await screen.findByRole(
      "region",
      { name: "Technical details of RAID /dev/md0" },
      LONG,
    );
    expect(report).toHaveTextContent("Raid Level : raid1");
    expect(report).not.toHaveTextContent("nas");
  });

  it("offers storage on an empty array through Flow A, handed over in memory", async () => {
    const { user } = await page();
    const add = await screen.findByRole(
      "button",
      { name: "Add storage on this array" },
      LONG,
    );
    await user.click(add);
    await screen.findByRole("heading", { level: 2, name: "Add storage" }, LONG);
    expect(window.location.pathname).toBe("/ui/storage/filesystems/add");
    expect(window.location.search).toBe("");
  });
});
