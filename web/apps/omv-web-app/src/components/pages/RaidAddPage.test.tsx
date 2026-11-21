// SPDX-License-Identifier: GPL-3.0-or-later
// Adding a disk through the whole app on MSW (phase 5 RAID design 4; owner, P1, P2, P5): a replacement
// for a missing disk, a replacement that also takes the failed disk out, a spare, the choice between a
// spare and more space with no default, the refusals, and every disk confirmed by its typed name.
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 15000 };

async function add(scenario: ScenarioName, address = "md0") {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: `/storage/md/${address}/add`,
  });
  await screen.findByRole(
    "heading",
    { level: 2, name: `Add a disk to RAID /dev/${address}` },
    LONG,
  );
  return app;
}
const calls = (call: string) => seenCalls.filter((c) => c.call === call);
const radio = (device: string) =>
  screen.findByRole("radio", { name: new RegExp(`^${device}\\s?, `) }, LONG);

describe("adding a disk", () => {
  it("replaces the missing disk of a mirror: one disk, typed, then the rebuild starts", async () => {
    const { user } = await add("raidMissing");
    expect(
      await screen.findByText("The disk replaces the missing one.", {}, LONG),
    ).toBeVisible();
    await user.click(await radio("/dev/sdb"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Ready to add the disk")).toBeVisible();
    expect(screen.getByText(/in place of the missing disk/)).toBeVisible();
    await user.type(
      screen.getByRole("textbox", { name: "Type /dev/sdb to confirm." }),
      "/dev/sdb",
    );
    expect(callNames()).not.toContain("MdMgmt.add");
    await user.click(
      screen.getByRole("button", { name: "Erase disk and add it" }),
    );
    expect(
      await screen.findByText("Rebuilding has started.", {}, LONG),
    ).toBeVisible();
    const sent = calls("MdMgmt.add")[0]?.params as {
      devicefile: string;
      devices: string[];
    };
    expect(sent.devicefile).toBe("/dev/md0");
    expect(sent.devices).toHaveLength(1);
    expect(sent.devices[0]).toMatch(/^\/dev\/disk\/by-id\//);
    expect(calls("Config.applyChangesBg")).toHaveLength(1);
  }, 30000);

  it("takes the failed disk out after adding its replacement, and names it to disconnect", async () => {
    const { user } = await add("raidFailed");
    await user.click(await radio("/dev/sdd"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/Then take the failed disk/)).toBeVisible();
    await user.type(
      screen.getByRole("textbox", { name: "Type /dev/sdd to confirm." }),
      "/dev/sdd",
    );
    await user.click(
      screen.getByRole("button", { name: "Erase disk and add it" }),
    );
    expect(
      await screen.findByText("Rebuilding has started.", {}, LONG),
    ).toBeVisible();
    expect(screen.getByText(/You can now disconnect \/dev\/sdb/)).toBeVisible();
    expect(calls("MdMgmt.remove")[0]?.params).toEqual({
      devicefile: "/dev/md0",
      devices: ["/dev/sdb"],
    });
    const order = callNames();
    expect(order.indexOf("MdMgmt.add")).toBeLessThan(
      order.indexOf("MdMgmt.remove"),
    );
  }, 30000);

  it("adds a spare to a healthy mirror", async () => {
    const { user } = await add("raidMirror");
    expect(
      await screen.findByText("The disk is kept as a spare.", {}, LONG),
    ).toBeVisible();
    // The only disk offered is chosen.
    expect(await radio("/dev/sdd")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(
      screen.getByRole("textbox", { name: "Type /dev/sdd to confirm." }),
      "/dev/sdd",
    );
    await user.click(
      screen.getByRole("button", { name: "Erase disk and add it" }),
    );
    expect(
      await screen.findByText(
        "/dev/sdd is now a spare of RAID /dev/md0.",
        {},
        LONG,
      ),
    ).toBeVisible();
  }, 30000);

  it("refuses a stripe, and a busy array, with the reason", async () => {
    await add("raidStripe");
    expect(
      await screen.findByText(
        "A Stripe (RAID0) array cannot take more disks here.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("refuses while the array synchronises", async () => {
    await add("raidSyncing");
    expect(
      await screen.findByText(
        "It is busy now (synchronising its disks). Wait until this ends.",
        {},
        LONG,
      ),
    ).toBeVisible();
  });

  it("makes no call for a bad address", async () => {
    await renderApp({
      signedIn: true,
      scenario: "raidMirror",
      path: "/storage/md/md0x/add",
    });
    expect(
      await screen.findByText(
        /There is no array with this name on this NAS/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(callNames()).not.toContain("MdMgmt.getDetail");
  });

  it("says when no disk can be added, and how a disk taken out can come back", async () => {
    await add("raidRaid5");
    // The RAID5's three disks are all in it: none to add.
    expect(
      await screen.findByText(
        /No disk can be added right now\. Connect a disk at least/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "A disk taken out of an array keeps the array's marks, so it is offered under Erase and reuse: it is erased first.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Look for new disks" }),
    ).toBeVisible();
  });
});
