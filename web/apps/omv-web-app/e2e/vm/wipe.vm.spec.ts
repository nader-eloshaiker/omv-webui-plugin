// SPDX-License-Identifier: GPL-3.0-or-later
// Wiping a disk on the test VM (phase 5 disks design 3). Read-only by default: the system disk and the
// disk holding the VM's mounted file system are refused in words, and a free disk's dialog runs its
// checks and is cancelled, so nothing is wiped. A real wipe runs ONLY when OMV_WEBUI_VM_WIPE_DISK names
// a disk (a kernel name such as "sdd") AND the interface itself shows that disk as free to wipe;
// otherwise that test is skipped with the reason. Any CSP or Trusted Types report, console error, page
// error or request to another origin fails a test (support/vmFixtures.ts).
//
// Account names, the host name, addresses and serial numbers come from the VM and are never printed.
import type { Page, Response } from "@playwright/test";
import copy from "../../src/locales/en/common.json" with { type: "json" };
import { expect, target, test } from "./support/vmFixtures.ts";
import type { Account } from "./support/vmTarget.ts";

test.skip(
  target === null,
  "No VM env file ($OMV_WEBUI_ENV); the VM suite is skipped.",
);

const DISK_NAME = /^[a-z][a-z0-9]{0,31}$/;

/**
 * On the VM the RAID plugin is not installed (rpc.php answers 404 for its service) and its disks have
 * no monitoring settings (a 500 from Smart.getDeviceSettings): both are expected replies, which
 * Chromium logs as failed resources. Each such reply is checked by `expectedFailures` below.
 */
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
  /** Failed replies other than the two expected ones: none may happen. */
  unexpected: string[];
}

/** Every call, the last 200 reply of each, and any failure that is not one of the expected two. */
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

interface Disk {
  devicename: string;
  canonicaldevicefile: string;
  isroot: boolean;
  isreadonly: boolean;
}

async function disksOf(seen: Watch): Promise<Disk[]> {
  await expect.poll(() => seen.replies.has("DiskMgmt.getList")).toBe(true);
  const data = field(seen.replies.get("DiskMgmt.getList"), "data");
  return Array.isArray(data) ? (data as Disk[]) : [];
}

const section = (page: Page) =>
  page.getByRole("region", { name: copy.wipe.title });
const openButton = (page: Page) =>
  section(page).getByRole("button", { name: copy.wipe.open });

test.describe("wiping a disk", () => {
  test("refuses the system disk and the disk of the mounted file system, and wipes nothing", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    await page.goto("/ui/storage/disks");
    const disks = await disksOf(seen);
    const root = disks.find((d) => d.isroot);
    expect(root, "the VM has a system disk").toBeDefined();
    await page.goto(`/ui/storage/disks/${root?.devicename ?? ""}`);
    await expect(
      section(page).getByText(copy.wipe.blocked.system),
    ).toBeVisible();
    await expect(openButton(page)).toHaveAttribute("aria-disabled", "true");

    await expect
      .poll(() => seen.replies.has("FileSystemMgmt.getList"))
      .toBe(true);
    const rows = field(seen.replies.get("FileSystemMgmt.getList"), "data");
    const mounted = (Array.isArray(rows) ? rows : []).find(
      (row) => field(row, "mounted") === true,
    );
    const parent = disks.find(
      (d) =>
        !d.isroot &&
        d.canonicaldevicefile === field(mounted, "parentdevicefile"),
    );
    expect(
      parent,
      "the VM has a data disk with a mounted file system",
    ).toBeDefined();
    await page.goto(`/ui/storage/disks/${parent?.devicename ?? ""}`);
    await expect(section(page)).toContainText("which is in use.");
    await expect(openButton(page)).toHaveAttribute("aria-disabled", "true");

    expect(seen.calls).not.toContain("DiskMgmt.wipe");
    expect(seen.unexpected).toEqual([]);
  });

  test("checks a free disk in the dialog, and cancels without wiping", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    await page.goto("/ui/storage/disks");
    const disks = await disksOf(seen);
    let free: Disk | undefined;
    for (const disk of disks.filter((d) => !d.isroot && !d.isreadonly)) {
      await page.goto(`/ui/storage/disks/${disk.devicename}`);
      await expect(openButton(page)).toBeVisible();
      await expect(section(page)).not.toContainText(copy.wipe.checking);
      if ((await openButton(page).getAttribute("aria-disabled")) === "false") {
        free = disk;
        break;
      }
    }
    test.skip(
      free === undefined,
      "The VM has no disk the interface shows as free.",
    );

    const before = seen.calls.length;
    await openButton(page).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
      `Wipe disk ${free?.canonicaldevicefile ?? ""}?`,
    );
    expect(seen.calls.slice(before)).toEqual(
      expect.arrayContaining([
        "DiskMgmt.getList",
        "FileSystemMgmt.getList",
        "FileSystemMgmt.enumerateFilesystems",
        "MdMgmt.enumerateDevices",
      ]),
    );
    await expect(
      dialog.getByRole("button", { name: copy.wipe.cancel }),
    ).toBeFocused();
    await expect(
      dialog.getByRole("button", { name: copy.wipe.confirm }),
    ).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(seen.calls).not.toContain("DiskMgmt.wipe");
    expect(seen.unexpected).toEqual([]);
  });

  test("wipes the disk named by OMV_WEBUI_VM_WIPE_DISK, only when the interface shows it as free", async ({
    page,
    vm,
  }) => {
    const name = process.env.OMV_WEBUI_VM_WIPE_DISK?.trim() ?? "";
    test.skip(
      !DISK_NAME.test(name),
      "OMV_WEBUI_VM_WIPE_DISK does not name a disk (such as sdd); no disk is wiped.",
    );
    test.setTimeout(120_000);
    const seen = watch(page);
    await signIn(page, vm.admin);
    await page.goto(`/ui/storage/disks/${name}`);
    await expect(openButton(page)).toBeVisible();
    await expect(section(page)).not.toContainText(copy.wipe.checking);
    test.skip(
      (await openButton(page).getAttribute("aria-disabled")) !== "false",
      "The interface shows this disk as not free to wipe; it is not wiped.",
    );
    const disks = await disksOf(seen);
    const device =
      disks.find((d) => d.devicename === name)?.canonicaldevicefile ?? "";

    await openButton(page).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
      `Wipe disk ${device}?`,
    );
    await expect(
      dialog.getByRole("radio", { name: copy.wipe.quick }),
    ).toBeChecked();
    await dialog
      .getByRole("textbox", { name: `Type ${device} to confirm.` })
      .fill(device);
    await dialog.getByRole("button", { name: copy.wipe.confirm }).click();

    await expect(section(page).getByText(`${device} was wiped.`)).toBeVisible({
      timeout: 90_000,
    });
    expect(seen.calls.filter((c) => c === "DiskMgmt.wipe")).toHaveLength(1);
    await expect(page.getByText(/^Empty \(wiped at /).first()).toBeVisible();
    expect(seen.unexpected).toEqual([]);
  });
});
