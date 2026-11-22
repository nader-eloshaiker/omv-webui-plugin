// SPDX-License-Identifier: GPL-3.0-or-later
// Shared folders, access and Windows and Mac sharing (phase 5 shares design 1 to 8), in the production
// build under the snippet's headers, on the remembering shares mock (src/mocks/sharesScenarios.ts):
// the list, a folder's page with its access saved, the add flow run to its result, the SMB page turned
// off through its confirmation, and a delete with every file behind its typed name. Every page loads
// without a page error, console error or CSP violation (support/fixtures.ts fails the test on any).
// No real system is involved.
import type { Page } from "@playwright/test";
import copy from "../src/locales/en/common.json" with { type: "json" };
import type { ScenarioName } from "../src/mocks/scenarios.ts";
import { expect, test } from "./support/fixtures.ts";
import { answerWithScenario, STORAGE_CALLS } from "./support/scenarioRoute.ts";

// Typed into the mock only.
const PASSWORD = "not-a-real-password";

const SHARES_CALLS = (call: string): boolean =>
  STORAGE_CALLS(call) || /^(ShareMgmt|UserMgmt|SMB)\./.test(call);

async function signInWith(
  page: Page,
  rpc: { calls: string[] },
  scenario: ScenarioName,
) {
  expect(rpc.calls).toEqual([]);
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill("example-admin");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
  return answerWithScenario(page, scenario, SHARES_CALLS);
}

const accessChoice = (page: Page, name: string) =>
  page.getByRole("radiogroup", {
    // The name is isolated in the label (FSI and PDI), as every name inside a sentence is.
    name: copy.access.rowLabel.replace("{{name}}", `\u2068${name}\u2069`),
  });

test("the list shows how folders are shared, and a folder's access is saved to the band", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "sharesSome");
  await page.goto("/ui/storage/shared-folders");
  await expect(
    page.getByRole("columnheader", { name: copy.sharedFolders.col.sharing }),
  ).toBeVisible();
  await expect(
    page.getByText(copy.sharedFolders.sharing.guests).filter({ visible: true }),
  ).toHaveCount(1);
  expect(calls).toContain("SMB.getShareList");

  await page.getByRole("link", { name: "Open shared folder Photos" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Photos" }),
  ).toBeVisible();
  const sam = accessChoice(page, "sam");
  await expect(sam.getByRole("radio", { name: copy.access.ro })).toBeChecked();
  await sam.getByRole("radio", { name: copy.access.rw }).click();
  await expect(
    page
      .getByText(copy.access.changed, { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(1);
  expect(calls).not.toContain("ShareMgmt.setPrivileges");
  await page.getByRole("button", { name: copy.access.save }).click();
  await expect(page.getByText(/^Access to \S*Photos\S* saved\.$/)).toHaveCount(
    1,
  );
  expect(calls).toContain("ShareMgmt.setPrivileges");
  await expect(
    page.getByRole("region", { name: copy.pending.label }),
  ).toBeVisible();
});

test("adds a shared folder with access and SMB sharing, to its result", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "sharesNone");
  await page.goto("/ui/storage/shared-folders");
  await page
    .getByRole("link", { name: copy.sharedFolders.add })
    .first()
    .click();
  const continueButton = page.getByRole("button", {
    name: copy.addShare.continue,
  });
  await expect(continueButton).toBeVisible();
  const fs = page.getByRole("radiogroup", { name: copy.addShare.fs.legend });
  if ((await fs.getByRole("radio", { checked: true }).count()) === 0) {
    await fs.getByRole("radio").first().click();
  }
  await page
    .getByRole("textbox", { name: copy.addShare.name.label })
    .fill("Photos");
  await accessChoice(page, "alex")
    .getByRole("radio", { name: copy.access.rw })
    .click();
  await expect(
    page.getByRole("checkbox", { name: copy.addShare.smb.label }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: copy.folderSmb.form.guest }),
  ).not.toBeChecked();
  await continueButton.click();
  await expect(
    page.getByText(copy.addShare.sum.title, { exact: true }),
  ).toBeVisible();
  expect(calls).not.toContain("ShareMgmt.set");
  await page.getByRole("button", { name: copy.addShare.confirm }).click();
  await expect(
    page.getByText(copy.addShare.done.title.replace("{{name}}", "Photos")),
  ).toBeVisible({ timeout: 30_000 });
  for (const call of [
    "ShareMgmt.set",
    "ShareMgmt.setPrivileges",
    "SMB.setSettings",
    "SMB.setShare",
    "Config.applyChangesBg",
  ]) {
    expect(calls).toContain(call);
  }
  await page.getByRole("link", { name: copy.addShare.done.open }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Photos" }),
  ).toBeVisible();
});

test("turns Windows and Mac sharing off through its confirmation", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "sharesSome");
  await page.goto("/ui/services/smb");
  await expect(
    page.getByRole("heading", { level: 1, name: copy.smb.title }),
  ).toBeVisible();
  await page.getByRole("button", { name: copy.smb.turnOff }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Photos");
  await expect(dialog).toContainText("Public");
  await dialog
    .getByRole("button", { name: copy.smb.off.confirm, exact: true })
    .click();
  await expect(page.getByText(copy.smb.turnedOff).first()).toBeVisible();
  expect(calls).toContain("SMB.setSettings");
  await expect(
    page.getByRole("button", { name: copy.smb.turnOn }),
  ).toBeVisible();
});

test("deletes a folder with its files only after its name is typed", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "sharesSome");
  await page.goto("/ui/storage/shared-folders");
  await page.getByRole("link", { name: "Open shared folder Backups" }).click();
  const files = page.getByRole("button", {
    name: copy.shareDelete.files.open,
  });
  await expect(files).toHaveAttribute("aria-disabled", "false");
  await files.click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", {
    name: copy.shareDelete.files.confirm,
  });
  await expect(confirm).toBeVisible();
  await expect(confirm).toBeDisabled();
  await dialog
    .getByRole("textbox", {
      name: copy.shareDelete.files.typePrompt.replace("{{folder}}", "Backups"),
    })
    .fill("Backups");
  expect(calls).not.toContain("ShareMgmt.delete");
  await confirm.click();
  await expect(
    page.getByText("Backups and its files were deleted."),
  ).toBeVisible({
    timeout: 30_000,
  });
  expect(calls).toContain("ShareMgmt.delete");
});
