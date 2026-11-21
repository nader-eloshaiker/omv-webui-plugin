// SPDX-License-Identifier: GPL-3.0-or-later
// Creating an array through the whole app on MSW (phase 5 RAID design 3; owner, P1 to P4, D24): the
// disks the stricter list allows, Mirror the default and Stripe never preselected, the minimum disks
// checked on Continue, one summary with every device typed and the Stripe warning before the typed
// field, then the run on the remembering mock: create, find the array, the file-system stage on it, the
// one checkpoint and the result. Nothing is created before the typed names and step 1's re-check.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 15000 };

async function create(scenario: ScenarioName = "admin") {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: "/storage/md/create",
  });
  await screen.findByRole(
    "heading",
    { level: 2, name: "Create a RAID array" },
    LONG,
  );
  return app;
}
const calls = (call: string) => seenCalls.filter((c) => c.call === call);
const disk = (device: string) =>
  screen.findByRole("checkbox", { name: new RegExp(`^${device}\\s?, `) }, LONG);

describe("creating an array", () => {
  it("offers the empty disks, defaults to Mirror, and never preselects Stripe", async () => {
    await create();
    expect(await disk("/dev/sdb")).not.toBeChecked();
    expect(await disk("/dev/sdd")).toBeVisible();
    // The system disk and the data disk are never offered.
    expect(
      screen.queryByRole("checkbox", { name: /^\/dev\/nvme0n1\s?, / }),
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: /^\/dev\/sda\s?, / }),
    ).toBeNull();
    expect(
      screen.getByRole("radio", { name: /^Mirror \(RAID1\), recommended/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /^Stripe \(RAID0\), no protection/ }),
    ).not.toBeChecked();
    expect(screen.getByRole("group", { name: "Not protected" })).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: /^Put a file system on it/ }),
    ).toBeChecked();
    // Reading only: getCandidates, never a change.
    expect(callNames()).toContain("MdMgmt.getCandidates");
    expect(callNames()).not.toContain("MdMgmt.create");
  });

  it("checks the level's minimum on Continue, not on each tick", async () => {
    const { user } = await create();
    await user.click(await disk("/dev/sdb"));
    await user.click(await disk("/dev/sdc"));
    await user.click(screen.getByRole("radio", { name: /^Parity \(RAID5\)/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getAllByText("Choose at least 3 disks for Parity (RAID5).").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Ready to create the array")).toBeNull();
  });

  it("repeats the Stripe warning before the typed field, keeps Stripe after Change choices, and creates it", async () => {
    const { user } = await create();
    await user.click(await disk("/dev/sdb"));
    await user.click(await disk("/dev/sdc"));
    await user.click(screen.getByRole("radio", { name: /^Stripe \(RAID0\)/ }));
    await user.click(
      screen.getByRole("checkbox", { name: /^Put a file system on it/ }),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Ready to create the array");
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("This array has no protection");
    const field = screen.getByRole("textbox", {
      name: "Type /dev/sdb /dev/sdc to confirm.",
    });
    // The warning comes before the typed field in reading order.
    expect(
      note.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText(/The disks then synchronise/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Change choices" }));
    expect(
      screen.getByRole("radio", { name: /^Stripe \(RAID0\)/ }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const confirm = screen.getByRole("button", {
      name: "Erase 2 disks and create array",
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    await user.type(
      screen.getByRole("textbox", {
        name: "Type /dev/sdb /dev/sdc to confirm.",
      }),
      "/dev/sdb /dev/sdc",
    );
    expect(callNames()).not.toContain("MdMgmt.create");
    await user.click(
      screen.getByRole("button", { name: "Erase 2 disks and create array" }),
    );
    expect(
      await screen.findByText("The RAID array is ready.", {}, LONG),
    ).toBeVisible();
    expect(
      screen.getByText(
        /It has no protection: if one disk fails, everything on it is lost\./,
      ),
    ).toBeVisible();
    const sent = calls("MdMgmt.create")[0]?.params as {
      devices: string[];
      level: string;
      name: string;
    };
    expect(sent.level).toBe("stripe");
    expect(sent.name).toBe("");
    // The disks' stable names, never the kernel names that a restart can change.
    expect(sent.devices.every((d) => d.startsWith("/dev/disk/by-id/"))).toBe(
      true,
    );
    // The re-check runs before the create.
    const order = callNames();
    expect(order.lastIndexOf("MdMgmt.getCandidates")).toBeLessThan(
      order.indexOf("MdMgmt.create"),
    );
    expect(
      screen.getByRole("link", { name: "Open RAID /dev/md0" }),
    ).toHaveAttribute("href", "/ui/storage/md/md0");
  });

  it("creates a mirror and goes on into a file system on it, with one checkpoint", async () => {
    const { user } = await create();
    await user.click(await disk("/dev/sdb"));
    await user.click(await disk("/dev/sdc"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/The disks then synchronise/)).toBeVisible();
    expect(
      screen.getByText("Create an EXT4 file system on the array."),
    ).toBeVisible();
    await user.type(
      screen.getByRole("textbox", {
        name: "Type /dev/sdb /dev/sdc to confirm.",
      }),
      "/dev/sdb /dev/sdc",
    );
    await user.click(
      screen.getByRole("button", { name: "Erase 2 disks and create array" }),
    );
    expect(
      await screen.findByText(
        "The RAID array is ready.",
        {},
        { timeout: 30000 },
      ),
    ).toBeVisible();
    const steps = screen.getByRole("list", { name: "Steps" });
    expect(
      within(steps).getByText("Save the array and mount the new file system"),
    ).toBeVisible();
    expect(calls("MdMgmt.create")[0]?.params).toMatchObject({
      level: "mirror",
    });
    expect(calls("FileSystemMgmt.create")[0]?.params).toEqual({
      devicefile: "/dev/md0",
      type: "ext4",
    });
    expect(calls("Config.applyChangesBg")).toHaveLength(1);
    expect(
      screen.getByText(/is mounted and ready, with .* free\./),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Next: share a folder on it" }),
    ).toBeVisible();
  }, 40000);

  it("does not start while other changes are pending", async () => {
    await renderApp({
      signedIn: true,
      scenario: "pendingChanges",
      path: "/storage/md/create",
    });
    expect(
      await screen.findByText("Some changes are not applied yet", {}, LONG),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Apply or undo them before you create an array, so that only these changes are applied at the end.",
      ),
    ).toBeVisible();
    // The form is not shown, so no disk can be chosen.
    expect(
      screen.queryByRole("checkbox", { name: /^\/dev\/sdb\s?, / }),
    ).toBeNull();
    expect(callNames()).not.toContain("MdMgmt.create");
  });

  it("stops at a failed create, says the disks may carry parts, and does not retry by itself", async () => {
    const { user } = await create("raidCreateFails");
    await user.click(await disk("/dev/sdb"));
    await user.click(await disk("/dev/sdc"));
    await user.click(
      screen.getByRole("checkbox", { name: /^Put a file system on it/ }),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(
      screen.getByRole("textbox", {
        name: "Type /dev/sdb /dev/sdc to confirm.",
      }),
      "/dev/sdb /dev/sdc",
    );
    await user.click(
      screen.getByRole("button", { name: "Erase 2 disks and create array" }),
    );
    const failure = await screen.findByRole("alert", {}, LONG);
    await waitFor(
      () => expect(failure).toHaveTextContent("The array was not created."),
      LONG,
    );
    expect(failure).toHaveTextContent(
      "The disks may now carry parts of an unfinished array.",
    );
    expect(failure).toHaveTextContent("Device or resource busy");
    expect(calls("MdMgmt.create")).toHaveLength(1);
  });

  it("quick-wipes a new array that shows an earlier array's file system, then goes on", async () => {
    const { user } = await create("raidLeftoverFs");
    await user.click(await disk("/dev/sdb"));
    await user.click(await disk("/dev/sdc"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(
      screen.getByRole("textbox", { name: "Type /dev/sdb /dev/sdc to confirm." }),
      "/dev/sdb /dev/sdc",
    );
    await user.click(screen.getByRole("button", { name: "Erase 2 disks and create array" }));
    expect(await screen.findByText("The RAID array is ready.", {}, { timeout: 40000 })).toBeVisible();
    expect(calls("DiskMgmt.wipe")[0]?.params).toEqual({
      devicefile: "/dev/md0",
      secure: false,
    });
    expect(calls("FileSystemMgmt.create")).toHaveLength(1);
  }, 60000);
});
