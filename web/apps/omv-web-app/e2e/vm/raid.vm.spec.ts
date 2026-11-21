// SPDX-License-Identifier: GPL-3.0-or-later
// RAID on the test VM (phase 5 RAID design 15.2), with openmediavault-md installed. Read-only by
// default: the RAID item in the menu, decided by MdMgmt.getCandidates (which reads no array member),
// nothing about RAID read on the dashboard, the list, and the create form never offering the system
// disk or the data disk, left without confirming, so nothing is created.
//
// The journeys run ONLY when OMV_WEBUI_VM_RAID_DISKS names four scratch disks (kernel names such as
// "sdb,sdc,sdd,sde"), none of them sda or nvme0n1, AND nothing is pending, AND the create form offers
// all four as empty disks. They erase those disks: a mirror with a file system (synchronise, refuse a
// delete while mounted, add a spare and take it out, take a working disk out and add it back, check and
// stop the check, unmount, delete); a stripe (its refusals) and a RAID10 and a RAID6 (their state while
// they synchronise); a RAID5 made bigger. Each ends with its arrays deleted, the disks wiped where an
// array's marks were left, and nothing pending. Otherwise those tests are skipped with the reason.
//
// Account names, the host name, addresses, UUIDs and serial numbers come from the VM and are never
// printed. Any CSP or Trusted Types report, console error, page error or request to another origin
// fails a test (support/vmFixtures.ts).
import type { Page, Response } from "@playwright/test";
import copy from "../../src/locales/en/common.json" with { type: "json" };
import { expect, target, test } from "./support/vmFixtures.ts";
import type { Account } from "./support/vmTarget.ts";

test.skip(
  target === null,
  "No VM env file ($OMV_WEBUI_ENV); the VM suite is skipped.",
);

// A disk's page reads its monitoring settings, which the VM's disks answer with HTTP 500 (journal,
// 2026-11-21): the wipe of a disk taken out of an array goes through that page.
test.use({
  extraAllowances: {
    list: [
      {
        reason: "the VM's disks have no monitoring settings (500)",
        matches: (message, origin) =>
          message.location().url === `${origin}/rpc.php` &&
          message
            .text()
            .startsWith(
              "Failed to load resource: the server responded with a status of 500",
            ),
      },
    ],
  },
});

const DISK_NAME = /^[a-z][a-z0-9]{0,31}$/;
const NEVER = new Set(["sda", "nvme0n1"]);

/** The four scratch disks, or why the journeys are skipped. */
function scratchDisks(): { disks: string[] } | { skip: string } {
  const names = (process.env.OMV_WEBUI_VM_RAID_DISKS ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n !== "");
  if (names.length !== 4 || !names.every((n) => DISK_NAME.test(n))) {
    return {
      skip: "OMV_WEBUI_VM_RAID_DISKS does not name four disks (such as sdb,sdc,sdd,sde); nothing is created.",
    };
  }
  if (names.some((n) => NEVER.has(n)) || new Set(names).size !== 4) {
    return {
      skip: "OMV_WEBUI_VM_RAID_DISKS names a disk that is never used; nothing is created.",
    };
  }
  return { disks: names.map((n) => `/dev/${n}`) };
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
  /** Failed replies: none may happen in these journeys. */
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
      } else if (
        response.status() !== 401 &&
        !(response.status() === 500 && name === "Smart.getDeviceSettings")
      ) {
        seen.unexpected.push(`${name} ${String(response.status())}`);
      }
    } catch {
      // The page went away before the body arrived.
    }
  });
  return seen;
}

const CHANGES = [
  "MdMgmt.create",
  "MdMgmt.add",
  "MdMgmt.grow",
  "MdMgmt.remove",
  "MdMgmt.delete",
  "MdMgmt.setSyncAction",
  "DiskMgmt.wipe",
];

const count = (seen: Watch, call: string) =>
  seen.calls.filter((c) => c === call).length;

