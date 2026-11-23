// SPDX-License-Identifier: GPL-3.0-or-later
// NFS, the rsync server, copy jobs and the rest of SMB on the test VM (phase 5 services design 1 to
// 13). Read-only first: the NFS page, the Rsync page's two tabs and the SMB page's workgroup card open
// with their real reads and make no other call; a normal user gets the administrators-only page with
// none of this slice's calls.
//
// A real journey runs ONLY when OMV_WEBUI_VM_SCRATCH_DISK names a disk (a kernel name such as "sdd")
// AND Flow A offers that disk as an empty disk AND nothing is pending: Flow A makes EXT4 on it, and
// two shared folders with documentation names are made there (webui-test-src, webui-test-dest), not
// shared over SMB. The source folder's page lets in the network 192.0.2.0/24 read only over NFS,
// applied, then stops letting it in, applied (NFS turned on first only when it was off, and off again
// at the end, through the NFS page). The source folder is offered to the rsync server with a sign-in
// whose password is made for this run and never printed, applied, then no longer offered, applied
// (the rsync server turned on and off again only when it was off). A local copy job from the source
// into the destination that also deletes is added through the trial and the typed turn-on, "Only
// when I start it", run now to its end, then deleted and applied. The workgroup card is only opened.
// Both shared folders are deleted with their files, the file system unmounted and the disk wiped, as
// shares.vm.spec.ts does, so the VM ends as it began: nothing pending, no NFS entry, rsync server
// folder or copy job of this test, NFS and the rsync server as they were. The system disks, the
// existing shared folder and the existing accounts are never touched.
//
// Account names, the host name, addresses, UUIDs and serial numbers come from the VM and are never
// printed. Any CSP or Trusted Types report, console error, page error or request to another origin
// fails a test (support/vmFixtures.ts), except the replies listed below.
import type { Page, Response } from "@playwright/test";
import { randomBytes } from "node:crypto";
import copy from "../../src/locales/en/common.json" with { type: "json" };
import { expect, target, test } from "./support/vmFixtures.ts";
import type { Account } from "./support/vmTarget.ts";

test.skip(
  target === null,
  "No VM env file ($OMV_WEBUI_ENV); the VM suite is skipped.",
);

const DISK_NAME = /^[a-z][a-z0-9]{0,31}$/;
/** Never these: the VM's system disks. */
const SYSTEM_DISKS = new Set(["sda", "nvme0n1"]);
// Documentation names and addresses, made and removed by this test only.
const SRC = "webui-test-src";
const DEST = "webui-test-dest";
const NETWORK = "192.0.2.0/24";
const SIGN_IN = "webui-test";

/** A sentence as the page writes it: each name inside it isolated (FSI and PDI), which a match ignores. */
const isolated = (text: string): RegExp =>
  new RegExp(
    [...text]
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[\\u2068\\u2069]*"),
  );

const JOB = copy.jobs.name.auto
  .replace("{{src}}", SRC)
  .replace("{{dest}}", DEST);

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

/** The calls made, the last reply of each, and any failure that was not expected. */
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

/** Every write this slice and the shell can make. */
const WRITES = [
  "NFS.setSettings",
  "NFS.setShare",
  "NFS.deleteShare",
  "Rsyncd.setSettings",
  "Rsyncd.setModule",
  "Rsyncd.deleteModule",
  "Rsync.set",
  "Rsync.delete",
  "Rsync.execute",
  "SMB.setSettings",
  "SMB.setShare",
  "SMB.deleteShare",
  "SMB.emptyRecycleBin",
  "ShareMgmt.set",
  "ShareMgmt.setPrivileges",
  "ShareMgmt.delete",
  "Exec.stop",
  "Config.applyChangesBg",
  "Config.revertChangesBg",
];

/**
 * A read: a get, enumerate, is or list method that starts no task. Exec.getOutput reads a task's
 * output, and a ...Bg method starts one; neither belongs on a page that only reads.
 */
