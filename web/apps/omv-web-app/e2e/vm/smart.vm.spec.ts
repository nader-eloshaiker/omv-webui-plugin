// SPDX-License-Identifier: GPL-3.0-or-later
// The three Disk health pages on the test VM, read-only: the Overview, Self-tests and Settings tabs
// show the VM's real settings, disks and scheduled tests; nothing is saved, and nothing that runs
// smartctl (the disk-health check, a test start, a disk's details) is called without a press. Any CSP
// or Trusted Types report, console error, page error or request to another origin fails a test
// (support/vmFixtures.ts).
//
// Account names, the host name and addresses come from the env file or the VM and are never printed.
import type { Page, Request } from "@playwright/test";
import copy from "../../src/locales/en/common.json" with { type: "json" };
import { expect, target, test } from "./support/vmFixtures.ts";
import type { Account } from "./support/vmTarget.ts";

test.skip(
  target === null,
  "No VM env file ($OMV_WEBUI_ENV); the VM suite is skipped.",
);

/**
 * The VM's disks have no monitoring settings saved, and OMV answers Smart.getDeviceSettings for such a
 * disk with HTTP 500 and its database lookup's message (the contract's notConfigured example). The
 * interface reads it as "not watched", and no other reply says whether a disk has settings without
 * waking it, so the pages ask. Chromium logs each 500 as a failed resource without the method's
 * name, so the console line is allowed here and every failed reply is checked below to be exactly
 * that one.
 */
test.use({
  extraAllowances: {
    list: [
      {
        reason:
          "Smart.getDeviceSettings answers 500 for a disk with no settings saved, checked below",
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

const NO_SETTINGS =
  /^The XPath query '.*\/\/services\/smart\/monitor\/device\[.*' does not return the requested number of 1 object\(s\)\.$/s;

/** Every failed rpc.php reply that is not "no settings saved" for Smart.getDeviceSettings. */
function recordUnexpectedFailures(page: Page): string[] {
  const unexpected: string[] = [];
  page.on("response", async (response) => {
    if (!response.url().endsWith("/rpc.php") || response.status() === 200) {
      return;
    }
    let name = "";
    try {
      const body: unknown = response.request().postDataJSON();
      name = `${String(field(body, "service"))}.${String(field(body, "method"))}`;
      const message = field(field(await response.json(), "error"), "message");
      if (
        name === "Smart.getDeviceSettings" &&
        response.status() === 500 &&
        typeof message === "string" &&
        NO_SETTINGS.test(message)
      ) {
        return;
      }
    } catch {
      // Fall through: a failure whose reply could not be read is unexpected too.
    }
    unexpected.push(`${name} ${String(response.status())}`);
  });
  return unexpected;
}

/** The reads that run smartctl and can wake a sleeping disk, and the test start. */
const WAKING = [
  "Smart.getListBg",
  "Smart.getInformation",
  "Smart.getAttributes",
  "Smart.getSelfTestLogs",
  "Smart.getExtendedInformation",
  "Smart.executeScheduledTest",
  "Smart.enumerateDevices",
  "Smart.enumerateMonitoredDevices",
];
/** The calls that would change the VM. */
const WRITES = [
  "Smart.setSettings",
  "Smart.setDeviceSettings",
  "Smart.setScheduledTest",
  "Smart.deleteScheduledTest",
  "DiskMgmt.setHdParm",
  "DiskMgmt.wipe",
  "Config.applyChangesBg",
  "Config.revertChangesBg",
];

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

function recordCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on("request", (request: Request) => {
    if (!request.url().endsWith("/rpc.php")) {
      return;
    }
    try {
      const body: unknown = request.postDataJSON();
      calls.push(
        `${String(field(body, "service"))}.${String(field(body, "method"))}`,
      );
    } catch {
      // Not a JSON call; the transport never sends one.
    }
  });
  return calls;
}

/** The last 200 reply of a call (compared, never printed). */
function recordReplies(page: Page): Map<string, unknown> {
  const replies = new Map<string, unknown>();
  page.on("response", async (response) => {
    if (!response.url().endsWith("/rpc.php") || response.status() !== 200) {
      return;
    }
    try {
      const body: unknown = response.request().postDataJSON();
      const name = `${String(field(body, "service"))}.${String(field(body, "method"))}`;
      replies.set(name, field(await response.json(), "response"));
    } catch {
      // The page went away before the body arrived.
    }
  });
  return replies;
}

test.describe("an administrator", () => {
  test("reads the three Disk health pages without saving or waking anything", async ({
    page,
    vm,
  }) => {
    test.setTimeout(2 * 60_000);
    const calls = recordCalls(page);
    const replies = recordReplies(page);
    const unexpected = recordUnexpectedFailures(page);
    await signIn(page, vm.admin);

    await page.goto("/ui/storage/smart");
    await expect(page).toHaveURL(/\/ui\/storage\/smart\/overview$/);
    const monitoring = page.getByRole("region", {
      name: copy.smart.overview.monitoring,
    });
    await expect.poll(() => replies.has("Smart.getSettings")).toBe(true);
    const enabled = field(replies.get("Smart.getSettings"), "enable");
    if (enabled === true) {
      await expect(
        monitoring.getByText(/^Watched disks are checked every /),
      ).toBeVisible();
    } else {
      await expect(monitoring.getByText(copy.smart.overview.off)).toBeVisible();
    }
    // Every disk of the VM's list has its row.
    await expect.poll(() => replies.has("DiskMgmt.getList")).toBe(true);
    const disks = field(replies.get("DiskMgmt.getList"), "data");
    expect(Array.isArray(disks)).toBe(true);
    const table = page.getByRole("table", {
      name: copy.smart.overview.tableLabel,
    });
    await expect(table.locator("tbody tr")).toHaveCount(
      (disks as unknown[]).length,
    );
    await expect(table.getByText(copy.disks.notChecked).first()).toBeVisible();

    await page
      .getByRole("navigation", { name: copy.smart.tabs })
      .getByRole("link", { name: copy.smart.tab.selfTests })
      .click();
    await expect(page).toHaveURL(/\/ui\/storage\/smart\/self-tests$/);
    await expect.poll(() => replies.has("Smart.getScheduleList")).toBe(true);
    const tests = field(replies.get("Smart.getScheduleList"), "data");
    if (Array.isArray(tests) && tests.length > 0) {
      await expect(
        page
          .getByRole("table", { name: copy.smart.tests.tableLabel })
          .locator("tbody tr"),
      ).toHaveCount(tests.length);
    } else {
      await expect(page.getByText(copy.smart.tests.empty)).toBeVisible();
    }

    await page
      .getByRole("navigation", { name: copy.smart.tabs })
      .getByRole("link", { name: copy.smart.tab.settings })
      .click();
    const watch = page.getByRole("checkbox", {
      name: copy.smart.settings.watch,
    });
    await expect(watch).toBeVisible();
    if (enabled === true) {
      await expect(watch).toBeChecked();
    } else {
      await expect(watch).not.toBeChecked();
    }
    await expect(
      page.getByRole("button", { name: copy.common.save }),
    ).toHaveAttribute("aria-disabled", "true");

    for (const call of [...WAKING, ...WRITES]) {
      expect(calls, `${call} was called`).not.toContain(call);
    }
    expect(unexpected).toEqual([]);
  });
});
