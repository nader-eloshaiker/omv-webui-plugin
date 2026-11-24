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
import { openNavGroup } from "./support/shell.ts";

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

  // Dashboard: the pool as one item for its file systems (ZFS design 10.1), as text: this story has
  // no ZFS plugin answering, so the pool has no page here.
  const storage = page.getByRole("region", {
    name: copy.dashboard.storage.title,
  });
  await expect(
    storage.getByRole("meter", { name: "ZFS pool tank" }),
  ).toBeVisible();
  await expect(
    storage.getByText("2 file systems share this space"),
  ).toBeVisible();
  await expect(storage.getByRole("link", { name: /tank/ })).toHaveCount(0);
  expect(calls).toContain("FileSystemMgmt.enumerateMountedFilesystems");

  // File systems: listed, said to be managed with the pool, no page and no action.
  await openNavGroup(page, "storage");
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
  await openNavGroup(page, "storage");
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

// ---- The ZFS pages on the remembering ZFS mock (phase 5 ZFS design 1 to 9, 15.1) ----------------

async function signInWith(
  page: Page,
  rpc: { calls: readonly string[] },
  scenario: Parameters<typeof answerWithScenario>[1],
) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill("example-admin");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
  expect(rpc.calls).toContain("Session.login");
  const calls = await answerWithScenario(page, scenario, STORAGE_CALLS);
  await page.goto("/ui/");
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
  return calls;
}

async function expectNoSidewaysScroll(page: Page, tables: string[] = []) {
  await page.setViewportSize({ width: 320, height: 800 });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, "the page scrolls sideways at 320px").toBeLessThanOrEqual(0);
  // The named tables keep their key facts on screen: their frames do not scroll sideways either.
  for (const name of tables) {
    const frame = page.getByRole("region", { name, exact: true });
    const inside = await frame.evaluate(
      (el) => el.scrollWidth - el.clientWidth,
    );
    expect(inside, `${name} scrolls sideways at 320px`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

test("at a phone's width the pools, a pool's file systems and the snapshots keep their key facts on screen", async ({
  page,
  rpc,
}) => {
  await signInWith(page, rpc, "zfsHostile");
  await page.goto("/ui/storage/zfs");
  await expect(
    page.getByRole("table", { name: copy.zfs.tableLabel }),
  ).toBeVisible();
  await expectNoSidewaysScroll(page, [copy.zfs.tableLabel]);
  await answerWithScenario(page, "zfsMirror", STORAGE_CALLS);
  await page.goto("/ui/storage/zfs/pools/tank");
  await expect(
    page.getByRole("table", { name: "File systems on pool tank" }),
  ).toBeVisible();
  await expectNoSidewaysScroll(page, ["File systems on pool tank"]);
  await page.goto("/ui/storage/zfs/fs/tank/media");
  await expect(
    page.getByRole("table", { name: "Snapshots of tank/media" }),
  ).toBeVisible();
  await expectNoSidewaysScroll(page, ["Snapshots of tank/media"]);
});

const ZFS_CHANGES = [
  "Zfs.addPool",
  "Zfs.addObject",
  "Zfs.setProperties",
  "Zfs.quickSnapshot",
  "Zfs.rollbackSnapshot",
  "Zfs.deleteObjectBg",
  "Zfs.scrubPool",
  "Zfs.stopScrub",
  "Zfs.deviceReplace",
  "Zfs.deviceOffline",
  "Zfs.deviceOnline",
  "Zfs.clearPool",
];

test("the ZFS menu item, the list and a pool's page, changing nothing; the dashboard row", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "zfsDegraded");
  // The dashboard reads getPoolStatus once, and names the degraded pool (10.1, P14).
  await expect(
    page.getByText("ZFS pool tank: a disk is missing or has failed."),
  ).toBeVisible();
  expect(calls).not.toContain("Zfs.listPools");
  await openNavGroup(page, "storage");
  await page
    .getByRole("navigation", { name: copy.app.navigation })
    .getByRole("link", { name: copy.nav.items.storage.zfs })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.zfs.title }),
  ).toBeVisible();
  await expect(page.getByText("1 of 1 pool: Critical")).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.getByRole("link", { name: "Open pool tank" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Pool tank" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: copy.zfsPool.todo.offlineTitle }),
  ).toBeVisible();
  await expectNoSidewaysScroll(page);
  for (const call of ZFS_CHANGES) {
    expect(calls).not.toContain(call);
  }
});

