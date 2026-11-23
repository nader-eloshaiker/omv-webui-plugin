// SPDX-License-Identifier: GPL-3.0-or-later
// NFS, the rsync server, copy jobs and the rest of SMB (phase 5 services design 1 to 12), in the
// production build under the snippet's headers, on the remembering services mock
// (src/mocks/servicesScenarios.ts): the NFS page turned on, and off through its confirmation; a
// network let in from a folder's page and stopped; a folder offered to the rsync server with a sign-in
// (the password typed twice, never pre-filled) and stopped; a copy job that deletes added through its
// trial and the typed turn-on; Run now with its task, stopped; a job deleted; a recycle bin emptied
// behind the typed name; and no stored password (the mock's EXAMPLE-PASSWORD) anywhere on the pages
// that read one. Every page loads without a page error, console error or CSP violation
// (support/fixtures.ts fails the test on any). No real system is involved.
import type { Page } from "@playwright/test";
import copy from "../src/locales/en/common.json" with { type: "json" };
import type { ScenarioName } from "../src/mocks/scenarios.ts";
import {
  EXAMPLE_PASSWORD,
  SERVICES_FOLDERS,
  SERVICES_JOBS,
} from "../src/mocks/servicesScenarios.ts";
import { expect, test } from "./support/fixtures.ts";
import { answerWithScenario, STORAGE_CALLS } from "./support/scenarioRoute.ts";

/** A name as the page writes it: each name inside it isolated (FSI and PDI), which a match ignores. */
const isolated = (text: string): RegExp =>
  new RegExp(
    [...text]
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[\\u2068\\u2069]*"),
  );

// Typed into the mock only.
const PASSWORD = "not-a-real-password";
const MODULE_PASSWORD = "pw-Q7xz-mock-only";

const SERVICES_CALLS = (call: string): boolean =>
  STORAGE_CALLS(call) ||
  /^(NFS|Rsync|Rsyncd|SMB|CertificateMgmt|ShareMgmt|UserMgmt)\./.test(call);

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
  return answerWithScenario(page, scenario, SERVICES_CALLS);
}

/** A sentence with names inside it, each optionally isolated (FSI and PDI) as the pages show them. */
const sentence = (text: string) =>
  new RegExp(
    `^${text
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\{\\\{(\w+)\\\}\\\}/g, "\\u2068?.+?\\u2069?")}$`,
  );

const LONG = { timeout: 30_000 };

test("turns Linux and Unix sharing on, to the band", async ({ page, rpc }) => {
  const calls = await signInWith(page, rpc, "servicesNone");
  await page.goto("/ui/services/nfs");
  await expect(
    page.getByRole("heading", { level: 1, name: copy.nfs.title }),
  ).toBeVisible();
  await expect(page.getByText(copy.nfs.state.off)).toBeVisible();
  expect(calls).not.toContain("NFS.setSettings");
  await page
    .getByRole("button", { name: copy.nfs.turnOn, exact: true })
    .click();
  await expect(page.getByText(copy.nfs.turnedOn).first()).toBeVisible(LONG);
  expect(calls).toContain("NFS.setSettings");
  await expect(
    page.getByRole("button", { name: copy.nfs.turnOff }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: copy.pending.label }),
  ).toBeVisible();
});

test("turns Linux and Unix sharing off through its confirmation, naming the folders", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "servicesSome");
  await page.goto("/ui/services/nfs");
  await page.getByRole("button", { name: copy.nfs.turnOff }).click();
  const dialog = page.getByRole("alertdialog", { name: copy.nfs.off.title });
  await expect(dialog).toContainText("Media");
  await expect(dialog).toContainText("Backup");
  expect(calls).not.toContain("NFS.setSettings");
  await dialog
    .getByRole("button", { name: copy.nfs.off.confirm, exact: true })
    .click();
  await expect(page.getByText(copy.nfs.turnedOff).first()).toBeVisible(LONG);
  expect(calls).toContain("NFS.setSettings");
  await expect(
    page.getByRole("button", { name: copy.nfs.turnOn, exact: true }),
  ).toBeVisible();
});

