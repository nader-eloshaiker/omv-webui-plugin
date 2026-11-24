// SPDX-License-Identifier: GPL-3.0-or-later
// Shared folders, access and Windows and Mac sharing (SMB) on the test VM (phase 5 shares design 1 to
// 8). Read-only by default: the list with its Sharing column, the SMB page, the existing shared
// folder's page (its access, its SMB section and its delete section, nothing saved), and the add
// flow's choices, left without confirming. The existing shared folder and its file system are never
// changed.
//
// A real journey runs ONLY when OMV_WEBUI_VM_SCRATCH_DISK names a disk (a kernel name such as "sdd")
// AND Flow A offers that disk as an empty disk AND nothing is pending: Flow A makes EXT4 on it and
// hands over to "Add a shared folder", which makes a shared folder there with the test person given
// Read and write and shares it over SMB (turning SMB on when it is off); its page then saves a
// description, changes the share's options, stops sharing; the SMB page turns SMB off again when this
// test turned it on; the folder is removed keeping its files; a second folder made without sharing is
// deleted with its files; the file system is unmounted and the disk wiped. Every change is applied
// through the band or the flows' own checkpoints, so nothing is left pending and SMB's settings end as
// they began.
//
// Account names, the host name, addresses, UUIDs and serial numbers come from the VM and are never
// printed. Any CSP or Trusted Types report, console error, page error or request to another origin
// fails a test (support/vmFixtures.ts), except the replies listed below.
import type { Page, Response } from "@playwright/test";
import copy from "../../src/locales/en/common.json" with { type: "json" };
import { revealPendingBand } from "../support/shell.ts";
import { expect, target, test } from "./support/vmFixtures.ts";
import type { Account } from "./support/vmTarget.ts";

test.skip(
  target === null,
  "No VM env file ($OMV_WEBUI_ENV); the VM suite is skipped.",
);

const DISK_NAME = /^[a-z][a-z0-9]{0,31}$/;
// Documentation names, made and removed by this test only.
const SHARED = "webui-test-share";
const UNSHARED = "webui-test-files";

test.use({
  extraAllowances: {
    list: [
      {
        reason:
          "the RAID plugin is not installed (404) and the VM's disks have no monitoring settings (500)",
        matches: (message, origin) =>
          message.location().url === `${origin}/rpc.php` &&
          /^Failed to load resource: the server responded with a status of (404|500)/.test(
            message.text(),
          ),
      },
    ],
  },
});

async function signIn(page: Page, account: Account) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill(account.username);
  await page.getByLabel(copy.signIn.password).fill(account.password);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

const callOf = (response: Response) => {
  const body: unknown = response.request().postDataJSON();
  return `${String(field(body, "service"))}.${String(field(body, "method"))}`;
};

interface Watch {
  calls: string[];
  replies: Map<string, unknown>;
  unexpected: string[];
}

function watch(page: Page): Watch {
  const seen: Watch = { calls: [], replies: new Map(), unexpected: [] };
  page.on("response", async (response) => {
    if (!response.url().endsWith("/rpc.php")) {
      return;
    }
    let name: string;
    try {
      name = callOf(response);
    } catch {
      return;
    }
    seen.calls.push(name);
    try {
      const envelope: unknown = await response.json();
      if (response.status() === 200) {
        seen.replies.set(name, field(envelope, "response"));
        return;
      }
      const expected =
        response.status() === 401 ||
        (response.status() === 404 && name === "MdMgmt.enumerateDevices") ||
        (response.status() === 500 && name === "Smart.getDeviceSettings");
      if (!expected) {
        seen.unexpected.push(`${name} ${String(response.status())}`);
      }
    } catch {
      // The page went away before the body arrived.
    }
  });
  return seen;
}

const WRITES = [
  "ShareMgmt.set",
  "ShareMgmt.setPrivileges",
  "ShareMgmt.delete",
  "SMB.setSettings",
  "SMB.setShare",
  "SMB.deleteShare",
  "Config.applyChangesBg",
  "Config.revertChangesBg",
];

const pendingCount = (seen: Watch) => {
  const dirty = field(
    seen.replies.get("System.getInformation"),
    "dirtyModules",
  );
  return typeof dirty === "object" && dirty !== null
    ? Object.keys(dirty).length
    : Array.isArray(dirty)
      ? dirty.length
      : -1;
};