const isRead = (call: string) =>
  /\.(get|enumerate|is|list)[A-Za-z]*$/.test(call) &&
  !call.endsWith("Bg") &&
  call !== "Exec.getOutput";

/** The calls made after sign-in that are not reads. */
const notReads = (seen: Watch, from: number) =>
  seen.calls.slice(from).filter((call) => !isRead(call));

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

/** A sentence with names inside it, each optionally isolated (FSI and PDI) as the pages show them. */
const sentence = (text: string) =>
  new RegExp(
    `^${text
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\{\\\{(\w+)\\\}\\\}/g, "\\u2068?.+?\\u2069?")
      .replace(/<(\w+)><\/\1>/g, "\\u2068?.+?\\u2069?")}$`,
  );

/** The NFS page's switch: whether it says on (Turn off…) or off (Turn on). */
async function nfsIsOn(page: Page): Promise<boolean> {
  await page.goto("/ui/services/nfs");
  const turnOn = page.getByRole("button", {
    name: copy.nfs.turnOn,
    exact: true,
  });
  const turnOff = page.getByRole("button", { name: copy.nfs.turnOff });
  await expect(turnOn.or(turnOff)).toBeVisible({ timeout: 30_000 });
  return turnOff.isVisible();
}

/** The rsync server tab's switch: whether it says on (Turn off…) or off (Turn on). */
async function rsyncdIsOn(page: Page): Promise<boolean> {
  await page.goto("/ui/services/rsync/server");
  const turnOn = page.getByRole("button", {
    name: copy.rsyncd.turnOn,
    exact: true,
  });
  const turnOff = page.getByRole("button", { name: copy.rsyncd.turnOff });
  await expect(turnOn.or(turnOff)).toBeVisible({ timeout: 30_000 });
  return turnOff.isVisible();
}

/** Make a shared folder on the scratch file system, not shared over SMB, from the add page. */
async function addFolder(page: Page, device: string, name: string) {
  await expect(
    page.getByRole("button", { name: copy.addShare.continue }),
  ).toBeVisible({ timeout: 60_000 });
  const fs = page.getByRole("radio", {
    name: new RegExp(`^EXT4 on ${device}1 ?`),
  });
  if (!(await fs.isChecked())) {
    await fs.click();
  }
  await page
    .getByRole("textbox", { name: copy.addShare.name.label })
    .fill(name);
  await page.getByRole("checkbox", { name: copy.addShare.smb.label }).uncheck();
  await page.getByRole("button", { name: copy.addShare.continue }).click();
  await page.getByRole("button", { name: copy.addShare.confirm }).click();
  await expect(
    page.getByText(copy.addShare.done.title.replace("{{name}}", name)),
  ).toBeVisible({ timeout: 240_000 });
}

/** Delete a shared folder of this test with its files, behind its typed name. */
async function deleteFolder(page: Page, name: string) {
  await page.goto("/ui/storage/shared-folders");
  await page.getByRole("link", { name: `Open shared folder ${name}` }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({
    timeout: 30_000,
  });
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
      name: copy.shareDelete.files.typePrompt.replace("{{folder}}", name),
    })
    .fill(name);
  await dialog
    .getByRole("button", { name: copy.shareDelete.files.confirm })
    .click();
  await expect(page.getByText(/ and its files were deleted\.$/)).toBeVisible({
    timeout: 120_000,
  });
}