test("lets a network in from a folder's page, read only, and stops letting it in", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "servicesSome");
  await page.goto(`/ui/storage/shared-folders/${SERVICES_FOLDERS.photos}`);
  const section = page.getByRole("region", { name: copy.folderNfs.title });
  await expect(section.getByText(copy.folderNfs.notShared)).toBeVisible(LONG);
  await section.getByRole("button", { name: copy.folderNfs.letIn }).click();
  const form = section.getByRole("form", {
    name: copy.folderNfs.form.titleNew,
  });
  await form.getByRole("radio", { name: copy.folderNfs.form.network }).click();
  await form
    .getByRole("textbox", { name: copy.folderNfs.form.networkField })
    .fill("192.0.2.0/24");
  await form.getByRole("radio", { name: copy.access.ro, exact: true }).click();
  expect(calls).not.toContain("NFS.setShare");
  await form
    .getByRole("button", { name: copy.folderNfs.form.letIn, exact: true })
    .click();
  await expect(
    section.getByRole("heading", { level: 3, name: /^Computers on / }),
  ).toContainText("192.0.2.0/24", LONG);
  expect(calls).toContain("NFS.setShare");
  await expect(
    page.getByRole("region", { name: copy.pending.label }),
  ).toBeVisible();

  await section.getByRole("button", { name: copy.folderNfs.stop.open }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("192.0.2.0/24");
  await dialog
    .getByRole("button", { name: copy.folderNfs.stop.confirm, exact: true })
    .click();
  await expect(section.getByText(copy.folderNfs.notShared)).toBeVisible(LONG);
  expect(calls).toContain("NFS.deleteShare");
});

test("offers a folder to the rsync server with a sign-in typed twice, and stops offering it", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "servicesSome");
  await page.goto("/ui/services/rsync");
  await page.getByRole("link", { name: copy.rsync.tab.server }).click();
  await expect(page).toHaveURL(/\/ui\/services\/rsync\/server$/);
  await page.getByRole("button", { name: copy.rsyncd.modules.add }).click();
  const dialog = page.getByRole("dialog", { name: copy.module.titleNew });
  await dialog.getByRole("combobox", { name: copy.module.folder }).click();
  await page.getByRole("option", { name: /^Backup/ }).click();
  await expect(
    dialog.getByRole("textbox", { name: copy.module.name }),
  ).toHaveValue("Backup");
  await expect(
    dialog.getByRole("checkbox", { name: copy.module.ask }),
  ).toBeChecked();
  const password = dialog.getByLabel(copy.module.password, { exact: true });
  const again = dialog.getByLabel(copy.password.again, { exact: true });
  // Never pre-filled, and never offered to a password manager as the user's own (UI-6).
  await expect(password).toHaveValue("");
  await expect(again).toHaveValue("");
  await expect(password).toHaveAttribute("autocomplete", "new-password");
  await dialog
    .getByRole("textbox", { name: copy.module.signInName, exact: true })
    .fill("copier2");
  await password.fill(MODULE_PASSWORD);
  await again.fill(MODULE_PASSWORD);
  expect(calls).not.toContain("Rsyncd.setModule");
  await dialog.getByRole("button", { name: copy.module.offer }).click();
  await expect(page.getByText(sentence(copy.module.saved)).first()).toBeVisible(
    LONG,
  );
  expect(calls).toContain("Rsyncd.setModule");
  const offered = page
    .getByRole("region", { name: copy.rsyncd.modules.title })
    .first();
  await expect(offered).toContainText("rsync://nas/Backup/");
  // The typed password is nowhere once the request is over.
  expect(await page.content()).not.toContain(MODULE_PASSWORD);

  await page
    .getByRole("button", {
      name: copy.rsyncd.actionsFor.replace("{{folder}}", "Backup"),
    })
    .click();
  await page.getByRole("menuitem", { name: copy.module.action.stop }).click();
  const stop = page.getByRole("alertdialog");
  await expect(stop).toContainText(copy.module.stop.signIn);
  await stop
    .getByRole("button", { name: copy.module.stop.confirm, exact: true })
    .click();
  await expect(
    page.getByText(sentence(copy.module.stopped)).first(),
  ).toBeVisible(LONG);
  expect(calls).toContain("Rsyncd.deleteModule");
  await expect(offered).not.toContainText("rsync://nas/Backup/");
});

