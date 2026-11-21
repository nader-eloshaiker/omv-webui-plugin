// SPDX-License-Identifier: GPL-3.0-or-later
// Phase 5's dashboard and Diagnostics pages on the test VM, read-only: the four new dashboard cards
// against the real replies, disk health read only when asked, every poll a background call (UI-14),
// a log read once and searched in the browser, the process list and its pause, and the service tabs.
// Nothing here changes a setting on the VM: every call made is a read (the disk-health check runs
// smartctl, which reads). Any CSP or Trusted Types report, console error, page error or request to
// another origin fails a test (support/vmFixtures.ts).
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

const navigation = (page: Page) =>
  page.getByRole("navigation", { name: copy.app.navigation });

async function signIn(page: Page, account: Account) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill(account.username);
  await page.getByLabel(copy.signIn.password).fill(account.password);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
}

/** A field of an object, or undefined; never printed. */
function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

interface SeenCall {
  name: string;
  background: boolean;
  params: unknown;
}

/** Every rpc.php call the page makes: its name, whether it is a background call, its parameters. */
function recordCalls(page: Page): SeenCall[] {
  const calls: SeenCall[] = [];
  page.on("request", (request: Request) => {
    if (!request.url().endsWith("/rpc.php")) {
      return;
    }
    let body: unknown;
    try {
      body = request.postDataJSON();
    } catch {
      return;
    }
    const service = field(body, "service");
    const method = field(body, "method");
    if (typeof service !== "string" || typeof method !== "string") {
      return;
    }
    calls.push({
      name: `${service}.${method}`,
      background: field(field(body, "options"), "updatelastaccess") === false,
      params: field(body, "params"),
    });
  });
  return calls;
}

/** The last 200 reply of a call, read in the page's own response stream. */
function recordReplies(page: Page): Map<string, unknown> {
  const replies = new Map<string, unknown>();
  page.on("response", async (response) => {
    if (!response.url().endsWith("/rpc.php") || response.status() !== 200) {
      return;
    }
    try {
      const name = (() => {
        const body: unknown = response.request().postDataJSON();
        return `${String(field(body, "service"))}.${String(field(body, "method"))}`;
      })();
      replies.set(name, field(await response.json(), "response"));
    } catch {
      // The page went away before the body arrived.
    }
  });
  return replies;
}