/** How many modules are pending, by the last System.getInformation reply. */
const pendingCount = (seen: Watch) => {
  const dirty = field(
    seen.replies.get("System.getInformation"),
    "dirtyModules",
  );
  return Array.isArray(dirty)
    ? dirty.length
    : typeof dirty === "object" && dirty !== null
      ? Object.keys(dirty).length
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

/** Create an array from the create page; returns its device file. */
async function createArray(
  page: Page,
  disks: readonly string[],
  level: RegExp,
  forFiles: boolean,
): Promise<string> {
  await page.goto("/ui/storage/md/create");
  const preflight = page.getByText(copy.addStorage.preflightTitle);
  const first = page.getByRole("checkbox", {
    name: new RegExp(`^${disks[0] ?? ""}\\s?, `),
  });
  await expect(preflight.or(first)).toBeVisible({ timeout: 60_000 });
  expect(await preflight.isVisible(), "nothing pending before a create").toBe(
    false,
  );
  for (const disk of disks) {
    await page
      .getByRole("checkbox", { name: new RegExp(`^${disk}\\s?, `) })
      .click();
  }
  await page.getByRole("radio", { name: level }).click();
  const files = page.getByRole("checkbox", {
    name: /^Put a file system on it/,
  });
  if ((await files.isChecked()) !== forFiles) {
    await files.click();
  }
  await page.getByRole("button", { name: copy.raidCreate.continue }).click();
  const typed = disks.join(" ");
  await page
    .getByRole("textbox", { name: `Type ${typed} to confirm.` })
    .fill(typed);
  await page
    .getByRole("button", {
      name: `Erase ${String(disks.length)} disks and create array`,
    })
    .click();
  await expect(page.getByText(copy.raidCreate.doneTitle)).toBeVisible({
    timeout: 300_000,
  });
  const open = page.getByRole("link", { name: /^Open RAID \/dev\/md\d+$/ });
  const name = (await open.textContent())?.trim() ?? "";
  const device = /\/dev\/md\d+/.exec(name)?.[0] ?? "";
  expect(device).toMatch(/^\/dev\/md\d+$/);
  return device;
}

const arrayPage = (page: Page, device: string) =>
  page.goto(`/ui/storage/md/${device.replace("/dev/", "")}`);

/** Wait for the array to be OK and idle: Check now… becomes available (the 30 s poll moves it). */
async function waitIdle(page: Page, timeout = 600_000) {
  // Available, it carries no aria-disabled at all; unavailable, aria-disabled="true".
  await expect(
    page.getByRole("button", { name: copy.raidCheck.open }),
  ).toBeEnabled({ timeout });
}

/** Delete an array from its page, after typing its name; then apply. */
async function deleteArray(page: Page, device: string) {
  await arrayPage(page, device);
  const open = page.getByRole("button", { name: copy.raidDelete.open });
  await expect(open).toHaveAttribute("aria-disabled", "false", {
    timeout: 30_000,
  });
  await open.click();
  const dialog = page.getByRole("alertdialog");
  await dialog
    .getByRole("textbox", { name: `Type ${device} to confirm.` })
    .fill(device);
  await dialog.getByRole("button", { name: copy.raidDelete.confirm }).click();
  await expect(page.getByText(`RAID ${device} was deleted.`)).toBeVisible({
    timeout: 60_000,
  });
  await applyPending(page);
}

/** Wipe a disk from its page (a disk taken out keeps the array's marks). */
async function wipeDisk(page: Page, device: string) {
  await page.goto(`/ui/storage/disks/${device.replace("/dev/", "")}`);
  const wipe = page.getByRole("region", { name: copy.wipe.title });
  await expect(wipe).not.toContainText(copy.wipe.checking, { timeout: 30_000 });
  const button = wipe.getByRole("button", { name: copy.wipe.open });
  await expect(button).toHaveAttribute("aria-disabled", "false");
  await button.click();
  const dialog = page.getByRole("alertdialog");
  await dialog
    .getByRole("textbox", { name: `Type ${device} to confirm.` })
    .fill(device);
  await dialog.getByRole("button", { name: copy.wipe.confirm }).click();
  await expect(wipe.getByText(`${device} was wiped.`)).toBeVisible({
    timeout: 90_000,
  });
}

/** Skip unless the four disks are named, nothing is pending and the form offers them all empty. */
async function readyOrSkip(page: Page, seen: Watch, disks: readonly string[]) {
  await page.goto("/ui/storage/md/create");
  const preflight = page.getByText(copy.addStorage.preflightTitle);
  const form = page.getByRole("button", { name: copy.raidCreate.continue });
  await expect(
    preflight.or(form).or(page.getByText(copy.raidCreate.notEnough)),
  ).toBeVisible({ timeout: 60_000 });
  test.skip(
    await preflight.isVisible(),
    "Changes are pending on the VM; the RAID flows do not start, and nothing is created.",
  );
  const empty = page.getByRole("group", { name: copy.addStorage.group.empty });
  for (const disk of disks) {
    test.skip(
      (await empty
        .getByRole("checkbox", { name: new RegExp(`^${disk}\\s?, `) })
        .count()) === 0,
      "The create form does not offer every scratch disk as empty; nothing is created.",
    );
  }
  expect(count(seen, "MdMgmt.create")).toBe(0);
}

test.describe("RAID on the VM", () => {
  test("shows RAID in the menu from getCandidates, reads no array on the dashboard, and never offers the system or data disk", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    const nav = page.getByRole("navigation", { name: copy.app.navigation });
    await expect(
      nav.getByRole("link", { name: copy.nav.items.storage.md, exact: true }),
    ).toBeVisible();
    // The dashboard reads nothing that touches a member disk (journal, 2026-11-21).
    await page.waitForTimeout(2_000);
    expect(seen.calls).toContain("MdMgmt.getCandidates");
    for (const call of [
      "MdMgmt.enumerateDevices",
      "MdMgmt.getDetail",
      "MdMgmt.getSlaves",
    ]) {
      expect(seen.calls).not.toContain(call);
    }
    await nav
      .getByRole("link", { name: copy.nav.items.storage.md, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: copy.raid.title }),
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: copy.raid.tableLabel }),
    ).toBeVisible();
    await page.getByRole("link", { name: copy.raid.create }).first().click();
    const preflight = page.getByText(copy.addStorage.preflightTitle);
    const form = page.getByRole("button", { name: copy.raidCreate.continue });
    await expect(
      preflight.or(form).or(page.getByText(copy.raidCreate.notEnough)),
    ).toBeVisible({ timeout: 60_000 });
    if (await form.isVisible()) {
      for (const never of ["/dev/sda", "/dev/nvme0n1"]) {
        await expect(
          page.getByRole("checkbox", { name: new RegExp(`^${never}\\s?, `) }),
        ).toHaveCount(0);
      }
    }
    await page.goto("/ui/storage/md");
    for (const call of CHANGES) {
      expect(seen.calls).not.toContain(call);
    }
    expect(seen.unexpected).toEqual([]);
  });

  test("a mirror with a file system: synchronise, spare, take out, rebuild, check, refuse and delete", async ({
    page,
    vm,
  }) => {
    const chosen = scratchDisks();
    test.skip("skip" in chosen, "skip" in chosen ? chosen.skip : "");
    if (!("disks" in chosen)) {
      return;
    }
    test.setTimeout(1_800_000);
    const [d0, d1, d2] = chosen.disks as [string, string, string, string];
    const seen = watch(page);
    await signIn(page, vm.admin);
    await readyOrSkip(page, seen, chosen.disks);

    // 3. Create a mirror of two disks with "Use it for files": one typed confirmation, one apply.
    const md = await createArray(
      page,
      [d0, d1],
      /^Mirror \(RAID1\), recommended/,
      true,
    );
    expect(count(seen, "MdMgmt.create")).toBe(1);
    expect(count(seen, "FileSystemMgmt.create")).toBe(1);
    expect(count(seen, "Config.applyChangesBg")).toBe(1);
    await expect(
      page.getByText(/is mounted and ready, with .* free\./),
    ).toBeVisible();

    // Its page: the roles from the report; synchronising, then OK (by the poll).
    await arrayPage(page, md);
    await expect(
      page.getByRole("heading", { level: 1, name: `RAID ${md}` }),
    ).toBeVisible();
    const disks = page.getByRole("table", { name: `Disks of RAID ${md}` });
    await expect(disks).toContainText(copy.raidRole.working);
    await waitIdle(page);
    await expect(page.getByText("2 of 2 disks working")).toBeVisible();

    // 6. Delete is refused while its file system is mounted.
    await expect(
      page.getByRole("button", { name: copy.raidDelete.open }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      page.getByText(
        /It holds the file system .*, which is set up on this NAS\./,
      ),
    ).toBeVisible();

    // 4. Add a spare.
    await page.getByRole("link", { name: copy.raidAdd.openSpare }).click();
    await page.getByRole("radio", { name: new RegExp(`^${d2}\\s?, `) }).click();
    await page.getByRole("button", { name: copy.raidCreate.continue }).click();
    await page
      .getByRole("textbox", { name: `Type ${d2} to confirm.` })
      .fill(d2);
    await page.getByRole("button", { name: "Erase disk and add it" }).click();
    await expect(
      page.getByText(`${d2} is now a spare of RAID ${md}.`),
    ).toBeVisible({
      timeout: 120_000,
    });
    await arrayPage(page, md);
    await expect(disks).toContainText(copy.raidRole.spare);

    // Take the spare out (plain: nothing is lost), and apply.
    await disks
      .getByRole("button", { name: `Take ${d2} out of RAID ${md}` })
      .click();
    let dialog = page.getByRole("alertdialog");
    await dialog
      .getByRole("button", { name: copy.raidRemove.confirmPlain, exact: true })
      .click();
    await expect(
      page.getByText(`${d2} was taken out of RAID ${md}.`),
    ).toBeVisible({
      timeout: 60_000,
    });
    await applyPending(page);

    // 7. Take a working disk out (typed): the mirror is short of a disk.
    await arrayPage(page, md);
    await disks
      .getByRole("button", { name: `Take ${d0} out of RAID ${md}` })
      .click();
    dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("It cannot lose another disk.");
    await dialog
      .getByRole("textbox", { name: `Type ${d0} to confirm.` })
      .fill(d0);
    await dialog
      .getByRole("button", { name: copy.raidRemove.confirmWorking })
      .click();
    await expect(
      page.getByText(`${d0} was taken out of RAID ${md}.`),
    ).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByRole("heading", { name: copy.array.now.missingTitle }),
    ).toBeVisible();
    await applyPending(page);

    // Add it back: it keeps the array's marks, so it is erased first; the mirror rebuilds onto it.
    await arrayPage(page, md);
    await page
      .getByRole("link", { name: copy.raidAdd.openReplace })
      .first()
      .click();
    const reuse = page.getByRole("group", {
      name: copy.addStorage.group.reuse,
    });
    await reuse
      .getByRole("radio", { name: new RegExp(`^${d0}\\s?, `) })
      .click();
    await page.getByRole("button", { name: copy.raidCreate.continue }).click();
    await page
      .getByRole("textbox", { name: `Type ${d0} to confirm.` })
      .fill(d0);
    await page.getByRole("button", { name: "Erase disk and add it" }).click();
    await expect(page.getByText(copy.raidAdd.done.replaceTitle)).toBeVisible({
      timeout: 180_000,
    });
    await arrayPage(page, md);
    await waitIdle(page);

    // 8. Check, then stop the check.
    await page.getByRole("button", { name: copy.raidCheck.open }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: copy.raidCheck.confirm })
      .click();
    const stop = page.getByRole("button", { name: copy.raidCheck.stopOpen });
    await expect(stop).toBeVisible({ timeout: 60_000 });
    await stop.click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: copy.raidCheck.stopConfirm, exact: true })
      .click();
    await waitIdle(page, 120_000);
    expect(count(seen, "MdMgmt.setSyncAction")).toBe(2);

    // 9. Unmount the file system on its page, then delete the mirror.
    await page
      .getByRole("link", { name: /^Open file system / })
      .first()
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
      timeout: 180_000,
    });
    await deleteArray(page, md);

    // The spare taken out still carries the array's marks: wipe it.
    await wipeDisk(page, d2);
    await page.goto("/ui/storage/md");
    await expect(page.getByText(copy.raid.empty)).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(() => pendingCount(seen), { timeout: 30_000 }).toBe(0);
    expect(seen.unexpected).toEqual([]);
  });

  test("a stripe's refusals, a RAID10 and a RAID6 while they synchronise, each deleted", async ({
    page,
    vm,
  }) => {
    const chosen = scratchDisks();
    test.skip("skip" in chosen, "skip" in chosen ? chosen.skip : "");
    if (!("disks" in chosen)) {
      return;
    }
    test.setTimeout(900_000);
    const seen = watch(page);
    await signIn(page, vm.admin);
    await readyOrSkip(page, seen, chosen.disks);
    const [d0, d1] = chosen.disks as [string, string, string, string];

    // 13. Stripe: never preselected; nothing to synchronise; it cannot take a disk, lose one or be
    // checked.
    await page.goto("/ui/storage/md/create");
    await page
      .getByRole("checkbox", { name: new RegExp(`^${d0}\\s?, `) })
      .click();
    await page
      .getByRole("checkbox", { name: new RegExp(`^${d1}\\s?, `) })
      .click();
    await expect(
      page.getByRole("radio", { name: /^Stripe \(RAID0\), no protection/ }),
    ).not.toBeChecked();
    const md0 = await createArray(
      page,
      [d0, d1],
      /^Stripe \(RAID0\), no protection/,
      false,
    );
    await arrayPage(page, md0);
    await expect(
      page.getByText("A Stripe (RAID0) array cannot take more disks here."),
    ).toBeVisible();
    await expect(
      page
        .getByRole("table", { name: `Disks of RAID ${md0}` })
        .getByRole("button", { name: /^Take / }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: copy.raidCheck.title }),
    ).toHaveCount(0);
    await deleteArray(page, md0);

    // 12. RAID10 and RAID6 of four: Warning while they synchronise; deleted while they do.
    for (const level of [
      /^Mirror and stripe \(RAID10\)/,
      /^Double parity \(RAID6\)/,
    ]) {
      const md = await createArray(page, chosen.disks, level, false);
      await arrayPage(page, md);
      await expect(page.getByText("4 of 4 disks working")).toBeVisible({
        timeout: 30_000,
      });
      await deleteArray(page, md);
    }
    await page.goto("/ui/storage/md");
    await expect(page.getByText(copy.raid.empty)).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(() => pendingCount(seen), { timeout: 30_000 }).toBe(0);
    expect(seen.unexpected).toEqual([]);
  });

  test("a RAID5 made bigger with a fourth disk, bigger once the reshape ends, then deleted", async ({
    page,
    vm,
  }) => {
    const chosen = scratchDisks();
    test.skip("skip" in chosen, "skip" in chosen ? chosen.skip : "");
    if (!("disks" in chosen)) {
      return;
    }
    test.setTimeout(1_800_000);
    const seen = watch(page);
    await signIn(page, vm.admin);
    await readyOrSkip(page, seen, chosen.disks);
    const [d0, d1, d2, d3] = chosen.disks as [string, string, string, string];

    // 10, 11. A RAID5 of three, synchronised; then bigger with the fourth: no default purpose.
    const md = await createArray(
      page,
      [d0, d1, d2],
      /^Parity \(RAID5\)/,
      false,
    );
    await arrayPage(page, md);
    await waitIdle(page);
    const before = await page.getByText(/^Parity \(RAID5\), /).textContent();
    await page.getByRole("link", { name: copy.raidAdd.open }).click();
    const spare = page.getByRole("radio", { name: /^Keep it as a spare/ });
    const bigger = page.getByRole("radio", { name: /^Make the array bigger/ });
    await expect(spare).not.toBeChecked();
    await expect(bigger).not.toBeChecked();
    await bigger.click();
    await page
      .getByRole("checkbox", { name: new RegExp(`^${d3}\\s?, `) })
      .click();
    await page.getByRole("button", { name: copy.raidCreate.continue }).click();
    await expect(page.getByText(/Reshaping cannot be undone/)).toBeVisible();
    await page
      .getByRole("textbox", { name: `Type ${d3} to confirm.` })
      .fill(d3);
    await page.getByRole("button", { name: "Erase disk and add it" }).click();
    await expect(page.getByText(copy.raidAdd.done.biggerTitle)).toBeVisible({
      timeout: 180_000,
    });
    expect(count(seen, "MdMgmt.grow")).toBe(1);
    await arrayPage(page, md);
    await waitIdle(page, 1_200_000);
    await expect(page.getByText("4 of 4 disks working")).toBeVisible();
    const after = await page.getByText(/^Parity \(RAID5\), /).textContent();
    expect(after).not.toBe(before);
    await deleteArray(page, md);
    await expect.poll(() => pendingCount(seen), { timeout: 30_000 }).toBe(0);
    expect(seen.unexpected).toEqual([]);
  });
});