test("adds a copy job that deletes through its trial, and turns it on with the destination typed", async ({
  page,
  rpc,
}) => {
  test.setTimeout(90_000);
  const calls = await signInWith(page, rpc, "jobsTrial");
  await page.goto("/ui/services/rsync");
  await page.getByRole("link", { name: copy.jobs.add }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.addJob.title }),
  ).toBeVisible();
  const folders = page.getByRole("combobox", { name: copy.addJob.folder });
  for (const [index, name] of [
    [0, /^Photos/],
    [1, /^Backup/],
  ] as const) {
    const select = folders.nth(index);
    await expect(select).not.toHaveAttribute("aria-disabled", "true", LONG);
    await select.click();
    await page.getByRole("option", { name }).click();
    // The list closes before the next one opens: two would hold the same options.
    await expect(page.getByRole("listbox")).toHaveCount(0);
  }
  await page.getByRole("checkbox", { name: /^Also delete files in / }).click();
  await expect(page.getByText(copy.addJob.deleteWarn3)).toBeVisible();
  await page.getByRole("button", { name: copy.addJob.review }).click();
  const summary = page.getByRole("region", {
    name: copy.addJob.summary.title,
  });
  await expect(
    summary.getByRole("button", { name: copy.addJob.saveOn }),
  ).toHaveCount(0);
  expect(calls).not.toContain("Rsync.set");
  await summary.getByRole("button", { name: copy.addJob.saveTry }).click();

  await expect(page.getByText(copy.addJob.trial.ok)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator("body")).toContainText(
    "It would delete 12 files from Backup.",
  );
  await expect(page.locator("body")).toContainText("old-copies/file-12.txt");
  for (const call of ["Rsync.set", "Config.applyChangesBg", "Rsync.execute"]) {
    expect(calls).toContain(call);
  }

  await page.getByRole("button", { name: copy.addJob.turnOn.button }).click();
  const dialog = page.getByRole("alertdialog", {
    name: isolated("Turn on Photos to Backup, which deletes files in Backup?"),
  });
  await expect(dialog).toContainText("The trial run listed 12 such files now.");
  const confirm = dialog.getByRole("button", {
    name: copy.addJob.turnOnDelete.confirm,
  });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await dialog.getByRole("textbox").fill("Backup");
  await confirm.click();
  await expect(
    page.getByText(isolated("Photos to Backup is on.")).first(),
  ).toBeVisible({
    timeout: 60_000,
  });
  expect(calls.filter((c) => c === "Rsync.set")).toHaveLength(2);
});

