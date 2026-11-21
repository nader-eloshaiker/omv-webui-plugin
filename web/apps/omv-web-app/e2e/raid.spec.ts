// SPDX-License-Identifier: GPL-3.0-or-later
// RAID in the production build, under the snippet's headers (UI-1, Trusted Types enforced), on the
// app's remembering RAID mock (phase 5 RAID design 1 to 7, 15.1): the list from the menu, creating a
// mirror that goes on into a mounted file system, Flow F on a mirror with a failed disk (take it out,
// add the new one, watch it rebuild), a typed delete, and the not-installed state with no menu item.
// Nothing changes an array before its confirmation and its re-reads. Any CSP or Trusted Types
// violation, console error, page error or request to another origin fails a test
// (support/fixtures.ts). Each page is also shown at 320 CSS px without sideways scroll.
import type { Page } from "@playwright/test";
import copy from "../src/locales/en/common.json" with { type: "json" };
import { expect, test } from "./support/fixtures.ts";
import { answerWithScenario, STORAGE_CALLS } from "./support/scenarioRoute.ts";

// Typed into the mock only; no real system is involved.
const PASSWORD = "not-a-real-password";

async function signIn(page: Page) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill("example-admin");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
}

/**
 * Signed in through the shared mock, then the storage calls are the scenario's from a fresh load of
 * the start page on: the shell's RAID probe then asks the scenario too.
 */
async function signInWith(
  page: Page,
  rpc: { calls: readonly string[] },
  scenario: Parameters<typeof answerWithScenario>[1],
) {
  await signIn(page);
  expect(rpc.calls).toContain("Session.login");
  const calls = await answerWithScenario(page, scenario, STORAGE_CALLS);
  await page.goto("/ui/");
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
  return calls;
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

const CHANGES = [
  "MdMgmt.create",
  "MdMgmt.add",
  "MdMgmt.grow",
  "MdMgmt.remove",
  "MdMgmt.delete",
  "MdMgmt.setSyncAction",
];

test("the RAID list from the menu, then an array's page, changing nothing", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "raidFailed");
  // The dashboard never reads the arrays: reading them reads a member disk (journal, 2026-11-21).
  await page.waitForTimeout(500);
  expect(calls).not.toContain("MdMgmt.enumerateDevices");
  await page
    .getByRole("navigation", { name: copy.app.navigation })
    .getByRole("link", { name: copy.nav.items.storage.md })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.raid.title }),
  ).toBeVisible();
  const table = page.getByRole("table", { name: copy.raid.tableLabel });
  await expect(table).toContainText("1 of 2 disks working");
  await expect(page.getByText("1 of 1 array: Critical")).toBeVisible();
  await expectNoSidewaysScroll(page);
  await table.getByRole("link", { name: "Open RAID /dev/md0" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "RAID /dev/md0" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: copy.array.now.failedTitle }),
  ).toBeVisible();
  await expectNoSidewaysScroll(page);
  for (const call of CHANGES) {
    expect(calls).not.toContain(call);
  }
});

test("creates a mirror that goes on into a mounted file system, only after the typed names", async ({
  page,
  rpc,
}) => {
  test.setTimeout(90_000);
  const calls = await signInWith(page, rpc, "admin");
  await page.goto("/ui/storage/md");
  await page.getByRole("link", { name: copy.raid.create }).first().click();
  await expect(
    page.getByRole("heading", { level: 2, name: copy.raidCreate.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: /^Mirror \(RAID1\), recommended/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: /^Stripe \(RAID0\), no protection/ }),
  ).not.toBeChecked();
  await expectNoSidewaysScroll(page);
  await page.getByRole("checkbox", { name: /^\/dev\/sdb\s?, / }).click();
  await page.getByRole("checkbox", { name: /^\/dev\/sdc\s?, / }).click();
  await page.getByRole("button", { name: copy.raidCreate.continue }).click();
  await expect(page.getByText(copy.raidCreate.summaryTitle)).toBeVisible();
  const confirm = page.getByRole("button", {
    name: "Erase 2 disks and create array",
  });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  const field = page.getByRole("textbox", {
    name: "Type /dev/sdb /dev/sdc to confirm.",
  });
  await field.fill("/dev/sdb /dev/sdc");
  await field.press("Enter");
  expect(calls).not.toContain("MdMgmt.create");
  const before = calls.length;
  await confirm.click();
  await expect(page.getByText(copy.raidCreate.doneTitle)).toBeVisible({
    timeout: 60_000,
  });
  const run = calls.slice(before);
  expect(run.indexOf("MdMgmt.getCandidates")).toBeLessThan(
    run.indexOf("MdMgmt.create"),
  );
  expect(run.indexOf("MdMgmt.create")).toBeLessThan(
    run.indexOf("FileSystemMgmt.create"),
  );
  expect(run.filter((c) => c === "Config.applyChangesBg")).toHaveLength(1);
  await expect(
    page.getByRole("region", { name: copy.addStorage.handover.title }),
  ).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.getByRole("link", { name: "Open RAID /dev/md0" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "RAID /dev/md0" }),
  ).toBeVisible();
  await expect(page.getByRole("progressbar").first()).toBeVisible();
});