test("creates a mirror with the file system data at one checkpoint, after the typed names", async ({
  page,
  rpc,
}) => {
  test.setTimeout(90_000);
  const calls = await signInWith(page, rpc, "zfsNone");
  await page.goto("/ui/storage/zfs/create");
  await expect(
    page.getByRole("heading", { level: 1, name: copy.zfsCreate.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: /^Mirror, recommended/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: /^No protection \(stripe\)/ }),
  ).not.toBeChecked();
  await expectNoSidewaysScroll(page);
  await page.getByRole("checkbox", { name: /^\/dev\/sdb\s?, / }).click();
  await page.getByRole("checkbox", { name: /^\/dev\/sdc\s?, / }).click();
  await page.getByRole("textbox", { name: copy.zfsCreate.name }).fill("tank");
  await page.getByRole("button", { name: copy.zfsCreate.continue }).click();
  await expect(page.getByText(copy.zfsCreate.summaryTitle)).toBeVisible();
  const confirm = page.getByRole("button", {
    name: "Erase 2 disks and create pool",
  });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  const field = page.getByRole("textbox", {
    name: "Type /dev/sdb /dev/sdc to confirm.",
  });
  await field.fill("/dev/sdb /dev/sdc");
  await field.press("Enter");
  expect(calls).not.toContain("Zfs.addPool");
  const before = calls.length;
  await confirm.click();
  await expect(page.getByText(copy.zfsCreate.doneTitle)).toBeVisible({
    timeout: 60_000,
  });
  const run = calls.slice(before);
  expect(run.indexOf("Zfs.getEmptyCandidates")).toBeLessThan(
    run.indexOf("Zfs.addPool"),
  );
  expect(run.indexOf("Zfs.addPool")).toBeLessThan(run.indexOf("Zfs.addObject"));
  expect(run.filter((c) => c === "Config.applyChangesBg")).toHaveLength(1);
  await expect(
    page.getByRole("region", { name: copy.addStorage.handover.title }),
  ).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.getByRole("link", { name: "Open pool tank" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Pool tank" }),
  ).toBeVisible();
});

test("a file system's snapshot is taken, then its file system and the pool are deleted", async ({
  page,
  rpc,
}) => {
  test.setTimeout(120_000);
  const calls = await signInWith(page, rpc, "zfsMirror");
  await page.goto("/ui/storage/zfs/fs/tank/media");
  await expect(
    page.getByRole("heading", { level: 2, name: copy.zfsSnap.title }),
  ).toBeVisible();
  await page.getByRole("button", { name: copy.zfsSnap.take }).click();
  await expect
    .poll(() => calls.filter((c) => c === "Zfs.quickSnapshot"))
    .toHaveLength(1);
  await expectNoSidewaysScroll(page);
  await page.getByRole("button", { name: copy.zfsDelete.fs.open }).click();
  let dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByRole("button", { name: copy.zfsDelete.cancel }),
  ).toBeFocused();
  await dialog.getByRole("textbox").fill("tank/media");
  await dialog.getByRole("button", { name: copy.zfsDelete.fs.confirm }).click();
  await expect(page.getByText("tank/media was deleted.")).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("link", { name: "Open pool tank" }).click();
  await page.getByRole("button", { name: copy.zfsDelete.pool.open }).click();
  dialog = page.getByRole("alertdialog");
  await dialog.getByRole("textbox").fill("tank");
  await dialog
    .getByRole("button", { name: copy.zfsDelete.pool.confirm })
    .click();
  await expect(page.getByText("Pool tank was deleted.")).toBeVisible({
    timeout: 60_000,
  });
  expect(calls.filter((c) => c === "Zfs.deleteObjectBg")).toHaveLength(2);
  expect(calls.filter((c) => c === "Config.applyChangesBg")).toHaveLength(2);
});

test("without the plugin: no menu item and the page says what to install", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "zfsNoPlugin");
  await page.goto("/ui/storage/zfs");
  await expect(page.getByText(copy.zfs.notInstalled.title)).toBeVisible();
  await openNavGroup(page, "storage");
  await expect(
    page
      .getByRole("navigation", { name: copy.app.navigation })
      .getByRole("link", { name: copy.nav.items.storage.zfs }),
  ).toHaveCount(0);
  for (const call of ZFS_CHANGES) {
    expect(calls).not.toContain(call);
  }
});
