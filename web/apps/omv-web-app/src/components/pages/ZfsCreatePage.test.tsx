// SPDX-License-Identifier: GPL-3.0-or-later
// Creating a pool, adding a file system and replacing a disk through the whole app on the remembering
// mock (phase 5 ZFS design 3, 4.2, 7; owner, P3, P4, P6, P10): the disks the stricter list allows,
// Mirror the default and "No protection" never preselected (not with one disk, not after "Change
// choices"), one summary with every device typed and the warning before the typed field, then the run
// with the first file system "data" and the one checkpoint. A refused create says the disks may have
// changed and goes back to choose again. Nothing changes before the typed names and step 1's re-check.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 15000 };

async function create(scenario: ScenarioName = "zfsNone") {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: "/storage/zfs/create",
  });
  await screen.findByRole(
    "heading",
    { level: 1, name: "Create a ZFS pool" },
    LONG,
  );
  await screen.findByRole("group", { name: "Disks to use" }, LONG);
  return app;
}
const calls = (call: string) => seenCalls.filter((c) => c.call === call);
const disk = (device: string) =>
  screen.findByRole("checkbox", { name: new RegExp(`^${device}\\s?, `) }, LONG);
const params = (call: string) =>
  calls(call).map((c) => c.params as Record<string, unknown>);

