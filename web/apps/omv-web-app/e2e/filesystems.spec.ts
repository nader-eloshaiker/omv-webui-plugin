// SPDX-License-Identifier: GPL-3.0-or-later
// File systems and Flow A in the production build, under the snippet's headers (UI-1, Trusted Types
// enforced), on the app's remembering file-system mock (phase 5 file-systems design 1 to 7): the list
// from the menu, a file system's page with its refusal and its report read only on request, Flow A from
// an empty disk to mounted and handed over for sharing, and Combine disks. Nothing is created before the
// typed name, and never before step 1's re-check. Any CSP or Trusted Types violation, console error,
// page error or request to another origin fails a test (support/fixtures.ts). Each page is also shown
// at 320 CSS px without sideways scroll.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { Page } from "@playwright/test";
import copy from "../src/locales/en/common.json" with { type: "json" };
import { expect, test } from "./support/fixtures.ts";
import { answerWithScenario, STORAGE_CALLS } from "./support/scenarioRoute.ts";
import { openNavGroup } from "./support/shell.ts";

// Typed into the mock only; no real system is involved.
const PASSWORD = "not-a-real-password";
const SDA1 = CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value.data[0];

async function signIn(page: Page) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill("example-admin");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
}

async function expectNoSidewaysScroll(page: Page) {
  await page.setViewportSize({ width: 320, height: 800 });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, "the page scrolls sideways at 320px").toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 720 });
}

test("the File systems list from the menu, with what is found and the mount dialog", async ({
  page,
  rpc,
}) => {
  // Signed in through the shared mock first; the storage calls are the scenario's from then on.
  await signIn(page);
  expect(rpc.calls).toContain("Session.login");
  const calls = await answerWithScenario(page, "admin", STORAGE_CALLS);
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
  await expect(table.getByText(copy.filesystems.system.line)).toBeVisible();
  await expect(
    table.getByRole("link", { name: "Open file system EXT4 on /dev/sda1" }),
  ).toBeVisible();
  const found = page.getByRole("table", {
    name: copy.filesystems.found.tableLabel,
  });
  const mount = found.getByRole("button", { name: "Mount cidata" });
  await mount.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Mount cidata" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(calls).not.toContain("FileSystemMgmt.setMountPoint");
  expect(calls).not.toContain("FileSystemMgmt.getCandidatesBg");
  expect(calls).not.toContain("FileSystemMgmt.getDetails");
  // At a phone's width a device name stays whole: "/dev/sr0" is one line, not a character per line.
  await page.setViewportSize({ width: 390, height: 800 });
  const sr0 = found.getByText("/dev/sr0", { exact: true });
  const box = await sr0.boundingBox();
  const fontSize = await sr0.evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).fontSize),
  );
  expect(box?.height ?? Infinity, "/dev/sr0 wraps").toBeLessThan(fontSize * 2);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expectNoSidewaysScroll(page);
});

test("a file system's page refuses an unmount while it is used, and reads its report only on request", async ({
  page,
  rpc,
}) => {
  // Signed in through the shared mock first; the storage calls are the scenario's from then on.
  await signIn(page);
  expect(rpc.calls).toContain("Session.login");
  const calls = await answerWithScenario(page, "admin", STORAGE_CALLS);
  await page.goto(`/ui/storage/filesystems/${SDA1.uuid}`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "File system EXT4 on /dev/sda1",
    }),
  ).toBeVisible();
  const unmount = page.getByRole("region", { name: copy.fsUnmount.title });
  await expect(
    unmount.getByText("Shared folders use it: a4share."),
  ).toBeVisible();
  await expect(
    unmount.getByRole("button", { name: copy.fsUnmount.open }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(calls).not.toContain("FileSystemMgmt.getDetails");
  const details = page.getByRole("region", {
    name: copy.filesystem.details.title,
  });
  await details
    .getByRole("button", { name: copy.filesystem.details.show })
    .click();
  await expect(
    details.getByRole("region", {
      name: "Technical details of EXT4 on /dev/sda1",
    }),
  ).toContainText("Filesystem magic number");
  expect(calls.filter((c) => c === "FileSystemMgmt.getDetails")).toHaveLength(
    1,
  );
  expect(calls).not.toContain("FileSystemMgmt.umountByDir");
  await expectNoSidewaysScroll(page);
});