test.describe("an administrator", () => {
  test("sees the new dashboard cards, polled in the background, and disk health only when asked", async ({
    page,
    vm,
  }) => {
    test.setTimeout(3 * 60_000);
    const calls = recordCalls(page);
    const replies = recordReplies(page);
    await signIn(page, vm.admin);

    const storage = page.getByRole("region", {
      name: copy.dashboard.storage.title,
    });
    // The VM's system drive is always listed (includeroot).
    await expect(
      storage.getByRole("meter", { name: copy.dashboard.storage.systemDrive }),
    ).toBeVisible();
    const services = page.getByRole("region", {
      name: copy.dashboard.services.title,
      exact: true,
    });
    await expect(
      services.getByRole("link", { name: copy.dashboard.services.link }),
    ).toBeVisible();
    const network = page.getByRole("region", {
      name: copy.dashboard.network.title,
    });
    await expect(network.locator("li").first()).toBeVisible();
    await expect(network.getByText("lo", { exact: true })).toHaveCount(0);

    // What the cards show matches what the server replied (compared, never printed).
    await expect.poll(() => replies.has("Services.getStatus")).toBe(true);
    const status = field(replies.get("Services.getStatus"), "data");
    expect(Array.isArray(status)).toBe(true);
    const on = (status as unknown[]).filter(
      (s) => field(s, "enabled") === true,
    );
    if (on.length > 0) {
      await expect(
        services
          .getByRole("list", { name: copy.dashboard.services.listLabel })
          .getByRole("listitem"),
      ).toHaveCount(on.length);
    }
    const devices = field(replies.get("Network.enumerateDevicesList"), "data");
    if (Array.isArray(devices)) {
      const shown = devices.filter(
        (d) =>
          field(d, "type") !== "loopback" &&
          field(d, "devicename") !== "lo" &&
          field(d, "type") !== "virtual",
      );
      await expect(network.locator("ul > li")).toHaveCount(shown.length);
    }

    // Every poll of the new cards is a background call; nothing reads disk health on its own.
    for (const name of [
      "FileSystemMgmt.enumerateMountedFilesystems",
      "FileSystemMgmt.getList",
      "Services.getStatus",
      "Network.enumerateDevicesList",
    ]) {
      const made = calls.filter((c) => c.name === name);
      expect(made.length, name).toBeGreaterThan(0);
      expect(
        made.every((c) => c.background),
        name,
      ).toBe(true);
    }
    expect(calls.map((c) => c.name)).not.toContain("Smart.getListBg");

    // Disk health, when asked: the VM's virtual disks report, monitoring is off for all of them.
    const disks = page.getByRole("region", {
      name: copy.dashboard.disks.title,
    });
    await disks
      .getByRole("button", { name: copy.dashboard.disks.check })
      .click();
    await expect(
      disks.getByRole("button", { name: copy.dashboard.disks.checkAgain }),
    ).toBeVisible({ timeout: 120_000 });
    const list = disks.getByRole("list", {
      name: copy.dashboard.disks.listLabel,
    });
    await expect(list.getByRole("listitem").first()).toBeVisible();
    expect(calls.filter((c) => c.name === "Smart.getListBg")).toHaveLength(1);
    // Serial numbers are never shown on the dashboard.
    expect(await disks.textContent()).not.toMatch(/serial/i);
  });

  test("reads a log once when it is chosen, and searches it without another read", async ({
    page,
    vm,
  }) => {
    // A full syslog can take a few seconds to read and parse on the server.
    test.setTimeout(2 * 60_000);
    const calls = recordCalls(page);
    await signIn(page, vm.admin);
    await navigation(page)
      .getByRole("link", { name: copy.nav.items.diagnostics["system-logs"] })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: copy.logs.title }),
    ).toBeFocused();
    expect(calls.map((c) => c.name)).not.toContain("LogFile.getList");

    await page.getByRole("combobox", { name: copy.logs.picker }).click();
    await page.getByRole("option", { name: copy.logs.id.syslog }).click();
    await expect(page.getByText(/entries, read at /)).toBeVisible({
      timeout: 60_000,
    });
    const reads = () => calls.filter((c) => c.name === "LogFile.getList");
    expect(reads()).toHaveLength(1);
    expect(reads()[0]?.params).toMatchObject({
      id: "syslog",
      start: 0,
      limit: null,
      sortfield: "ts",
      sortdir: "desc",
    });
    expect(reads()[0]?.background).toBe(false);
    const table = page.getByRole("table", {
      name: copy.logs.tableLabel.replace("{{log}}", copy.logs.id.syslog),
    });
    await expect(table.getByRole("row").nth(1)).toBeVisible();

    await page
      .getByRole("searchbox", { name: copy.logs.search })
      .fill("no-such-words-in-any-log-0f9e");
    await expect(
      page.getByText(
        copy.logs.filteredEmpty.replace(
          "{{search}}",
          "no-such-words-in-any-log-0f9e",
        ),
      ),
    ).toBeVisible();
    expect(reads()).toHaveLength(1);
  });

  test("sees the processes, polled in the background every 5 s, and pauses them", async ({
    page,
    vm,
  }) => {
    const calls = recordCalls(page);
    await signIn(page, vm.admin);
    await navigation(page)
      .getByRole("link", { name: copy.nav.items.diagnostics.processes })
      .click();
    const table = page.getByRole("table", { name: copy.processes.tableLabel });
    await expect(table.getByRole("row").nth(1)).toBeVisible({
      timeout: 30_000,
    });
    const reads = () => calls.filter((c) => c.name === "System.getTopInfo");
    await expect
      .poll(() => reads().length, { timeout: 20_000 })
      .toBeGreaterThan(1);
    expect(reads().every((c) => c.background)).toBe(true);
    expect(reads()[0]?.params).toEqual({ format: "json" });

    await page.getByRole("button", { name: copy.processes.pause }).click();
    await expect(
      page.getByRole("button", { name: copy.processes.resume }),
    ).toBeVisible();
    const paused = reads().length;
    await page.waitForTimeout(11_000);
    expect(reads()).toHaveLength(paused);
    await page.getByRole("button", { name: copy.processes.resume }).click();
    await expect.poll(() => reads().length).toBeGreaterThan(paused);
    expect(reads()[paused]?.background).toBe(false);
  });

  test("opens the service tabs, and reads an output only for a service that is on", async ({
    page,
    vm,
  }) => {
    const calls = recordCalls(page);
    const replies = recordReplies(page);
    await signIn(page, vm.admin);
    await navigation(page)
      .getByRole("link", { name: copy.nav.items.diagnostics.services })
      .click();
    await expect(page).toHaveURL(/\/ui\/diagnostics\/services\/smb$/);
    await expect.poll(() => replies.has("Services.getStatus")).toBe(true);
    const status = field(replies.get("Services.getStatus"), "data");
    const samba = Array.isArray(status)
      ? status.find((s) => field(s, "name") === "samba")
      : undefined;
    if (field(samba, "enabled") === false) {
      await expect(
        page.getByText(
          copy.serviceDetails.disabled.replace("{{service}}", "SMB/CIFS"),
        ),
      ).toBeVisible();
      expect(calls.map((c) => c.name)).not.toContain("SMB.getStats");
    }

    const tabs = page.getByRole("navigation", {
      name: copy.serviceDetails.tabs,
    });
    await tabs
      .getByRole("link", { name: copy.serviceDetails.name.ssh })
      .click();
    await expect(page).toHaveURL(/\/ui\/diagnostics\/services\/ssh$/);
    const ssh = Array.isArray(status)
      ? status.find((s) => field(s, "name") === "ssh")
      : undefined;
    if (field(ssh, "enabled") === true) {
      const output = page.getByRole("region", {
        name: copy.serviceDetails.outputLabel.replace("{{service}}", "SSH"),
      });
      await expect(output).toBeVisible();
      await expect(output).toContainText("Connections:");
      const reads = calls.filter((c) => c.name === "SSH.getStats");
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.every((c) => !c.background)).toBe(true);
    }
    await expect(page).toHaveTitle("SSH – Services – openmediavault");
  });
});

test.describe("a normal user", () => {
  test("is kept off the Diagnostics pages without a call", async ({
    page,
    vm,
  }) => {
    const calls = recordCalls(page);
    await signIn(page, vm.user);
    for (const path of [
      "/ui/diagnostics/system-logs",
      "/ui/diagnostics/processes",
      "/ui/diagnostics/services/ssh",
    ]) {
      await page.goto(path);
      await expect(page.getByText(copy.adminOnly.body)).toBeVisible();
    }
    for (const name of [
      "LogFile.getList",
      "System.getTopInfo",
      "SSH.getStats",
      "Services.getStatus",
      "FileSystemMgmt.enumerateMountedFilesystems",
      "Smart.getListBg",
    ]) {
      expect(calls.map((c) => c.name)).not.toContain(name);
    }
  });
});