describe("creating a pool", () => {
  it("defaults to Mirror and never preselects No protection, with one disk too", async () => {
    const { user } = await create();
    expect(
      screen.getByRole("radio", { name: /^Mirror, recommended/ }),
    ).toBeChecked();
    const stripe = screen.getByRole("radio", {
      name: /^No protection \(stripe\)/,
    });
    expect(stripe).not.toBeChecked();
    await user.click(await disk("/dev/sdb"));
    expect(stripe).not.toBeChecked();
    expect(
      screen.queryByRole("checkbox", { name: /^\/dev\/sda\s?, / }),
    ).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: /Make a first file system/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("textbox", { name: "File system name" }),
    ).toHaveValue("data");
    expect(callNames()).not.toContain("Zfs.addPool");
  });

  it("says the minimum as an error only after Continue", async () => {
    const { user } = await create();
    await user.click(await disk("/dev/sdb"));
    expect(screen.queryByText(/^Choose at least/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText("Choose at least 2 disks for Mirror."),
    ).toBeVisible();
    expect(callNames()).not.toContain("Zfs.addPool");
  });

  it("names the chosen disks in device order, empty and reused alike", async () => {
    const { user } = await create("zfsLeftover");
    for (const device of ["/dev/sde", "/dev/sdb", "/dev/sdc", "/dev/sdd"]) {
      await user.click(await disk(device));
    }
    await user.click(
      screen.getByRole("radio", { name: /^Double parity \(RAID-Z2\)/ }),
    );
    await user.type(screen.getByRole("textbox", { name: "Pool name" }), "rz2");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByRole("textbox", {
        name: "Type /dev/sdb /dev/sdc /dev/sdd /dev/sde to confirm.",
      }),
    ).toBeVisible();
  });

  it("refuses a reserved name and a system folder in words", async () => {
    const { user } = await create();
    const name = screen.getByRole("textbox", { name: "Pool name" });
    await user.type(name, "mirror1");
    await user.tab();
    expect(
      await screen.findByText(
        "mirror1 is a word ZFS keeps for itself. Choose another name.",
      ),
    ).toBeVisible();
    await user.clear(name);
    await user.type(name, "srv");
    await user.tab();
    expect(
      await screen.findByText(/srv is a folder the system uses/),
    ).toBeVisible();
  });

  it("creates a mirror with the file system data at one checkpoint, after every device typed", async () => {
    const { user } = await create();
    await user.click(await disk("/dev/sdb"));
    await user.click(await disk("/dev/sdc"));
    await user.type(screen.getByRole("textbox", { name: "Pool name" }), "tank");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Ready to create the pool")).toBeVisible();
    const confirm = screen.getByRole("button", {
      name: "Erase 2 disks and create pool",
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    await user.type(
      screen.getByRole("textbox", {
        name: "Type /dev/sdb /dev/sdc to confirm.",
      }),
      "/dev/sdb /dev/sdc",
    );
    await user.click(confirm);
    expect(
      await screen.findByText("The pool is ready.", {}, { timeout: 30000 }),
    ).toBeVisible();
    const sent = params("Zfs.addPool")[0];
    expect(sent).toMatchObject({
      pooltype: "mirror",
      name: "tank",
      force: false,
      devalias: "id",
      ashiftval: 12,
      compresstype: "lz4",
    });
    expect(
      (sent?.devices as string[]).every((d) =>
        d.startsWith("/dev/disk/by-id/"),
      ),
    ).toBe(true);
    expect(params("Zfs.addObject")[0]).toMatchObject({
      path: "tank",
      name: "data",
    });
    expect(calls("Config.applyChangesBg")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open pool tank" })).toBeVisible();
  }, 60000);

  it("never brings No protection back after Change choices, and warns before the typed field", async () => {
    const { user } = await create();
    await user.click(await disk("/dev/sdb"));
    await user.click(
      screen.getByRole("radio", { name: /^No protection \(stripe\)/ }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Pool name" }),
      "scratch",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText("This pool has no protection"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Change choices" }));
    expect(
      await screen.findByRole("radio", { name: /^No protection \(stripe\)/ }),
    ).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText("Choose how to protect your files."),
    ).toBeVisible();
  });

  it("says the disks may have changed after a refused create, and chooses again", async () => {
    const { user } = await create("zfsCreateFails");
    await user.click(await disk("/dev/sdb"));
    await user.click(await disk("/dev/sdc"));
    await user.type(screen.getByRole("textbox", { name: "Pool name" }), "tank");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(
      await screen.findByRole("textbox", {
        name: "Type /dev/sdb /dev/sdc to confirm.",
      }),
      "/dev/sdb /dev/sdc",
    );
    await user.click(
      screen.getByRole("button", { name: "Erase 2 disks and create pool" }),
    );
    expect(
      await screen.findByText(
        "The pool was not created.",
        {},
        { timeout: 30000 },
      ),
    ).toBeVisible();
    expect(screen.getByText(/the disks may have been changed/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Change choices" }));
    // Read again: the disks the refused create touched are now offered only to erase.
    const reuse = await screen.findByRole(
      "group",
      { name: "Erase and reuse" },
      LONG,
    );
    expect(within(reuse).getAllByRole("checkbox").length).toBeGreaterThan(0);
  }, 60000);
});

describe("adding a file system", () => {
  it("refuses a name that is taken, then adds one with a limit at its checkpoint", async () => {
    const { user } = await renderApp({
      signedIn: true,
      scenario: "zfsMirror",
      path: "/storage/zfs/pools/tank/add",
    });
    const name = await screen.findByRole(
      "textbox",
      { name: "File system name" },
      LONG,
    );
    await user.type(name, "media");
    await user.tab();
    expect(
      await screen.findByText(
        "There is already a file system or volume called media on tank.",
      ),
    ).toBeVisible();
    await user.clear(name);
    await user.type(name, "photos");
    await user.click(screen.getByRole("radio", { name: "Up to:" }));
    await user.type(screen.getByRole("textbox", { name: "Size limit" }), "2");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("button", { name: "Add file system" }),
    );
    expect(
      await screen.findByText(/is mounted and ready/, {}, { timeout: 30000 }),
    ).toBeVisible();
    expect(params("Zfs.addObject")[0]).toMatchObject({
      path: "tank",
      name: "photos",
    });
    expect(params("Zfs.setProperties")[0]).toMatchObject({
      name: "tank/photos",
      properties: [{ property: "quota", value: "2G", modified: true }],
    });
  }, 60000);
});

describe("replacing a disk (Flow F)", () => {
  it("replaces an offline disk with an empty one after the new device is typed", async () => {
    const { user } = await renderApp({
      signedIn: true,
      scenario: "zfsDegraded",
      path: "/storage/zfs/pools/tank",
    });
    await user.click(
      await screen.findByRole("button", { name: "Replace the disk…" }, LONG),
    );
    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: "Replace a disk in pool tank" },
        LONG,
      ),
    ).toBeVisible();
    const radios = await screen.findAllByRole("radio", {}, LONG);
    await user.click(radios[0] as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const prompt = await screen.findByRole("textbox", {
      name: /^Type \/dev\/sd[a-z]+ to confirm\.$/,
    });
    const device = /Type (\S+) to confirm/.exec(
      prompt.getAttribute("aria-label") ??
        prompt.closest("div")?.textContent ??
        "",
    )?.[1];
    await user.type(prompt, device ?? "");
    await user.click(
      screen.getByRole("button", { name: "Erase disk and replace" }),
    );
    expect(
      await screen.findByText(
        /^Rebuilding onto .* has started\.$/,
        {},
        { timeout: 30000 },
      ),
    ).toBeVisible();
    const sent = params("Zfs.deviceReplace")[0];
    expect(sent?.pool).toBe("tank");
    expect(String(sent?.olddevice)).toMatch(/^\/dev\/disk\/by-id\/.*-part1$/);
    expect(String(sent?.newdevice)).toMatch(/^\/dev\/disk\/by-id\//);
    await waitFor(() => expect(callNames()).toContain("Zfs.getPoolDevices"));
  }, 60000);
});
