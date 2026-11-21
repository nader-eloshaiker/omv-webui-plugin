// SPDX-License-Identifier: GPL-3.0-or-later
// A ZFS pool on the test VM, read-only (the ZFS design 10): with OpenZFS and the openmediavault-zfs
// plugin, OMV's file-system lists report each ZFS file system with no UUID (null). The dashboard, File
// systems and Disks pages load, show the pool's file systems with their usage and no page of their own,
// and name the pool's disks as part of it. Runs ONLY when OMV_WEBUI_VM_ZFS_POOL names a pool made on the
// VM beforehand (such as "tank", with at least one file system inside it such as "tank/media");
// otherwise every test is skipped with the reason. Nothing here changes anything on the VM.
//
// Which lists report the pool depends on whether OMV knows it (observed): a pool made by hand is only
// in enumerateFilesystems; once the plugin's Discover has added its mount entries, getList and
// enumerateMountedFilesystems list it too. Each page is checked against what its read reported.
//
// Account names, the host name and the disks' serial numbers come from the VM and are never printed.
// Any CSP or Trusted Types report, console error, page error or request to another origin fails a test
// (support/vmFixtures.ts), except the replies listed below, each checked by its call.
import type { ConsoleMessage, Page, Response } from "@playwright/test";
import copy from "../../src/locales/en/common.json" with { type: "json" };
import { expect, target, test } from "./support/vmFixtures.ts";
import type { Account } from "./support/vmTarget.ts";

test.skip(
  target === null,
  "No VM env file ($OMV_WEBUI_ENV); the VM suite is skipped.",
);

// A pool name as ZFS allows it: a letter, then letters, digits, "_", "-", ":" or ".".
const POOL_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
const POOL = process.env.OMV_WEBUI_VM_ZFS_POOL?.trim() ?? "";
test.skip(
  !POOL_NAME.test(POOL),
  "OMV_WEBUI_VM_ZFS_POOL does not name a ZFS pool on the VM (such as tank); the ZFS tests are skipped.",
);

/** A failed rpc.php reply, logged by Chromium as a failed resource without the method's name. */
const rpcFailure = (status: number) => ({
  reason: `rpc.php answers ${String(status)} for an expected failure, checked below by its reply`,
  matches: (message: ConsoleMessage, origin: string) =>
    message.location().url === `${origin}/rpc.php` &&
    message
      .text()
      .startsWith(
        `Failed to load resource: the server responded with a status of ${String(status)}`,
      ),
});
// 404: the RAID plugin is not installed on the VM. 500: a disk with no monitoring settings saved.
test.use({ extraAllowances: { list: [rpcFailure(404), rpcFailure(500)] } });

const EXPECTED_FAILURES: Readonly<Record<string, number>> = {
  "MdMgmt.enumerateDevices": 404,
  "Smart.getDeviceSettings": 500,
};

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
  /** The ZFS rows of the file-system lists, as the page got them: their UUIDs only. */
  zfsUuids: unknown[];
  /** The names of the pool's ZFS file systems each list reported, by call. */
  zfsNames: Map<string, Set<string>>;
  /** The calls whose 200 reply has been read. */
  read: string[];
  unexpected: string[];
}

const LISTS = new Set([
  "FileSystemMgmt.getList",
  "FileSystemMgmt.enumerateFilesystems",
  "FileSystemMgmt.enumerateMountedFilesystems",
]);

/** Every call, the ZFS rows' UUIDs of the lists, and any failure that is not an expected one. */
function watch(page: Page): Watch {
  const seen: Watch = {
    calls: [],
    zfsUuids: [],
    zfsNames: new Map(),
    read: [],
    unexpected: [],
  };
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
        if (LISTS.has(name)) {
          const reply = field(envelope, "response");
          const rows: unknown = Array.isArray(reply)
            ? reply
            : field(reply, "data");
          for (const row of Array.isArray(rows) ? rows : []) {
            const fsName = field(row, "devicefile");
            if (field(row, "type") === "zfs" && typeof fsName === "string") {
              seen.zfsUuids.push(field(row, "uuid"));
              if (fsName === POOL || fsName.startsWith(`${POOL}/`)) {
                const names = seen.zfsNames.get(name) ?? new Set<string>();
                seen.zfsNames.set(name, names.add(fsName));
              }
            }
          }
        }
        seen.read.push(name);
        return;
      }
      if (
        response.status() !== 401 &&
        EXPECTED_FAILURES[name] !== response.status()
      ) {
        seen.unexpected.push(`${name} ${String(response.status())}`);
      }
    } catch {
      // The page went away before the body arrived.
    }
  });
  return seen;
}

