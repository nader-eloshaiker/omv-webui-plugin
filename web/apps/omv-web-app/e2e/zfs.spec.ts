// SPDX-License-Identifier: GPL-3.0-or-later
// A NAS with a ZFS pool, in the production build under the snippet's headers, on the mock's fsZfs
// scenario: the test VM's captured lists with the mirror tank on sdb and sdc and its file system
// tank/media, each listed with no UUID (null). The dashboard, File systems, Disks, a member disk's page
// and Add storage all load without a page error (support/fixtures.ts fails the test on any page error,
// console error or CSP violation), show the ZFS file systems with their usage and no page of their own,
// and never offer the pool's disks.
import type { Page } from "@playwright/test";
import copy from "../src/locales/en/common.json" with { type: "json" };
import { expect, test } from "./support/fixtures.ts";
import { answerWithScenario, STORAGE_CALLS } from "./support/scenarioRoute.ts";

// Typed into the mock only; no real system is involved.
const PASSWORD = "not-a-real-password";
const ZFS_LINE =
  "Part of the ZFS pool tank. It is managed with the pool in the classic interface, not here.";
const ZFS_BLOCKER =
  "It is part of the ZFS pool tank. Wiping it would damage the pool.";

async function signInWithZfs(page: Page) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill("example-admin");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
  // The storage calls are the scenario's from a fresh load of the start page on.
  const calls = await answerWithScenario(page, "fsZfs", STORAGE_CALLS);
  await page.goto("/ui/");
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
  return calls;
}

test("the dashboard, File systems and Disks load with a ZFS pool present", async ({
  page,
  rpc,
}) => {
  const calls = await signInWithZfs(page);
  expect(rpc.calls).toContain("Session.login");

  // Dashboard: each ZFS file system with its figures, as text.
  const storage = page.getByRole("region", {
    name: copy.dashboard.storage.title,
  });
  await expect(
    storage.getByRole("meter", { name: "tank/media" }),
  ).toBeVisible();
  await expect(
    storage.getByRole("meter", { name: "tank", exact: true }),
  ).toBeVisible();
  await expect(storage.getByRole("link", { name: "tank/media" })).toHaveCount(
    0,
  );
  expect(calls).toContain("FileSystemMgmt.enumerateMountedFilesystems");

  // File systems: listed, said to be managed with the pool, no page and no action.
  await page
    .getByRole("navigation", { name: copy.app.navigation })
    .getByRole("link", { name: copy.nav.items.storage.filesystems })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.filesystems.title }),
  ).toBeVisible();
  const table = page.getByRole("table", {
    name: copy.filesystems.tableLabel,
    exact: true,
  });
  const media = table.getByRole("row").filter({ hasText: "tank/media" });
  await expect(media).toContainText(ZFS_LINE);
  await expect(media).toContainText("ZFS");
  // Its disks are links to their pages; nothing leads to a page of its own.
  await expect(media.locator('a[href^="/ui/storage/filesystems"]')).toHaveCount(
    0,
  );
  await expect(media.getByRole("button")).toHaveCount(0);
  await expect(
    table.getByRole("link", { name: "Open file system EXT4 on /dev/sda1" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: copy.filesystems.found.tableLabel })
      .getByText("tank/media"),
  ).toHaveCount(0);

  // Disks: the pool's disks are part of it.
  await page
    .getByRole("navigation", { name: copy.app.navigation })
    .getByRole("link", { name: copy.nav.items.storage.disks, exact: true })
    .click();
  const disks = page.getByRole("table", { name: copy.disks.tableLabel });
  for (const device of ["/dev/sdb", "/dev/sdc"]) {
    await expect(
      disks.getByRole("row").filter({
        has: page.getByRole("link", { name: `Open disk ${device}` }),
      }),
    ).toContainText("Part of ZFS pool tank");
  }

  // A member's page refuses the wipe, naming the pool.
  await disks.getByRole("link", { name: "Open disk /dev/sdb" }).click();
  const wipe = page.getByRole("region", { name: "Wipe this disk" });
  await expect(wipe).toContainText(ZFS_BLOCKER);
  await expect(
    wipe.getByRole("button", { name: "Wipe disk…" }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(calls).not.toContain("DiskMgmt.wipe");
});

test("Add storage never offers a ZFS pool's disks", async ({ page, rpc }) => {
  const calls = await signInWithZfs(page);
  expect(rpc.calls).toContain("Session.login");
  await page.goto("/ui/storage/filesystems/add");
  await expect(
    page.getByRole("heading", { level: 2, name: copy.addStorage.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: /^\/dev\/sdd, / }),
  ).toBeVisible();
  for (const device of ["sdb", "sdc"]) {
    await expect(
      page.getByRole("radio", { name: new RegExp(`^/dev/${device}, `) }),
    ).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: /^Disks that cannot be used/ })
    .click();
  await expect(page.getByText(ZFS_BLOCKER)).toHaveCount(2);
  expect(calls).not.toContain("FileSystemMgmt.create");
});
