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
  test.skip(
    !POOL_NAME.test(POOL),
    "OMV_WEBUI_VM_ZFS_POOL does not name a ZFS pool on the VM (such as tank); these tests are skipped.",
  );
  test("the dashboard, File systems and Disks load and show the pool, changing nothing", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    const reported = (call: string) => [...(seen.zfsNames.get(call) ?? [])];

    // Dashboard: the pool as one item for the file systems the mounted list reports (ZFS design 10.1).
    const storage = page.getByRole("region", {
      name: copy.dashboard.storage.title,
    });
    await expect(storage.getByRole("meter").first()).toBeVisible();
    await expect
      .poll(() => seen.read)
      .toContain("FileSystemMgmt.enumerateMountedFilesystems");
    if (reported("FileSystemMgmt.enumerateMountedFilesystems").length > 0) {
      await expect(
        storage.getByRole("meter", {
          name: copy.dashboard.storage.zfsPool.replace("{{pool}}", POOL),
          exact: true,
        }),
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

// ---- The ZFS journeys (ZFS design 15.2), on four scratch disks ---------------------------------
//
// They run ONLY when OMV_WEBUI_VM_ZFS_DISKS names four scratch disks (kernel names such as
// "sdb,sdc,sdd,sde"), none of them sda or nvme0n1, AND nothing is pending, AND the create form offers
// all four (as empty disks or under "Erase and reuse"). They erase those disks. Each journey ends with
// its pools deleted, the disks wiped and nothing pending. Otherwise they are skipped with the reason.

const DISK_NAME = /^[a-z][a-z0-9]{0,31}$/;
const NEVER = new Set(["sda", "nvme0n1"]);

function zfsDisks(): { disks: string[] } | { skip: string } {
  const names = (process.env.OMV_WEBUI_VM_ZFS_DISKS ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n !== "");
  if (names.length !== 4 || !names.every((n) => DISK_NAME.test(n))) {
    return {
      skip: "OMV_WEBUI_VM_ZFS_DISKS does not name four disks (such as sdb,sdc,sdd,sde); nothing is created.",
    };
  }
  if (names.some((n) => NEVER.has(n)) || new Set(names).size !== 4) {
    return {
      skip: "OMV_WEBUI_VM_ZFS_DISKS names a disk that is never used; nothing is created.",
    };
  }
  return { disks: names.map((n) => `/dev/${n}`) };
}

interface Journey {
  calls: string[];
  failures: string[];
  params: Map<string, unknown[]>;
}

/** Every call, its params, and any failed reply. */
function journey(page: Page): Journey {
  const seen: Journey = { calls: [], failures: [], params: new Map() };
  page.on("response", async (response) => {
    if (!response.url().endsWith("/rpc.php")) {
      return;
    }
    let name: string;
    let params: unknown;
    try {
      const body: unknown = response.request().postDataJSON();
      name = `${String(field(body, "service"))}.${String(field(body, "method"))}`;
      params = field(body, "params");
    } catch {
      return;
    }
    seen.calls.push(name);
    seen.params.set(name, [...(seen.params.get(name) ?? []), params]);
    if (response.status() !== 200 && response.status() !== 401) {
      seen.failures.push(`${name} ${String(response.status())}`);
    }
  });
  return seen;
}

const times = (seen: Journey, call: string) =>
  seen.calls.filter((c) => c === call).length;

async function applyBand(page: Page) {
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

/** The create form, ready: skips the journey when something is pending or a disk is not offered. */
async function createForm(page: Page, disks: readonly string[]) {
  await page.goto("/ui/storage/zfs/create");
  const preflight = page.getByText(copy.addStorage.preflightTitle);
  const form = page.getByRole("button", { name: copy.zfsCreate.continue });
  await expect(
    preflight.or(form).or(page.getByText(copy.zfsCreate.notEnough)),
  ).toBeVisible({ timeout: 60_000 });
  test.skip(
    await preflight.isVisible(),
    "Changes are pending on the VM; the ZFS flows do not start, and nothing is created.",
  );
  for (const disk of disks) {
    test.skip(
      (await page
        .getByRole("checkbox", { name: new RegExp(`^${disk}\\s?, `) })
        .count()) === 0,
      "The create form does not offer every scratch disk; nothing is created.",
    );
  }
}

/** Create a pool from the form; returns when the result says it is ready. */
async function createPool(
  page: Page,
  scratch: readonly string[],
  name: string,
  disks: readonly string[],
  layout: RegExp,
  withFs: boolean,
) {
  await createForm(page, disks);
  // The form comes back with this session's earlier choices (Change choices keeps them): set every
  // scratch disk's box to exactly what this pool needs.
  for (const disk of scratch) {
    const box = page.getByRole("checkbox", {
      name: new RegExp(`^${disk}\\s?, `),
    });
    if ((await box.count()) > 0) {
      await box.setChecked(disks.includes(disk));
    }
  }
  for (const disk of disks) {
    await expect(
      page.getByRole("checkbox", { name: new RegExp(`^${disk}\\s?, `) }),
    ).toBeChecked();
  }
  await page.getByRole("radio", { name: layout }).click();
  await page.getByRole("textbox", { name: copy.zfsCreate.name }).fill(name);
  const first = page.getByRole("checkbox", {
    name: /^Make a first file system/,
  });
  if ((await first.isChecked()) !== withFs) {
    await first.click();
  }
  await page.getByRole("button", { name: copy.zfsCreate.continue }).click();
  const typed = disks.join(" ");
  await page
    .getByRole("textbox", { name: `Type ${typed} to confirm.` })
    .fill(typed);
  await page
    .getByRole("button", {
      name:
        disks.length === 1
          ? "Erase 1 disk and create pool"
          : `Erase ${String(disks.length)} disks and create pool`,
    })
    .click();
  await expect(page.getByText(copy.zfsCreate.doneTitle)).toBeVisible({
    timeout: 300_000,
  });
}

/** Delete a pool that holds only its own folder, from its page, after typing its name. */
async function deletePool(page: Page, pool: string) {
  await page.goto(`/ui/storage/zfs/pools/${pool}`);
  const open = page.getByRole("button", { name: copy.zfsDelete.pool.open });
  await expect(open).toHaveAttribute("aria-disabled", "false", {
    timeout: 60_000,
  });
  await open.click();
  const dialog = page.getByRole("alertdialog");
  await dialog
    .getByRole("textbox", { name: `Type ${pool} to confirm.` })
    .fill(pool);
  await dialog
    .getByRole("button", { name: copy.zfsDelete.pool.confirm })
    .click();
  await expect(page.getByText(`Pool ${pool} was deleted.`)).toBeVisible({
    timeout: 180_000,
  });
}

/** Wipe a disk from its page: a deleted pool's disk keeps ZFS's partition table (observed). */
async function wipeDisk(page: Page, device: string) {
  await page.goto(`/ui/storage/disks/${device.replace("/dev/", "")}`);
  const wipe = page.getByRole("region", { name: copy.wipe.title });
  await expect(wipe).not.toContainText(copy.wipe.checking, { timeout: 60_000 });
  const button = wipe.getByRole("button", { name: copy.wipe.open });
  await expect(button).toHaveAttribute("aria-disabled", "false", {
    timeout: 60_000,
  });
  await button.click();
  const dialog = page.getByRole("alertdialog");
  await dialog
    .getByRole("textbox", { name: `Type ${device} to confirm.` })
    .fill(device);
  await dialog.getByRole("button", { name: copy.wipe.confirm }).click();
  await expect(wipe.getByText(`${device} was wiped.`)).toBeVisible({
    timeout: 120_000,
  });
}

test.describe("ZFS journeys on the VM", () => {
  test.describe.configure({ mode: "serial" });

  test("the menu item, the dashboard's one read, and the create form never offering the system or data disk", async ({
    page,
    vm,
  }) => {
    const seen = journey(page);
    await signIn(page, vm.admin);
    const nav = page.getByRole("navigation", { name: copy.app.navigation });
    await expect(
      nav.getByRole("link", { name: copy.nav.items.storage.zfs, exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2_000);
    // The dashboard reads only getPoolStatus (P14); the probe runs no command.
    expect(seen.calls).toContain("Zfs.listCompressionTypes");
    for (const call of [
      "Zfs.listPools",
      "Zfs.getObjectDetails",
      "Zfs.getAllSnapshots",
    ]) {
      expect(seen.calls).not.toContain(call);
    }
    await nav
      .getByRole("link", { name: copy.nav.items.storage.zfs, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: copy.zfs.title }),
    ).toBeVisible();
    await page.goto("/ui/storage/zfs/create");
    await expect(
      page
        .getByRole("button", { name: copy.zfsCreate.continue })
        .or(page.getByText(copy.addStorage.preflightTitle))
        .or(page.getByText(copy.zfsCreate.notEnough)),
    ).toBeVisible({ timeout: 60_000 });
    for (const never of ["/dev/sda", "/dev/nvme0n1"]) {
      await expect(
        page.getByRole("checkbox", { name: new RegExp(`^${never}\\s?, `) }),
      ).toHaveCount(0);
    }
    expect(times(seen, "Zfs.addPool")).toBe(0);
    expect(seen.failures).toEqual([]);
  });

  test("a mirror with data: snapshots, limit and compression, check, offline and online, replace, delete, then the disks under Erase and reuse", async ({
    page,
    vm,
  }) => {
    const chosen = zfsDisks();
    test.skip("skip" in chosen, "skip" in chosen ? chosen.skip : "");
    if (!("disks" in chosen)) {
      return;
    }
    test.setTimeout(2_400_000);
    const [d0, d1, , d3] = chosen.disks as [string, string, string, string];
    const seen = journey(page);
    await signIn(page, vm.admin);

    // Create the mirror with its first file system "data", through the one checkpoint.
    await createPool(
      page,
      chosen.disks,
      "tank",
      [d0, d1],
      /^Mirror, recommended/,
      true,
    );
    expect(times(seen, "Zfs.addPool")).toBe(1);
    expect(times(seen, "Zfs.addObject")).toBe(1);
    expect(times(seen, "Config.applyChangesBg")).toBe(1);
    await expect(
      page.getByText(/is mounted and ready, with .* free\./),
    ).toBeVisible();

    // The pool's page: two working disks; its file system.
    await page.goto("/ui/storage/zfs/pools/tank");
    const disks = page.getByRole("table", { name: "Disks in pool tank" });
    await expect(disks.getByText(copy.zfsRole.working)).toHaveCount(2, {
      timeout: 60_000,
    });
    await expect(
      page.getByRole("link", { name: "Open file system tank/data" }),
    ).toBeVisible();

    // Snapshots: take two, roll back to the newest, delete one (its change applied).
    await page.goto("/ui/storage/zfs/fs/tank/data");
    const take = page.getByRole("button", { name: copy.zfsSnap.take });
    await take.click();
    await expect.poll(() => times(seen, "Zfs.quickSnapshot")).toBe(1);
    await page.waitForTimeout(1_500);
    await take.click();
    await expect.poll(() => times(seen, "Zfs.quickSnapshot")).toBe(2);
    const snaps = page.getByRole("table", { name: "Snapshots of tank/data" });
    await expect(snaps.getByRole("row")).toHaveCount(3, { timeout: 30_000 });
    await snaps
      .getByRole("button", { name: /^Roll tank\/data back to snapshot / })
      .click();
    let dialog = page.getByRole("alertdialog");
    await dialog.getByRole("textbox").fill("tank/data");
    await dialog.getByRole("button", { name: copy.zfsSnap.rb.confirm }).click();
    await expect
      .poll(() => times(seen, "Zfs.rollbackSnapshot"), { timeout: 60_000 })
      .toBe(1);
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    await snaps
      .getByRole("button", { name: /^Delete snapshot / })
      .first()
      .click();
    dialog = page.getByRole("alertdialog");
    const prompt = await dialog.getByRole("textbox").getAttribute("aria-label");
    const snapName =
      /^Type (\S+) to confirm\.$/.exec(prompt ?? "")?.[1] ??
      /Type (\S+) to confirm/.exec((await dialog.textContent()) ?? "")?.[1] ??
      "";
    await dialog.getByRole("textbox").fill(snapName);
    await dialog
      .getByRole("button", { name: copy.zfsSnap.del.confirm })
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 180_000 });
    await expect(snaps.getByRole("row")).toHaveCount(2, { timeout: 30_000 });

    // Size limit and compression: saved, then applied in the band.
    await page.getByRole("radio", { name: "Up to:" }).click();
    await page
      .getByRole("textbox", { name: copy.zfsFsAdd.limitAmount })
      .fill("2");
    await page
      .getByRole("radio", { name: copy.zfsFsSettings.compressionOff })
      .click();
    await page.getByRole("button", { name: copy.zfsFsSettings.save }).click();
    await expect(page.getByText(copy.common.savedPending)).toBeVisible({
      timeout: 30_000,
    });
    expect(seen.params.get("Zfs.setProperties")?.[0]).toEqual({
      type: "Filesystem",
      name: "tank/data",
      properties: [
        { property: "quota", value: "2G", modified: true },
        { property: "compression", value: "off", modified: true },
      ],
    });
    await applyBand(page);

    // Check: start, then stop it if it is still running (small disks check in seconds).
    await page.goto("/ui/storage/zfs/pools/tank");
    await page.getByRole("button", { name: copy.zfsCheck.start }).click();
    dialog = page.getByRole("alertdialog");
    await dialog
      .getByRole("button", { name: copy.zfsCheck.startConfirm })
      .click();
    await expect
      .poll(() => times(seen, "Zfs.scrubPool"), { timeout: 30_000 })
      .toBe(1);
    const stop = page.getByRole("button", { name: copy.zfsCheck.stop });
    // The check can end between seeing the button and pressing it (the button then goes): a press
    // that cannot land within ten seconds means it has ended, and the journey goes on.
    const stopped =
      (await stop.isVisible()) &&
      (await stop.click({ timeout: 10_000 }).then(
        () => true,
        () => false,
      ));
    if (stopped) {
      const d = page.getByRole("alertdialog");
      await d.getByRole("button", { name: copy.zfsCheck.stopConfirm }).click();
      // The check can also end while the confirmation is open: the page then refuses with "The pool
      // changed…", and the dialog is closed with Cancel.
      const refused = d.getByText(copy.zfsCheck.changed);
      await expect(d.or(refused).first())
        .toBeVisible()
        .catch(() => undefined);
      await expect
        .poll(
          async () => (await d.count()) === 0 || (await refused.isVisible()),
          { timeout: 30_000 },
        )
        .toBe(true);
      if (await refused.isVisible()) {
        await d.getByRole("button", { name: copy.zfsCheck.cancel }).click();
      }
      await expect(d).toHaveCount(0, { timeout: 30_000 });
    }

    // Offline, then bring it back.
    await page.goto("/ui/storage/zfs/pools/tank");
    await disks
      .getByRole("button", { name: `Take ${d1} offline` })
      .click({ timeout: 120_000 });
    dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: copy.zfsOffline.confirm }).click();
    await expect(
      page.getByRole("heading", { name: copy.zfsPool.todo.offlineTitle }),
    ).toBeVisible({ timeout: 60_000 });
    await disks
      .getByRole("button", { name: `Bring ${d1} back into pool tank` })
      .click();
    dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: copy.zfsOnline.confirm }).click();
    await expect(disks.getByText(copy.zfsRole.offline)).toHaveCount(0, {
      timeout: 120_000,
    });

    // Replace a working disk with the fourth: one typed confirmation, then the rebuild ends.
    await expect(
      disks.getByRole("button", { name: `Replace ${d1} in pool tank` }),
    ).toBeVisible({ timeout: 300_000 });
    await disks
      .getByRole("button", { name: `Replace ${d1} in pool tank` })
      .click();
    await page.getByRole("radio", { name: new RegExp(`^${d3}\\s?, `) }).click();
    await page.getByRole("button", { name: copy.zfsReplace.continue }).click();
    await page
      .getByRole("textbox", { name: `Type ${d3} to confirm.` })
      .fill(d3);
    await page.getByRole("button", { name: copy.zfsReplace.confirm }).click();
    await expect(
      page.getByText(`Rebuilding onto ${d3} has started.`),
    ).toBeVisible({ timeout: 120_000 });
    expect(
      String(field(seen.params.get("Zfs.deviceReplace")?.[0], "newdevice")),
    ).toMatch(/^\/dev\/disk\/by-id\//);
    await page.goto("/ui/storage/zfs/pools/tank");
    await expect(disks.getByText(copy.zfsRole.working)).toHaveCount(2, {
      timeout: 600_000,
    });
    await expect(disks.getByText(/is taking the place of/)).toHaveCount(0, {
      timeout: 600_000,
    });

    // Delete the file system, then the pool; each applies its own change.
    await page.goto("/ui/storage/zfs/fs/tank/data");
    await page.getByRole("button", { name: copy.zfsDelete.fs.open }).click();
    dialog = page.getByRole("alertdialog");
    await dialog
      .getByRole("textbox", { name: "Type tank/data to confirm." })
      .fill("tank/data");
    await dialog
      .getByRole("button", { name: copy.zfsDelete.fs.confirm })
      .click();
    await expect(page.getByText("tank/data was deleted.")).toBeVisible({
      timeout: 180_000,
    });
    expect(seen.params.get("Zfs.deleteObjectBg")?.at(-1)).toEqual({
      type: "Filesystem",
      name: "tank/data",
      mp: "/tank/data",
      recursive: false,
    });
    await deletePool(page, "tank");

    // The disks keep ZFS's partition table: offered again only under Erase and reuse (item 4).
    await page.goto("/ui/storage/zfs/create");
    const reuse = page.getByRole("group", {
      name: copy.addStorage.group.reuse,
    });
    await expect(reuse).toBeVisible({ timeout: 60_000 });
    for (const disk of [d0, d1, d3]) {
      await expect(
        reuse.getByRole("checkbox", { name: new RegExp(`^${disk}\\s?, `) }),
      ).toBeVisible();
    }
    for (const disk of [d0, d1, d3]) {
      await wipeDisk(page, disk);
    }
    expect(
      seen.failures.filter((f) => !f.startsWith("Smart.getDeviceSettings")),
    ).toEqual([]);
  });

  test("RAID-Z1 and RAID-Z2, created and deleted; no protection warned twice and never preselected", async ({
    page,
    vm,
  }) => {
    const chosen = zfsDisks();
    test.skip("skip" in chosen, "skip" in chosen ? chosen.skip : "");
    if (!("disks" in chosen)) {
      return;
    }
    test.setTimeout(1_800_000);
    const [d0, d1, d2, d3] = chosen.disks as [string, string, string, string];
    const seen = journey(page);
    await signIn(page, vm.admin);

    // No protection: warned in its hint and before the typed field, and not chosen after Change choices.
    await createForm(page, [d0]);
    await page
      .getByRole("checkbox", { name: new RegExp(`^${d0}\\s?, `) })
      .click();
    const stripe = page.getByRole("radio", {
      name: /^No protection \(stripe\)/,
    });
    await expect(stripe).not.toBeChecked();
    await stripe.click();
    await expect(
      page.getByText(/One disk, no protection\. If it fails/),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: copy.zfsCreate.name })
      .fill("scratch");
    await page.getByRole("button", { name: copy.zfsCreate.continue }).click();
    await expect(
      page.getByText(copy.zfsCreate.sum.noProtectTitle),
    ).toBeVisible();
    await page
      .getByRole("button", { name: copy.zfsCreate.changeChoices })
      .click();
    await expect(stripe).not.toBeChecked();
    expect(times(seen, "Zfs.addPool")).toBe(0);

    // RAID-Z1 of three, then RAID-Z2 of four, each deleted and its disks wiped.
    await createPool(
      page,
      chosen.disks,
      "rz1",
      [d0, d1, d2],
      /^Parity \(RAID-Z1\)/,
      false,
    );
    await page.goto("/ui/storage/zfs/pools/rz1");
    await expect(
      page.getByText("Parity (RAID-Z1), 3 disks").first(),
    ).toBeVisible({ timeout: 60_000 });
    await deletePool(page, "rz1");
    await createPool(
      page,
      chosen.disks,
      "rz2",
      [d0, d1, d2, d3],
      /^Double parity \(RAID-Z2\)/,
      false,
    );
    await page.goto("/ui/storage/zfs/pools/rz2");
    await expect(
      page.getByText("Double parity (RAID-Z2), 4 disks").first(),
    ).toBeVisible({ timeout: 60_000 });
    await deletePool(page, "rz2");
    for (const disk of [d0, d1, d2, d3]) {
      await wipeDisk(page, disk);
    }
    expect(times(seen, "Zfs.addPool")).toBe(2);
    expect(
      seen.failures.filter((f) => !f.startsWith("Smart.getDeviceSettings")),
    ).toEqual([]);
  });
});