test("Flow F: takes the failed disk out, adds the new one, and the array rebuilds", async ({
  page,
  rpc,
}) => {
  test.setTimeout(90_000);
  const calls = await signInWith(page, rpc, "raidFailed");
  await page.goto("/ui/storage/md/md0");
  await page.getByRole("button", { name: copy.array.now.takeOut }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByRole("heading", {
      name: "Take /dev/sdb out of RAID /dev/md0?",
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: copy.raidRemove.cancel }),
  ).toBeFocused();
  await dialog
    .getByRole("button", { name: copy.raidRemove.confirmPlain })
    .click();
  await expect(
    page.getByText("/dev/sdb was taken out of RAID /dev/md0."),
  ).toBeVisible();
  expect(calls.filter((c) => c === "MdMgmt.remove")).toHaveLength(1);
  await expect(
    page.getByRole("heading", { name: copy.array.now.missingTitle }),
  ).toBeVisible();
  await page.getByRole("link", { name: copy.array.now.addNew }).first().click();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Add a disk to RAID /dev/md0",
    }),
  ).toBeVisible();
  // Taking the disk out left the array's settings pending: the flow applies them first (R1).
  await expect(page.getByText(copy.addStorage.preflightTitle)).toBeVisible();
  await page.getByRole("button", { name: copy.addStorage.applyThem }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Apply 2 changes" })
    .click();
  // The disk just taken out keeps the array's marks: it is offered to be erased first.
  await page.getByRole("radio", { name: /^\/dev\/sdb\s?, / }).click();
  await page.getByRole("button", { name: copy.raidCreate.continue }).click();
  await page
    .getByRole("textbox", { name: "Type /dev/sdb to confirm." })
    .fill("/dev/sdb");
  expect(calls).not.toContain("MdMgmt.add");
  await page.getByRole("button", { name: "Erase disk and add it" }).click();
  await expect(page.getByText(copy.raidAdd.done.replaceTitle)).toBeVisible({
    timeout: 60_000,
  });
  const run = calls.slice(calls.indexOf("MdMgmt.remove") + 1);
  expect(run.indexOf("DiskMgmt.wipe")).toBeLessThan(run.indexOf("MdMgmt.add"));
  await page.getByRole("link", { name: "Open RAID /dev/md0" }).click();
  await expect(
    page.getByRole("heading", { name: copy.array.now.rebuildingTitle }),
  ).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("deletes an empty array only after its name is typed", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "raidMirror");
  await page.goto("/ui/storage/md/md0");
  const open = page.getByRole("button", { name: copy.raidDelete.open });
  await expect(open).toHaveAttribute("aria-disabled", "false");
  await open.click();
  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByRole("heading", { name: "Delete RAID /dev/md0?" }),
  ).toBeVisible();
  const field = dialog.getByRole("textbox", {
    name: "Type /dev/md0 to confirm.",
  });
  await field.fill("/dev/md0");
  await field.press("Enter");
  expect(calls).not.toContain("MdMgmt.delete");
  await dialog.getByRole("button", { name: copy.raidDelete.confirm }).click();
  await expect(page.getByText("RAID /dev/md0 was deleted.")).toBeVisible();
  expect(calls.filter((c) => c === "MdMgmt.delete")).toHaveLength(1);
});

test("without the plugin there is no RAID item, and its address says what to install", async ({
  page,
  rpc,
  observed,
}) => {
  const calls = await signInWith(page, rpc, "raidNoPlugin");
  const nav = page.getByRole("navigation", { name: copy.app.navigation });
  await expect(
    nav.getByRole("link", { name: copy.nav.items.storage.filesystems }),
  ).toBeVisible();
  await expect(
    nav.getByRole("link", { name: copy.nav.items.storage.md, exact: true }),
  ).toHaveCount(0);
  expect(calls).toContain("MdMgmt.getCandidates");
  expect(calls).not.toContain("MdMgmt.enumerateDevices");
  await page.goto("/ui/storage/md");
  await expect(page.getByText(copy.raid.notInstalled.title)).toBeVisible();
  await expectNoSidewaysScroll(page);
  // OMV's 404 for a service it does not know is the expected answer here, and the only failure.
  const notFound = /status of 404 \(Not Found\) \(http:\/\/[^)]+\/rpc\.php\)$/;
  observed.consoleErrors.splice(
    0,
    observed.consoleErrors.length,
    ...observed.consoleErrors.filter((m) => !notFound.test(m)),
  );
});
