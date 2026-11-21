// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disks and a disk's health details on the test VM, read-only: the list shows the VM's disks
// as DiskMgmt.getList reports them, with the system disk named; a disk's page opens; no read that runs
// smartctl is made on opening either page; and "Read health details" reads that disk only, by the
// device file the list reported. Nothing here changes anything on the VM: every call made is a read.
// Any CSP or Trusted Types report, page error or request to another origin fails a test; the console
// errors Chromium logs for the two expected failure replies are allowed, and each failed reply is
// checked to be one of them (support/vmFixtures.ts).
//
// Account names, the host name and the disks' serial numbers come from the VM and are never printed.
import type { ConsoleMessage, Page, Response } from "@playwright/test";
import copy from "../../src/locales/en/common.json" with { type: "json" };
import { expect, target, test } from "./support/vmFixtures.ts";
import type { Account } from "./support/vmTarget.ts";

test.skip(
  target === null,
  "No VM env file ($OMV_WEBUI_ENV); the VM suite is skipped.",
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
// 404: the RAID plugin is not installed on the VM, so OMV does not know MdMgmt. 500: a disk with no
// monitoring settings saved, and the VM's virtual disks, which report no health readings.
test.use({ extraAllowances: [rpcFailure(404), rpcFailure(500)] });

/** The failures each read may legitimately answer with on the VM. */
const EXPECTED_FAILURES: Readonly<Record<string, number>> = {
  "MdMgmt.enumerateDevices": 404,
  "Smart.getDeviceSettings": 500,
  "Smart.getInformation": 500,
  "Smart.getAttributes": 500,
  "Smart.getSelfTestLogs": 500,
  "Smart.getExtendedInformation": 500,
};

const WAKING = new Set([
  "Smart.getListBg",
  "Smart.getInformation",
  "Smart.getAttributes",
  "Smart.getSelfTestLogs",
  "Smart.getExtendedInformation",
  "Smart.executeScheduledTest",
  "Smart.enumerateDevices",
  "Smart.enumerateMonitoredDevices",
]);

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

interface Seen {
  name: string;
  params: unknown;
}

/** Every rpc.php call, the last 200 reply of each, and every failed reply, by name. */
function record(page: Page) {
  const calls: Seen[] = [];
  const replies = new Map<string, unknown>();
  const failures: { name: string; status: number }[] = [];
  const nameOf = (body: unknown) =>
    `${String(field(body, "service"))}.${String(field(body, "method"))}`;
  page.on("request", (request) => {
    if (!request.url().endsWith("/rpc.php")) {
      return;
    }
    try {
      const body: unknown = request.postDataJSON();
      calls.push({ name: nameOf(body), params: field(body, "params") });
    } catch {
      // Not a JSON body; the fixtures' own checks report it.
    }
  });
  page.on("response", async (response: Response) => {
    if (!response.url().endsWith("/rpc.php")) {
      return;
    }
    try {
      const name = nameOf(response.request().postDataJSON());
      if (response.status() === 200) {
        replies.set(name, field(await response.json(), "response"));
      } else if (response.status() !== 401) {
        failures.push({ name, status: response.status() });
      }
    } catch {
      // The page went away before the body arrived.
    }
  });
  return { calls, replies, failures };
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

test.describe("an administrator", () => {
  test("sees the VM's disks, opens one, and reads its health details only when asked", async ({
    page,
    vm,
  }) => {
    test.setTimeout(2 * 60_000);
    const seen = record(page);
    await signIn(page, vm.admin);
    await page.goto("/ui/storage/disks");
    await expect(
      page.getByRole("heading", { level: 1, name: copy.disks.title }),
    ).toBeVisible();
    const table = page.getByRole("table", { name: copy.disks.tableLabel });
    await expect(table.getByRole("link").first()).toBeVisible();

    // The rows are the disks the server listed (compared, never printed).
    await expect.poll(() => seen.replies.has("DiskMgmt.getList")).toBe(true);
    const disks = field(seen.replies.get("DiskMgmt.getList"), "data");
    expect(Array.isArray(disks)).toBe(true);
    const rows = disks as unknown[];
    await expect(table.locator("tbody tr")).toHaveCount(rows.length);
    const system = rows.find((d) => field(d, "isroot") === true);
    expect(system, "the VM has a system disk").toBeDefined();
    const systemRow = table
      .getByRole("link", {
        name: `Open disk ${String(field(system, "canonicaldevicefile"))}`,
      })
      .locator("xpath=ancestor::tr");
    await expect(systemRow).toContainText(copy.disks.use.system);
    // The RAID plugin is not installed: that is no failure.
    await expect(
      page.getByText(copy.disks.useFailed, { exact: true }),
    ).toHaveCount(0);
    expect(seen.calls.filter((c) => WAKING.has(c.name))).toEqual([]);

    // A disk's page, opened from its link: still no waking read.
    const disk =
      rows.find(
        (d) => field(d, "isroot") !== true && field(d, "isreadonly") !== true,
      ) ?? system;
    const device = String(field(disk, "canonicaldevicefile"));
    await table.getByRole("link", { name: `Open disk ${device}` }).click();
    const details = page.getByRole("region", {
      name: copy.disk.details.title,
    });
    await expect(details).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/ui/storage/disks/${String(field(disk, "devicename"))}$`),
    );
    await page.waitForLoadState("networkidle");
    expect(seen.calls.filter((c) => WAKING.has(c.name))).toEqual([]);

    // The press reads this disk only, by the stable device file the list reported.
    await details.getByRole("button", { name: copy.disk.details.read }).click();
    await expect(
      details.getByRole("button", { name: copy.disk.details.readAgain }),
    ).toBeVisible({ timeout: 60_000 });
    const woke = seen.calls.filter((c) => WAKING.has(c.name));
    expect(woke.map((c) => c.name).sort()).toEqual([
      "Smart.getAttributes",
      "Smart.getInformation",
      "Smart.getSelfTestLogs",
    ]);
    for (const call of woke) {
      expect(field(call.params, "devicefile")).toBe(field(disk, "devicefile"));
    }

    // Every failed reply was one the VM is expected to give.
    for (const failure of seen.failures) {
      expect(
        EXPECTED_FAILURES[failure.name],
        `${failure.name} answered ${String(failure.status)}`,
      ).toBe(failure.status);
    }
  });
});