test.describe("services on the VM", () => {
  test("opens the NFS page with its real reads, and calls nothing else", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    const from = seen.calls.length;
    await page.goto("/ui/services/nfs");
    await expect(
      page.getByRole("heading", { level: 1, name: copy.nfs.title }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("button", { name: copy.nfs.turnOn, exact: true })
        .or(page.getByRole("button", { name: copy.nfs.turnOff })),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page
        .getByRole("region", { name: copy.nfs.shares.title })
        .or(page.getByText(copy.nfs.shares.empty)),
    ).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => seen.calls).toContain("NFS.getSettings");
    await expect.poll(() => seen.calls).toContain("NFS.getShareList");
    expect(notReads(seen, from)).toEqual([]);
    for (const call of WRITES) {
      expect(seen.calls).not.toContain(call);
    }
    expect(seen.unexpected).toEqual([]);
  });

  test("opens both tabs of the Rsync page with their real reads, and calls nothing else", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    const from = seen.calls.length;
    await page.goto("/ui/services/rsync");
    await expect(
      page.getByRole("heading", { level: 1, name: copy.rsync.title }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: copy.jobs.tableLabel })
        .or(page.getByText(copy.jobs.empty))
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => seen.calls).toContain("Rsync.getList");

    await page.getByRole("link", { name: copy.rsync.tab.server }).click();
    await expect(page).toHaveURL(/\/ui\/services\/rsync\/server$/);
    await expect(
      page
        .getByRole("button", { name: copy.rsyncd.turnOn, exact: true })
        .or(page.getByRole("button", { name: copy.rsyncd.turnOff })),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(copy.rsyncd.noEncryption)).toBeVisible();
    await expect.poll(() => seen.calls).toContain("Rsyncd.getSettings");
    await expect.poll(() => seen.calls).toContain("Rsyncd.getModuleList");
    expect(notReads(seen, from)).toEqual([]);
    for (const call of WRITES) {
      expect(seen.calls).not.toContain(call);
    }
    expect(seen.unexpected).toEqual([]);
  });

  test("opens the SMB page's workgroup card with the stored workgroup, and calls nothing else", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    const from = seen.calls.length;
    await page.goto("/ui/services/smb");
    await expect(
      page.getByRole("heading", { level: 2, name: copy.smb.workgroup.title }),
    ).toBeVisible({ timeout: 30_000 });
    const workgroup = page.getByRole("textbox", {
      name: copy.smb.workgroup.field,
      exact: true,
    });
    await expect(workgroup).toHaveValue(/\S/, { timeout: 30_000 });
    await expect.poll(() => seen.calls).toContain("SMB.getSettings");
    expect(notReads(seen, from)).toEqual([]);
    for (const call of WRITES) {
      expect(seen.calls).not.toContain(call);
    }
    expect(seen.unexpected).toEqual([]);
  });

  test("a normal user is told the services pages are for administrators, and nothing is called", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.user);
    const from = seen.calls.length;
    for (const path of [
      "/ui/services/nfs",
      "/ui/services/rsync",
      "/ui/services/rsync/server",
      "/ui/services/rsync/jobs/add",
    ]) {
      await page.goto(path);
      await expect(page.getByText(copy.adminOnly.body)).toBeVisible({
        timeout: 30_000,
      });
    }
    expect(
      seen.calls
        .slice(from)
        .filter((c) => /^(NFS|Rsync|Rsyncd|SMB|CertificateMgmt)\./.test(c)),
    ).toEqual([]);
    expect(notReads(seen, from)).toEqual([]);
  });

  test("shares a folder over NFS and the rsync server, copies it with a job, and removes all of it, on OMV_WEBUI_VM_SCRATCH_DISK only when Flow A offers it empty", async ({
    page,
    vm,
  }) => {
    const name = process.env.OMV_WEBUI_VM_SCRATCH_DISK?.trim() ?? "";
    test.skip(
      !DISK_NAME.test(name) || SYSTEM_DISKS.has(name),
      "OMV_WEBUI_VM_SCRATCH_DISK does not name a scratch disk (such as sdd); nothing is created.",
    );
    test.setTimeout(1_500_000);
    const device = `/dev/${name}`;
    const seen = watch(page);
    await signIn(page, vm.admin);

    // Were NFS and the rsync server on before? Only what this test turned on is turned off again.
    const nfsWasOn = await nfsIsOn(page);
    const rsyncdWasOn = await rsyncdIsOn(page);

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

    // B. The two shared folders on it, neither shared over SMB.
    await addFolder(page, device, SRC);
    await page.goto("/ui/storage/shared-folders/add");
    await addFolder(page, device, DEST);
    expect(seen.calls.filter((c) => c === "ShareMgmt.set")).toHaveLength(2);
    expect(seen.calls).not.toContain("SMB.setShare");

    // C. NFS on, only if it was off, through the NFS page.
    if (!nfsWasOn) {
      await page.goto("/ui/services/nfs");
      await page
        .getByRole("button", { name: copy.nfs.turnOn, exact: true })
        .click();
      await expect(page.getByText(copy.nfs.turnedOn).first()).toBeVisible({
        timeout: 30_000,
      });
      await applyPending(page);
    }

    // D. The source folder's page: the network let in read only, applied; then stopped, applied.
    await page.goto("/ui/storage/shared-folders");
    await page.getByRole("link", { name: `Open shared folder ${SRC}` }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: SRC }),
    ).toBeVisible({ timeout: 30_000 });
    const nfs = page.getByRole("region", { name: copy.folderNfs.title });
    await expect(nfs.getByText(copy.folderNfs.notShared)).toBeVisible({
      timeout: 30_000,
    });
    await nfs.getByRole("button", { name: copy.folderNfs.letIn }).click();
    const form = nfs.getByRole("form", { name: copy.folderNfs.form.titleNew });
    await form
      .getByRole("radio", { name: copy.folderNfs.form.network })
      .click();
    await form
      .getByRole("textbox", { name: copy.folderNfs.form.networkField })
      .fill(NETWORK);
    await form
      .getByRole("radio", { name: copy.access.ro, exact: true })
      .click();
    await form
      .getByRole("button", { name: copy.folderNfs.form.letIn, exact: true })
      .click();
    const entry = nfs.getByRole("heading", {
      level: 3,
      name: /^Computers on /,
    });
    await expect(entry).toContainText(NETWORK, { timeout: 30_000 });
    expect(seen.calls.filter((c) => c === "NFS.setShare")).toHaveLength(1);
    await applyPending(page);
    await expect(entry).toContainText(NETWORK);
    await nfs.getByRole("button", { name: copy.folderNfs.stop.open }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: copy.folderNfs.stop.confirm, exact: true })
      .click();
    await expect(nfs.getByText(copy.folderNfs.notShared)).toBeVisible({
      timeout: 30_000,
    });
    expect(seen.calls.filter((c) => c === "NFS.deleteShare")).toHaveLength(1);
    await applyPending(page);

    // E. NFS off again, only if this test turned it on.
    if (!nfsWasOn) {
      await page.goto("/ui/services/nfs");
      await page.getByRole("button", { name: copy.nfs.turnOff }).click();
      await page
        .getByRole("alertdialog", { name: copy.nfs.off.title })
        .getByRole("button", { name: copy.nfs.off.confirm, exact: true })
        .click();
      await expect(page.getByText(copy.nfs.turnedOff).first()).toBeVisible({
        timeout: 30_000,
      });
      await applyPending(page);
    }

    // F. The rsync server: on only if it was off; the source folder offered with a sign-in whose
    // password is made for this run, applied; no longer offered, applied; off again if it was off.
    await page.goto("/ui/services/rsync/server");
    if (!rsyncdWasOn) {
      await page
        .getByRole("button", { name: copy.rsyncd.turnOn, exact: true })
        .click();
      await expect(page.getByText(copy.rsyncd.turnedOn).first()).toBeVisible({
        timeout: 30_000,
      });
      await applyPending(page);
    }
    const secret = randomBytes(18).toString("base64url");
    await page.getByRole("button", { name: copy.rsyncd.modules.add }).click();
    const offer = page.getByRole("dialog", { name: copy.module.titleNew });
    await offer.getByRole("combobox", { name: copy.module.folder }).click();
    await page.getByRole("option", { name: new RegExp(`^${SRC}`) }).click();
    await expect(
      offer.getByRole("textbox", { name: copy.module.name }),
    ).toHaveValue(SRC);
    await expect(
      offer.getByRole("checkbox", { name: copy.module.ask }),
    ).toBeChecked();
    const password = offer.getByLabel(copy.module.password, { exact: true });
    const again = offer.getByLabel(copy.password.again, { exact: true });
    await expect(password).toHaveValue("");
    await expect(again).toHaveValue("");
    await offer
      .getByRole("textbox", { name: copy.module.signInName, exact: true })
      .fill(SIGN_IN);
    await password.fill(secret);
    await again.fill(secret);
    await offer.getByRole("button", { name: copy.module.offer }).click();
    await expect(
      page.getByText(sentence(copy.module.saved)).first(),
    ).toBeVisible({ timeout: 30_000 });
    expect(await page.content()).not.toContain(secret);
    await applyPending(page);
    const offered = page
      .getByRole("region", { name: copy.rsyncd.modules.title })
      .first();
    await expect(offered).toContainText(SRC, { timeout: 30_000 });
    await page
      .getByRole("button", {
        name: copy.rsyncd.actionsFor.replace("{{folder}}", SRC),
      })
      .click();
    await page.getByRole("menuitem", { name: copy.module.action.stop }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: copy.module.stop.confirm, exact: true })
      .click();
    await expect(
      page.getByText(sentence(copy.module.stopped)).first(),
    ).toBeVisible({ timeout: 30_000 });
    await applyPending(page);
    expect(seen.calls).toContain("Rsyncd.deleteModule");
    if (!rsyncdWasOn) {
      await page.getByRole("button", { name: copy.rsyncd.turnOff }).click();
      await page
        .getByRole("alertdialog", { name: copy.rsyncd.off.title })
        .getByRole("button", { name: copy.rsyncd.off.confirm, exact: true })
        .click();
      await expect(page.getByText(copy.rsyncd.turnedOff).first()).toBeVisible({
        timeout: 30_000,
      });
      await applyPending(page);
    }
    expect(await page.content()).not.toContain(secret);

    // G. A local copy job from the source into the destination that also deletes, only when started:
    // the trial, the typed turn-on, Run now to its end; then deleted and applied.
    await page.goto("/ui/services/rsync/jobs/add");
    await expect(
      page.getByRole("heading", { level: 1, name: copy.addJob.title }),
    ).toBeVisible();
    const folders = page.getByRole("combobox", { name: copy.addJob.folder });
    for (const [index, folder] of [
      [0, SRC],
      [1, DEST],
    ] as const) {
      const select = folders.nth(index);
      await expect(select).not.toHaveAttribute("aria-disabled", "true", {
        timeout: 60_000,
      });
      await select.click();
      await page
        .getByRole("option", { name: new RegExp(`^${folder}`) })
        .click();
      // The list closes before the next one opens: two would hold the same options.
      await expect(page.getByRole("listbox")).toHaveCount(0);
    }
    await page
      .getByRole("checkbox", { name: /^Also delete files in / })
      .click();
    await page
      .getByRole("radio", { name: copy.addJob.whenManual, exact: true })
      .click();
    await page.getByRole("button", { name: copy.addJob.review }).click();
    const summary = page.getByRole("region", {
      name: copy.addJob.summary.title,
    });
    await expect(summary).toContainText(copy.addJob.summary.manual);
    await summary.getByRole("button", { name: copy.addJob.saveTry }).click();
    await expect(page.getByText(copy.addJob.trial.ok)).toBeVisible({
      timeout: 300_000,
    });
    await expect(
      page.getByText(sentence(copy.addJob.trial.deletesNone)),
    ).toBeVisible();
    await page.getByRole("button", { name: copy.addJob.turnOn.button }).click();
    const turnOn = page.getByRole("alertdialog", {
      name: sentence(copy.addJob.turnOnDelete.title),
    });
    const confirmOn = turnOn.getByRole("button", {
      name: copy.addJob.turnOnDelete.confirm,
    });
    await expect(confirmOn).toHaveAttribute("aria-disabled", "true");
    await turnOn.getByRole("textbox").fill(DEST);
    await confirmOn.click();
    await expect(
      page.getByText(isolated(`${JOB} is on. `)).first(),
    ).toBeVisible({ timeout: 300_000 });
    expect(seen.calls.filter((c) => c === "Rsync.set")).toHaveLength(2);
    await page.getByRole("button", { name: copy.addJob.runNow }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: copy.runJob.delete.confirm, exact: true })
      .click();
    // The run is followed in the top bar's tasks; its end is announced there.
    await expect(
      page
        .getByRole("status")
        .filter({
          hasText: isolated(
            copy.tasks.announce
              .replace(
                "{{task}}",
                copy.runJob.task.title.replace("{{job}}", JOB),
              )
              .replace("{{state}}", copy.tasks.done),
          ),
        })
        .first(),
    ).toBeVisible({ timeout: 300_000 });

    await page.goto("/ui/services/rsync");
    await page.getByRole("link", { name: JOB, exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: JOB }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: copy.job.delete.button }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: copy.deleteJob.confirm, exact: true })
      .click();
    await expect(
      page
        .getByText(isolated(copy.deleteJob.done.replace("{{job}}", JOB)))
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    await applyPending(page);
    expect(seen.calls).toContain("Rsync.delete");

    // H. The workgroup card only opens; nothing is saved.
    await page.goto("/ui/services/smb");
    await expect(
      page.getByRole("textbox", {
        name: copy.smb.workgroup.field,
        exact: true,
      }),
    ).toHaveValue(/\S/, { timeout: 30_000 });
    expect(seen.calls).not.toContain("SMB.setSettings");

    // I. Both shared folders deleted with their files, the file system unmounted, the disk wiped.
    await deleteFolder(page, SRC);
    await deleteFolder(page, DEST);
    expect(seen.calls.filter((c) => c === "ShareMgmt.delete")).toHaveLength(2);

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

    // J. As it began: nothing pending, nothing of this test listed, NFS and the rsync server as they
    // were.
    expect(await nfsIsOn(page)).toBe(nfsWasOn);
    const nfsShares = page.getByRole("region", { name: copy.nfs.shares.title });
    await expect(
      nfsShares.or(page.getByText(copy.nfs.shares.empty)).first(),
    ).toBeVisible({ timeout: 30_000 });
    // The region is there only when something is shared; either way, not this test's folder.
    await expect(nfsShares.getByText(SRC)).toHaveCount(0);
    expect(await rsyncdIsOn(page)).toBe(rsyncdWasOn);
    const modules = page.getByRole("region", {
      name: copy.rsyncd.modules.title,
    });
    await expect(
      modules.or(page.getByText(copy.rsyncd.modules.empty)).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(modules.getByText(SRC)).toHaveCount(0);
    await page.goto("/ui/services/rsync");
    await expect(
      page
        .getByRole("region", { name: copy.jobs.tableLabel })
        .or(page.getByText(copy.jobs.empty))
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: JOB })).toHaveCount(0);
    await page.goto("/ui/storage/shared-folders");
    await expect(
      page.getByRole("link", { name: `Open shared folder ${SRC}` }),
    ).toHaveCount(0, { timeout: 30_000 });
    await expect(
      page.getByRole("link", { name: `Open shared folder ${DEST}` }),
    ).toHaveCount(0);
    await expect.poll(() => pendingCount(seen), { timeout: 30_000 }).toBe(0);
    expect(seen.unexpected).toEqual([]);
  });
});