test("runs a copy job now as a task, and stops it after a plain confirmation", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "jobsRun");
  await page.goto(`/ui/services/rsync/jobs/${SERVICES_JOBS.long}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Media to Backup (large)" }),
  ).toBeVisible(LONG);
  const run = page.getByRole("button", { name: copy.jobs.action.run });
  await expect(run).not.toHaveAttribute("aria-disabled", "true", LONG);
  await run.click();
  await page
    .getByRole("alertdialog", { name: isolated("Copy Media to Backup now?") })
    .getByRole("button", { name: copy.runJob.copy.confirm })
    .click();
  await expect(
    page.getByRole("heading", {
      level: 3,
      name: isolated("Copy job: Media to Backup (large)"),
    }),
  ).toBeVisible(LONG);
  expect(calls).toContain("Rsync.execute");
  await expect(page.getByText(copy.runJob.running)).toBeVisible();
  await page.getByRole("button", { name: copy.runJob.stop }).click();
  await page
    .getByRole("alertdialog", {
      name: isolated("Stop Media to Backup (large)?"),
    })
    .getByRole("button", { name: copy.runJob.stopConfirm, exact: true })
    .click();
  await expect(
    page.getByText(isolated("Media to Backup (large) was stopped.")).first(),
  ).toBeVisible(LONG);
  expect(calls).toContain("Exec.stop");
});

test("deletes a copy job after a plain confirmation, to the band", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "servicesSome");
  await page.goto(`/ui/services/rsync/jobs/${SERVICES_JOBS.local}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Media to Backup" }),
  ).toBeVisible(LONG);
  await page.getByRole("button", { name: copy.job.delete.button }).click();
  const dialog = page.getByRole("alertdialog", {
    name: isolated("Delete the copy job Media to Backup?"),
  });
  await expect(dialog).toContainText("The files it copied stay in");
  expect(calls).not.toContain("Rsync.delete");
  await dialog
    .getByRole("button", { name: copy.deleteJob.confirm, exact: true })
    .click();
  await expect(
    page.getByText(
      isolated("Media to Backup will be deleted when you apply the changes."),
    ),
  ).toBeVisible(LONG);
  expect(calls).toContain("Rsync.delete");
  await expect(
    page.getByRole("region", { name: copy.jobs.tableLabel }).first(),
  ).toBeVisible(LONG);
  await expect(
    page.getByRole("region", { name: copy.pending.label }),
  ).toBeVisible();
});

test("empties a share's recycle bin only after the folder's name is typed", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "recycleBin");
  await page.goto(`/ui/storage/shared-folders/${SERVICES_FOLDERS.photos}`);
  const smb = page.getByRole("region", { name: copy.folderSmb.title });
  await smb.getByRole("button", { name: copy.folderSmb.empty.label }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(copy.folderSmb.empty.body);
  const confirm = dialog.getByRole("button", {
    name: copy.folderSmb.empty.confirm,
  });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await dialog.getByRole("textbox").fill("Photos");
  expect(calls).not.toContain("SMB.emptyRecycleBin");
  await confirm.click();
  await expect(
    page.getByText(sentence(copy.folderSmb.empty.done)).first(),
  ).toBeVisible(LONG);
  expect(calls).toContain("SMB.emptyRecycleBin");
  await expect(
    page.getByRole("region", {
      name: /^Output of emptying the recycle bin of /,
    }),
  ).toContainText("removed directory");
  // The task's handle is never in the page (UI-5).
  expect(await page.content()).not.toContain("/tmp/bgstatus");
});

test("shows no stored password on the pages whose reads carry one", async ({
  page,
  rpc,
}) => {
  await signInWith(page, rpc, "servicesSome");
  // The rsync server folder with a sign-in, its change dialog open.
  await page.goto("/ui/services/rsync/server");
  await page
    .getByRole("button", {
      name: copy.rsyncd.actionsFor.replace("{{folder}}", "Photos"),
    })
    .click();
  await page.getByRole("menuitem", { name: copy.module.action.change }).click();
  await expect(
    page.getByRole("dialog").getByText(copy.module.passwordSet),
  ).toBeVisible(LONG);
  await expect(page.locator("body")).not.toContainText(EXAMPLE_PASSWORD);
  expect(await page.content()).not.toContain(EXAMPLE_PASSWORD);
  await page.keyboard.press("Escape");

  // The copy jobs list, and the job that signs in with a password.
  await page.goto("/ui/services/rsync");
  await expect(
    page.getByRole("region", { name: copy.jobs.tableLabel }).first(),
  ).toContainText("Media to Backup", LONG);
  await expect(page.locator("body")).not.toContainText(EXAMPLE_PASSWORD);
  await page.goto(`/ui/services/rsync/jobs/${SERVICES_JOBS.pull}`);
  await expect(page.getByText(copy.job.signIn.passwordSet)).toBeVisible(LONG);
  await expect(page.locator("body")).not.toContainText(EXAMPLE_PASSWORD);
  expect(await page.content()).not.toContain(EXAMPLE_PASSWORD);
});
