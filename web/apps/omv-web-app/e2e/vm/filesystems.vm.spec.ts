// SPDX-License-Identifier: GPL-3.0-or-later
// File systems and Flow A on the test VM (phase 5 file-systems design 1 to 6). Read-only by default: the
// list, the data file system's page with its report read only on request, and Flow A's choices (the
// system disk and the disk of the mounted file system never offered), left without confirming, so
// nothing is created. A real journey runs ONLY when OMV_WEBUI_VM_SCRATCH_DISK names a disk (a kernel
// name such as "sdd") AND Flow A itself offers that disk as an empty disk AND nothing is pending: it
// creates EXT4 on it, mounts it through the checkpoint, unmounts it, and wipes the disk again, so the
// disk ends empty and nothing is left pending. Otherwise that test is skipped with the reason.
//
// Account names, the host name, addresses, UUIDs and serial numbers come from the VM and are never
// printed. Any CSP or Trusted Types report, console error, page error or request to another origin
// fails a test (support/vmFixtures.ts), except the replies listed below.
import type { Page, Response } from "@playwright/test";
import copy from "../../src/locales/en/common.json" with { type: "json" };
import { expect, target, test } from "./support/vmFixtures.ts";
import type { Account } from "./support/vmTarget.ts";

test.skip(
  target === null,
  "No VM env file ($OMV_WEBUI_ENV); the VM suite is skipped.",
);

const DISK_NAME = /^[a-z][a-z0-9]{0,31}$/;

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
  /** Failed replies other than the expected ones: none may happen. */
  unexpected: string[];
}

/** Every call, the last 200 reply of each, and any failure that is not an expected one. */
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

const FORBIDDEN_ON_OPEN = [
  "FileSystemMgmt.create",
  "FileSystemMgmt.createBtrfs",
  "FileSystemMgmt.setMountPoint",
  "FileSystemMgmt.umountByDir",
  "FileSystemMgmt.grow",
  "DiskMgmt.wipe",
];