/** Apply what is pending through the band, and wait until it has gone. */
async function applyPending(page: Page) {
  const band = page.getByRole("region", { name: copy.pending.label });
  await revealPendingBand(page);
  await expect(band).toBeVisible({ timeout: 30_000 });
  const apply = band.getByRole("button", { name: /^Apply \d+ change/ });
  const label = ((await apply.textContent()) ?? "").trim();
  await apply.click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: label })
    .click();
  await expect(band).toHaveCount(0, { timeout: 180_000 });
}

/** The access row of a person or group, by its accessible name. */
const accessChoice = (page: Page, name: string) =>
  page.getByRole("radiogroup", {
    // The name is isolated in the label (FSI and PDI), as every name inside a sentence is.
    name: copy.access.rowLabel.replace("{{name}}", `\u2068${name}\u2069`),
  });

test.describe("shares on the VM", () => {
  test("lists the shared folders with their sharing, and opens the SMB page, writing nothing", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    await page.goto("/ui/storage/shared-folders");
    await expect(
      page.getByRole("columnheader", { name: copy.sharedFolders.col.sharing }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("link", { name: /^Open shared folder / }).first(),
    ).toBeVisible();
    expect(seen.calls).toContain("SMB.getShareList");

    await page.goto("/ui/services/smb");
    await expect(
      page.getByRole("heading", { level: 1, name: copy.smb.title }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("button", { name: copy.smb.turnOn })
        .or(page.getByRole("button", { name: copy.smb.turnOff })),
    ).toBeVisible({ timeout: 30_000 });
    expect(seen.calls).toContain("SMB.getSettings");
    for (const call of WRITES) {
      expect(seen.calls).not.toContain(call);
    }
    expect(seen.unexpected).toEqual([]);
  });

  test("opens the existing shared folder's page and the add flow, writing nothing", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    await page.goto("/ui/storage/shared-folders");
    const first = page
      .getByRole("link", { name: /^Open shared folder / })
      .first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.click();
    await expect(
      page.getByRole("heading", { level: 2, name: copy.access.title }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("heading", { level: 2, name: copy.folderSmb.title }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: copy.shareDelete.keep.open }),
    ).toBeVisible();
    await expect.poll(() => seen.calls).toContain("UserMgmt.getUserList");
    await expect.poll(() => seen.calls).toContain("UserMgmt.getGroupList");

    await page.goto("/ui/storage/shared-folders/add");
    await expect(
      page
        .getByRole("button", { name: copy.addShare.continue })
        .or(page.getByText(copy.addStorage.preflightTitle)),
    ).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => seen.calls).toContain("ShareMgmt.getCandidates");

    // A malformed or unknown address shows the not-found state and makes no folder call.
    await page.goto("/ui/storage/shared-folders/not-a-uuid");
    await expect(page.getByText(copy.sharedFolder.notFound)).toBeVisible();
    for (const call of WRITES) {
      expect(seen.calls).not.toContain(call);
    }
    expect(seen.unexpected).toEqual([]);
  });

  test("makes, shares, changes, stops and deletes shared folders on OMV_WEBUI_VM_SCRATCH_DISK, only when Flow A offers it empty", async ({
    page,
    vm,
  }) => {
    const name = process.env.OMV_WEBUI_VM_SCRATCH_DISK?.trim() ?? "";
    test.skip(
      !DISK_NAME.test(name),
      "OMV_WEBUI_VM_SCRATCH_DISK does not name a disk (such as sdd); nothing is created.",
    );
    test.setTimeout(900_000);
    const device = `/dev/${name}`;
    const seen = watch(page);
    await signIn(page, vm.admin);

    // Was SMB on before? Only a test that turned it on turns it off again.
    await page.goto("/ui/services/smb");
    const turnOn = page.getByRole("button", { name: copy.smb.turnOn });
    const turnOff = page.getByRole("button", { name: copy.smb.turnOff });
    await expect(turnOn.or(turnOff)).toBeVisible({ timeout: 30_000 });
    const smbWasOn = await turnOff.isVisible();

    // A. Flow A on the scratch disk, then its handover to "Add a shared folder".
    await page.goto("/ui/storage/filesystems/add");
    const empty = page
      .getByRole("group", { name: copy.addStorage.group.empty })
      .getByRole("radio", { name: new RegExp(`^${device}, `) });
    const preflight = page.getByText(copy.addStorage.preflightTitle);
    const continueButton = page.getByRole("button", {
      name: copy.addStorage.continue,
    });
    await expect(
      preflight.or(continueButton).or(page.getByText(copy.addStorage.none)),
    ).toBeVisible({ timeout: 60_000 });
    test.skip(
      await preflight.isVisible(),
      "Changes are pending on the VM; Flow A does not start, and nothing is created.",
    );
    test.skip(
      (await empty.count()) === 0,
      "Flow A does not offer this disk as an empty disk; nothing is created.",
    );
    await empty.click();
    await page
      .getByRole("textbox", { name: copy.filesystem.settings.tags })
      .fill("webui-test");
    await continueButton.click();
    await page
      .getByRole("textbox", { name: `Type ${device} to confirm.` })
      .fill(device);
    await page.getByRole("button", { name: copy.addStorage.confirm }).click();
    await expect(page.getByText(copy.addStorage.doneTitle)).toBeVisible({
      timeout: 240_000,
    });
    await page
      .getByRole("button", { name: copy.addStorage.handover.button })
      .or(page.getByRole("link", { name: copy.addStorage.handover.button }))
      .first()
      .click();

    // B. Add a shared folder on it: the handed-over file system is chosen; the test person gets
    // Read and write; shared with Windows and Mac computers.
    await expect(
      page.getByRole("button", { name: copy.addShare.continue }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole("radio", {
        name: new RegExp(`^EXT4 on ${device}1 `),
        checked: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: copy.addShare.name.label })
      .fill(SHARED);
    await accessChoice(page, vm.user.username)
      .getByRole("radio", { name: copy.access.rw })
      .click();
    await expect(
      page.getByRole("checkbox", { name: copy.addShare.smb.label }),
    ).toBeChecked();
    await page.getByRole("button", { name: copy.addShare.continue }).click();
    expect(seen.calls).not.toContain("ShareMgmt.set");
    await page.getByRole("button", { name: copy.addShare.confirm }).click();
    await expect(
      page.getByText(copy.addShare.done.title.replace("{{name}}", SHARED)),
    ).toBeVisible({ timeout: 240_000 });
    expect(seen.calls.filter((c) => c === "ShareMgmt.set")).toHaveLength(1);
    expect(seen.calls).toContain("ShareMgmt.setPrivileges");
    expect(seen.calls).toContain("SMB.setShare");

    // C. Its page: a description, saved and applied through the band.
    await page.getByRole("link", { name: copy.addShare.done.open }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: SHARED }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      accessChoice(page, vm.user.username).getByRole("radio", {
        name: copy.access.rw,
      }),
    ).toBeChecked();
    await page
      .getByRole("button", { name: copy.sharedFolder.description.edit })
      .click();
    await page
      .getByRole("textbox", { name: copy.sharedFolder.description.label })
      .fill("Made by the browser test");
    // Enter in the field saves (design 2.6).
    await page
      .getByRole("textbox", { name: copy.sharedFolder.description.label })
      .press("Enter");
    await expect(
      page.getByText(copy.sharedFolder.description.saved).first(),
    ).toBeVisible({ timeout: 30_000 });
    await applyPending(page);
    await expect(page.getByText("Made by the browser test")).toBeVisible();

    // D. The share's options: read only for everyone, saved and applied.
    const sharing = page.getByRole("region", { name: copy.folderSmb.title });
    await sharing.getByRole("button", { name: copy.folderSmb.change }).click();
    await sharing
      .getByRole("checkbox", { name: copy.folderSmb.form.readonly })
      .click();
    await sharing
      .getByRole("button", { name: copy.folderSmb.form.save })
      .click();
    await applyPending(page);

    // E. Stop sharing, applied; then SMB off again if this test turned it on.
    await sharing
      .getByRole("button", { name: copy.folderSmb.stop.open })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: copy.folderSmb.stop.confirm, exact: true })
      .click();
    await applyPending(page);
    await expect(sharing.getByText(copy.folderSmb.notShared)).toBeVisible({
      timeout: 30_000,
    });
    expect(seen.calls).toContain("SMB.deleteShare");
    if (!smbWasOn) {
      await page.goto("/ui/services/smb");
      await page.getByRole("button", { name: copy.smb.turnOff }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: copy.smb.off.confirm, exact: true })
        .click();
      await applyPending(page);
      await expect(
        page.getByRole("button", { name: copy.smb.turnOn }),
      ).toBeVisible();
    }

    // F. Remove it, keeping its files: the dialog's own step applies the change.
    await page.goto("/ui/storage/shared-folders");
    await page
      .getByRole("link", { name: `Open shared folder ${SHARED}` })
      .click();
    const keep = page.getByRole("button", { name: copy.shareDelete.keep.open });
    await expect(keep).toHaveAttribute("aria-disabled", "false", {
      timeout: 30_000,
    });
    await keep.click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: copy.shareDelete.keep.confirm })
      .click({ timeout: 30_000 });
    await expect(
      page.getByText(/ was removed\. Its files are still on /),
    ).toBeVisible({
      timeout: 120_000,
    });

    // G. A second folder, not shared, deleted with its files (typed confirmation).
    await page.goto("/ui/storage/shared-folders/add");
    await expect(
      page.getByRole("button", { name: copy.addShare.continue }),
    ).toBeVisible({ timeout: 60_000 });
    await page
      .getByRole("radio", { name: new RegExp(`^EXT4 on ${device}1 ?`) })
      .click();
    await page
      .getByRole("textbox", { name: copy.addShare.name.label })
      .fill(UNSHARED);
    await page.getByRole("checkbox", { name: copy.addShare.smb.label }).click();
    await page.getByRole("button", { name: copy.addShare.continue }).click();
    await page.getByRole("button", { name: copy.addShare.confirm }).click();
    await expect(
      page.getByText(copy.addShare.done.title.replace("{{name}}", UNSHARED)),
    ).toBeVisible({ timeout: 240_000 });
    await page.getByRole("link", { name: copy.addShare.done.open }).click();
    const files = page.getByRole("button", {
      name: copy.shareDelete.files.open,
    });
    await expect(files).toHaveAttribute("aria-disabled", "false", {
      timeout: 30_000,
    });
    await files.click();
    const dialog = page.getByRole("alertdialog");
    await dialog
      .getByRole("textbox", {
        name: copy.shareDelete.files.typePrompt.replace("{{folder}}", UNSHARED),
      })
      .fill(UNSHARED);
    await dialog
      .getByRole("button", { name: copy.shareDelete.files.confirm })
      .click();
    await expect(page.getByText(/ and its files were deleted\.$/)).toBeVisible({
      timeout: 120_000,
    });
    expect(seen.calls.filter((c) => c === "ShareMgmt.delete")).toHaveLength(2);

    // H. Unmount the file system and wipe the disk, as the file-systems test does.
    await page.goto("/ui/storage/filesystems");
    await page
      .getByRole("table", { name: copy.filesystems.tableLabel, exact: true })
      .getByRole("row")
      .filter({ hasText: `${device}1` })
      .getByRole("link", { name: /^Open file system / })
      .click();
    const unmount = page.getByRole("region", { name: copy.fsUnmount.title });
    const open = unmount.getByRole("button", { name: copy.fsUnmount.open });
    await expect(open).toHaveAttribute("aria-disabled", "false", {
      timeout: 30_000,
    });
    await open.click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: copy.fsUnmount.confirm, exact: true })
      .click({ timeout: 30_000 });
    await expect(page.getByText(/ was unmounted\.$/)).toBeVisible({
      timeout: 120_000,
    });
    await page.goto(`/ui/storage/disks/${name}`);
    const wipe = page.getByRole("region", { name: copy.wipe.title });
    const wipeButton = wipe.getByRole("button", { name: copy.wipe.open });
    await expect(wipe).not.toContainText(copy.wipe.checking, {
      timeout: 30_000,
    });
    await wipeButton.click();
    const wipeDialog = page.getByRole("alertdialog");
    await wipeDialog
      .getByRole("textbox", { name: `Type ${device} to confirm.` })
      .fill(device);
    await wipeDialog.getByRole("button", { name: copy.wipe.confirm }).click();
    await expect(wipe.getByText(`${device} was wiped.`)).toBeVisible({
      timeout: 90_000,
    });

    // I. Nothing is left pending.
    await page.goto("/ui/storage/shared-folders");
    await expect(
      page.getByRole("link", { name: `Open shared folder ${SHARED}` }),
    ).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(() => pendingCount(seen), { timeout: 30_000 }).toBe(0);
    expect(seen.unexpected).toEqual([]);
  });
});