async function signIn(page: Page, account: Account) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill(account.username);
  await page.getByLabel(copy.signIn.password).fill(account.password);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
}

const ZFS_LINE = copy.filesystems.zfsLine.replace("{{pool}}", POOL);
const CHANGES = [
  "FileSystemMgmt.create",
  "FileSystemMgmt.createBtrfs",
  "FileSystemMgmt.setMountPoint",
  "FileSystemMgmt.umountByDir",
  "FileSystemMgmt.grow",
  "DiskMgmt.wipe",
];

test.describe("a ZFS pool on the VM", () => {
  test("the dashboard, File systems and Disks load and show the pool, changing nothing", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    const reported = (call: string) => [...(seen.zfsNames.get(call) ?? [])];

    // Dashboard: each of the pool's file systems the mounted list reports, with a reading, as text.
    const storage = page.getByRole("region", {
      name: copy.dashboard.storage.title,
    });
    await expect(storage.getByRole("meter").first()).toBeVisible();
    await expect
      .poll(() => seen.read)
      .toContain("FileSystemMgmt.enumerateMountedFilesystems");
    for (const name of reported("FileSystemMgmt.enumerateMountedFilesystems")) {
      await expect(
        storage.getByRole("meter", { name, exact: true }),
      ).toBeVisible();
    }

    // File systems: each one getList reports, managed with the pool, with no page and no action.
    await page
      .getByRole("navigation", { name: copy.app.navigation })
      .getByRole("link", { name: copy.nav.items.storage.filesystems })
      .click();
    const table = page.getByRole("table", {
      name: copy.filesystems.tableLabel,
      exact: true,
    });
    await expect(table.getByText(copy.filesystems.system.line)).toBeVisible();
    await expect.poll(() => seen.read).toContain("FileSystemMgmt.getList");
    for (const name of reported("FileSystemMgmt.getList")) {
      const row = table
        .getByRole("row")
        .filter({ has: page.getByText(name, { exact: true }) })
        .first();
      await expect(row).toContainText(ZFS_LINE);
      await expect(
        row.locator('a[href^="/ui/storage/filesystems"]'),
      ).toHaveCount(0);
      await expect(row.getByRole("button")).toHaveCount(0);
    }
    // Never among the file systems found on the disks and offered for mounting.
    await expect(
      page
        .getByRole("table", { name: copy.filesystems.found.tableLabel })
        .getByText(new RegExp(`^${POOL}(/|$)`)),
    ).toHaveCount(0);

    // Disks: at least two disks, the mirror's, part of the pool.
    await page
      .getByRole("navigation", { name: copy.app.navigation })
      .getByRole("link", { name: copy.nav.items.storage.disks, exact: true })
      .click();
    const disks = page.getByRole("table", { name: copy.disks.tableLabel });
    const members = disks
      .getByRole("row")
      .filter({ hasText: `Part of ZFS pool ${POOL}` });
    await expect(members.first()).toBeVisible();
    expect(await members.count()).toBeGreaterThanOrEqual(2);

    // The lists the pages read reported the pool's file systems, each with no UUID (ZFS design 10.3).
    await expect
      .poll(() => seen.read)
      .toContain("FileSystemMgmt.enumerateFilesystems");
    expect(reported("FileSystemMgmt.enumerateFilesystems")).toContain(POOL);
    expect(
      reported("FileSystemMgmt.enumerateFilesystems").some((n) =>
        n.startsWith(`${POOL}/`),
      ),
    ).toBe(true);
    expect(new Set(seen.zfsUuids)).toEqual(new Set([null]));
    for (const call of CHANGES) {
      expect(seen.calls).not.toContain(call);
    }
    expect(seen.unexpected).toEqual([]);
  });

  test("a member disk's page refuses the wipe, naming the pool", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    await page.goto("/ui/storage/disks");
    const member = page
      .getByRole("table", { name: copy.disks.tableLabel })
      .getByRole("row")
      .filter({ hasText: `Part of ZFS pool ${POOL}` })
      .first();
    await member.getByRole("link", { name: /^Open disk / }).click();
    const wipe = page.getByRole("region", { name: "Wipe this disk" });
    await expect(wipe).toContainText(
      copy.wipe.blocked.zfs.replace("{{pool}}", POOL),
    );
    await expect(
      wipe.getByRole("button", { name: "Wipe disk…" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(seen.calls).not.toContain("DiskMgmt.wipe");
    expect(seen.unexpected).toEqual([]);
  });
});