test.describe("file systems on the VM", () => {
  test("lists the system drive and the data file system, reading no candidates and no report", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    await page.goto("/ui/storage/filesystems");
    const table = page.getByRole("table", {
      name: copy.filesystems.tableLabel,
    });
    await expect(table.getByText(copy.filesystems.system.line)).toBeVisible();
    await expect(
      table.getByRole("link", { name: /^Open file system / }).first(),
    ).toBeVisible();
    expect(seen.calls).toContain("FileSystemMgmt.getMountCandidates");
    expect(seen.calls).not.toContain("FileSystemMgmt.getCandidatesBg");
    expect(seen.calls).not.toContain("FileSystemMgmt.getDetails");
    for (const call of FORBIDDEN_ON_OPEN) {
      expect(seen.calls).not.toContain(call);
    }
    expect(seen.unexpected).toEqual([]);
  });

  test("shows the mounted data file system's page, its report only on request", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    await page.goto("/ui/storage/filesystems");
    const link = page
      .getByRole("table", { name: copy.filesystems.tableLabel })
      .getByRole("link", { name: /^Open file system / })
      .first();
    await link.click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "File system",
    );
    // The UUID is never in the title.
    expect(await page.title()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    const details = page.getByRole("region", {
      name: copy.filesystem.details.title,
    });
    await expect(
      details.getByRole("button", { name: copy.filesystem.details.show }),
    ).toBeVisible();
    expect(seen.calls).not.toContain("FileSystemMgmt.getDetails");
    await details
      .getByRole("button", { name: copy.filesystem.details.show })
      .click();
    await expect(
      details.getByRole("region", { name: /^Technical details of / }),
    ).toBeVisible({ timeout: 30_000 });
    for (const call of FORBIDDEN_ON_OPEN) {
      expect(seen.calls).not.toContain(call);
    }
    expect(seen.unexpected).toEqual([]);
  });

  test("never offers the system disk or the data disk in Flow A, and creates nothing when left", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    await page.goto("/ui/storage/filesystems/add");
    await expect(
      page.getByRole("heading", { level: 2, name: copy.addStorage.title }),
    ).toBeVisible();
    // Pending changes from elsewhere stop the flow first (R1); then nothing more is checked here.
    const preflight = page.getByText(copy.addStorage.preflightTitle);
    const form = page.getByRole("button", { name: copy.addStorage.continue });
    await expect(
      preflight.or(form).or(page.getByText(copy.addStorage.none)),
    ).toBeVisible({ timeout: 60_000 });
    if (await form.isVisible()) {
      const disks = field(seen.replies.get("DiskMgmt.getList"), "data");
      for (const disk of Array.isArray(disks) ? disks : []) {
        if (field(disk, "isroot") === true) {
          await expect(
            page.getByRole("radio", {
              name: new RegExp(
                `^${String(field(disk, "canonicaldevicefile"))}, `,
              ),
            }),
          ).toHaveCount(0);
        }
      }
      await expect(
        page.getByRole("button", { name: /^Disks that cannot be used/ }),
      ).toBeVisible();
    }
    await page.goto("/ui/storage/filesystems");
    for (const call of FORBIDDEN_ON_OPEN) {
      expect(seen.calls).not.toContain(call);
    }
    expect(seen.unexpected).toEqual([]);
  });

  test("creates, mounts, unmounts and wipes again on OMV_WEBUI_VM_SCRATCH_DISK, only when Flow A offers it empty", async ({
    page,
    vm,
  }) => {
    const name = process.env.OMV_WEBUI_VM_SCRATCH_DISK?.trim() ?? "";
    test.skip(
      !DISK_NAME.test(name),
      "OMV_WEBUI_VM_SCRATCH_DISK does not name a disk (such as sdd); nothing is created.",
    );
    test.setTimeout(420_000);
    const device = `/dev/${name}`;
    const seen = watch(page);
    await signIn(page, vm.admin);
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

    // A. Flow A: the disk, EXT4, a tag, the typed name, and the run to the end.
    await empty.click();
    await page
      .getByRole("textbox", { name: copy.filesystem.settings.tags })
      .fill("webui-test");
    await continueButton.click();
    await page
      .getByRole("textbox", { name: `Type ${device} to confirm.` })
      .fill(device);
    expect(seen.calls).not.toContain("FileSystemMgmt.create");
    await page.getByRole("button", { name: copy.addStorage.confirm }).click();
    await expect(page.getByText(copy.addStorage.doneTitle)).toBeVisible({
      timeout: 240_000,
    });
    expect(
      seen.calls.filter((c) => c === "FileSystemMgmt.create"),
    ).toHaveLength(1);
    await expect(
      page.getByRole("region", { name: copy.addStorage.handover.title }),
    ).toBeVisible();

    // B. Its page: mounted and reachable; then unmount it through the check and the confirmation.
    await page
      .getByRole("link", { name: copy.addStorage.openFs })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "File system",
    );
    const unmount = page.getByRole("region", { name: copy.fsUnmount.title });
    const open = unmount.getByRole("button", { name: copy.fsUnmount.open });
    await expect(open).toHaveAttribute("aria-disabled", "false", {
      timeout: 30_000,
    });
    await open.click();
    const dialog = page.getByRole("alertdialog");
    await dialog
      .getByRole("button", { name: copy.fsUnmount.confirm, exact: true })
      .click({ timeout: 30_000 });
    await expect(page.getByText(/ was unmounted\.$/)).toBeVisible({
      timeout: 120_000,
    });
    expect(
      seen.calls.filter((c) => c === "FileSystemMgmt.umountByDir"),
    ).toHaveLength(1);

    // C. Wipe the disk again, so it ends empty.
    await page.goto(`/ui/storage/disks/${name}`);
    const wipe = page.getByRole("region", { name: copy.wipe.title });
    const wipeButton = wipe.getByRole("button", { name: copy.wipe.open });
    await expect(wipe).not.toContainText(copy.wipe.checking, {
      timeout: 30_000,
    });
    await expect(wipeButton).toHaveAttribute("aria-disabled", "false");
    await wipeButton.click();
    const wipeDialog = page.getByRole("alertdialog");
    await wipeDialog
      .getByRole("textbox", { name: `Type ${device} to confirm.` })
      .fill(device);
    await wipeDialog.getByRole("button", { name: copy.wipe.confirm }).click();
    await expect(wipe.getByText(`${device} was wiped.`)).toBeVisible({
      timeout: 90_000,
    });

    // D. Nothing is left pending.
    await page.goto("/ui/storage/filesystems");
    await expect(
      page.getByRole("table", { name: copy.filesystems.tableLabel }),
    ).toBeVisible();
    await expect
      .poll(
        () => {
          const info = seen.replies.get("System.getInformation");
          const dirty = field(info, "dirtyModules");
          return typeof dirty === "object" && dirty !== null
            ? Object.keys(dirty).length
            : Array.isArray(dirty)
              ? dirty.length
              : -1;
        },
        { timeout: 30_000 },
      )
      .toBe(0);
    expect(seen.unexpected).toEqual([]);
  });
});