test("Flow A creates and mounts a file system on an empty disk, only after the typed name", async ({
  page,
  rpc,
}) => {
  test.setTimeout(60_000);
  // Signed in through the shared mock first; the storage calls are the scenario's from then on.
  await signIn(page);
  expect(rpc.calls).toContain("Session.login");
  const calls = await answerWithScenario(page, "admin", STORAGE_CALLS);
  await page.goto("/ui/storage/filesystems");
  await page.getByRole("link", { name: copy.filesystems.add }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: copy.addStorage.title }),
  ).toBeVisible();
  const sdd = page.getByRole("radio", { name: /^\/dev\/sdd, / });
  await expect(sdd).toBeVisible();
  await expectNoSidewaysScroll(page);
  await sdd.click();
  await page.getByRole("button", { name: copy.addStorage.continue }).click();
  await expect(page.getByText(copy.addStorage.summaryTitle)).toBeVisible();
  const confirm = page.getByRole("button", { name: copy.addStorage.confirm });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  const field = page.getByRole("textbox", {
    name: "Type /dev/sdd to confirm.",
  });
  await field.fill("/dev/sdd");
  await field.press("Enter");
  expect(calls).not.toContain("FileSystemMgmt.create");
  const before = calls.length;
  await confirm.click();
  await expect(page.getByText(copy.addStorage.doneTitle)).toBeVisible({
    timeout: 30_000,
  });
  const run = calls.slice(before);
  expect(run.indexOf("FileSystemMgmt.getCandidatesBg")).toBeLessThan(
    run.indexOf("FileSystemMgmt.create"),
  );
  expect(run.indexOf("FileSystemMgmt.create")).toBeLessThan(
    run.indexOf("FileSystemMgmt.setMountPoint"),
  );
  expect(run.indexOf("FileSystemMgmt.setMountPoint")).toBeLessThan(
    run.indexOf("Config.applyChangesBg"),
  );
  expect(run).not.toContain("DiskMgmt.wipe");
  const handover = page.getByRole("region", {
    name: copy.addStorage.handover.title,
  });
  // The handover is one button to "Add a shared folder" (shares design 6.7).
  await expect(
    handover.getByRole("link", { name: copy.addStorage.handover.button }),
  ).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("Combine disks confirms every device name and creates one BTRFS file system", async ({
  page,
  rpc,
}) => {
  test.setTimeout(60_000);
  // Signed in through the shared mock first; the storage calls are the scenario's from then on.
  await signIn(page);
  expect(rpc.calls).toContain("Session.login");
  const calls = await answerWithScenario(page, "admin", STORAGE_CALLS);
  await page.goto("/ui/storage/filesystems/add-multi");
  await expect(
    page.getByRole("heading", { level: 2, name: copy.addStorage.multi.title }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /^\/dev\/sdb, / }).click();
  await page.getByRole("checkbox", { name: /^\/dev\/sdc, / }).click();
  await page.getByRole("button", { name: copy.addStorage.continue }).click();
  await page
    .getByRole("textbox", { name: "Type /dev/sdb /dev/sdc to confirm." })
    .fill("/dev/sdb  /dev/sdc");
  await page
    .getByRole("button", { name: "Erase 2 disks and create file system" })
    .click();
  await expect(page.getByText(copy.addStorage.doneTitle)).toBeVisible({
    timeout: 30_000,
  });
  expect(calls.filter((c) => c === "FileSystemMgmt.createBtrfs")).toHaveLength(
    1,
  );
});
