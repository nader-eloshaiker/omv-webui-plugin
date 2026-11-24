// SPDX-License-Identifier: GPL-3.0-or-later
// The network slice on the test VM (phase 5 network design 18.2). The VM has three ports: enp2s0
// carries this page and SSH and is NEVER changed here; enp3s0 and enp26s0 are extra ports on another
// network, without settings. Each journey saves through the pages, applies from the band and reads the
// real result back:
// - read only: the Interfaces page shows enp2s0 with "This page uses it" and the connection line in
//   its Known form; the General page shows the name;
// - enp3s0 set up with DHCP (its row then shows an address), its packet size changed, a VLAN added on
//   it and removed, its light blinked for 5 seconds, its settings removed (back to "Not set up here");
// - a bond of enp3s0 and enp26s0 (Keep working if a port fails, main port enp3s0), its page listing
//   both ports, then removed;
// - enp3s0's settings removed and the removal undone from the band: 10.4's line in the Undo
//   confirmation and the forced apply of the queued jobs and the network; then removed for good;
// - the firewall: Allow TCP 22, then this page's port and the other web port (80 and 443) at the top,
//   Block everything else, applied, the page still loads; then every rule deleted and applied;
// - the proxy: a web proxy at a documentation address with a user and password, applied, "Password:
//   Set" on reopening; then off, the stored password removed, the address cleared, applied;
// - the name: a test name (the page is opened by address, so not affected), applied, shown in the top
//   bar; then the name it had, applied;
// - this page's own port moved through the change flow: skipped unless OMV_WEBUI_VM_NETWORK_MOVE=yes,
//   and run by hand last (design 18.2 #5).
//
// It refuses to start (beforeAll fails, and nothing is changed or cleaned) unless nothing is pending,
// this page reaches the NAS through enp2s0, enp3s0 and enp26s0 exist without settings, no bond, VLAN
// or bridge of this test exists, no firewall rule exists (IPv4 or IPv6) and no proxy is set. Whatever
// happens, afterAll puts the VM back through the same pages: pending changes undone, the VLAN, the
// bond and the two ports' settings removed, every firewall rule deleted, the proxy off and empty, the
// name as it was, all applied. Host names, addresses and passwords come from the VM or are made for the
// run, and are never printed: comparisons with them report only whether they matched.
import type { Browser, Locator, Page, Response } from "@playwright/test";
import { randomBytes } from "node:crypto";
import copy from "../../src/locales/en/common.json" with { type: "json" };
import { expect, target, test } from "./support/vmFixtures.ts";
import type { Account, VmTarget } from "./support/vmTarget.ts";

test.skip(
  target === null,
  "No VM env file ($OMV_WEBUI_ENV); the VM suite is skipped.",
);

/** The port this page and SSH use: never changed here. */
const PAGE_PORT = "enp2s0";
/** The two extra ports, on another network. */
const PORT = "enp3s0";
const OTHER_PORT = "enp26s0";
const BOND = "bond0";
const VLAN_ID = "10";
const VLAN = `${PORT}.${VLAN_ID}`;
/** Interfaces this test makes; none may have settings when it starts. */
const OURS = [PORT, OTHER_PORT, BOND, VLAN, `${OTHER_PORT}.${VLAN_ID}`];
/** A packet size the extra port takes. */
const MTU = "1400";
/** A documentation address for the proxy; nothing answers there. */
const PROXY_HOST = "192.0.2.1";
const PROXY_PORT = "3128";
const PROXY_USER = "webui-test";
/** A name for the NAS during the name journey. */
const TEST_NAME = "nas-webui-test";

const SLOW = { timeout: 60_000 };
const APPLY = { timeout: 240_000 };

/** A sentence with names inside it, each optionally isolated (FSI and PDI) as the pages show them. */
const sentence = (text: string) =>
  new RegExp(
    `^${text
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\{\\\{(\w+)\\\}\\\}/g, "\\u2068?.+?\\u2069?")
      .replace(/<(\w+)><\/\1>/g, "\\u2068?.+?\\u2069?")}$`,
  );

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

const callOf = (body: unknown) =>
  `${String(field(body, "service"))}.${String(field(body, "method"))}`;

/** The reads whose last reply the test keeps. Passwords are dropped before a reply is kept. */
const KEPT = new Set([
  "System.getInformation",
  "Network.getGeneralSettings",
  "Network.getInterfaceList",
  "Network.enumerateDevicesList",
  "Network.getProxy",
  "Iptables.getRules",
  "Iptables.getRules6",
]);

const withoutPasswords = (value: unknown): unknown =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter(([key]) => !/password|psk/i.test(key)),
      )
    : value;

interface Watch {
  /** Every call, in order, by name. */
  calls: string[];
  /** The parameters of each Config.applyChangesBg, in order (modules and force only). */
  applies: unknown[];
  replies: Map<string, unknown>;
}

/** The calls the page makes and the last reply of each kept read. Nothing here is ever printed. */
function watch(page: Page): Watch {
  const seen: Watch = { calls: [], applies: [], replies: new Map() };
  page.on("request", (request) => {
    if (!request.url().endsWith("/rpc.php")) {
      return;
    }
    let body: unknown;
    try {
      body = request.postDataJSON();
    } catch {
      return;
    }
    const name = callOf(body);
    seen.calls.push(name);
    if (name === "Config.applyChangesBg") {
      const params = field(body, "params");
      seen.applies.push({
        modules: field(params, "modules"),
        force: field(params, "force"),
      });
    }
  });
  page.on("response", async (response: Response) => {
    if (!response.url().endsWith("/rpc.php") || response.status() !== 200) {
      return;
    }
    let name: string;
    try {
      name = callOf(response.request().postDataJSON());
    } catch {
      return;
    }
    if (!KEPT.has(name)) {
      return;
    }
    try {
      const envelope: unknown = await response.json();
      seen.replies.set(name, withoutPasswords(field(envelope, "response")));
    } catch {
      // The page went away before the body arrived.
    }
  });
  return seen;
}

/** The last reply of a kept read, once the page has made it. */
async function reply(seen: Watch, name: string): Promise<unknown> {
  await expect
    .poll(() => seen.replies.has(name), { message: `a reply to ${name}` })
    .toBe(true);
  return seen.replies.get(name);
}

const rows = (value: unknown): unknown[] => {
  const data = field(value, "data");
  return Array.isArray(data) ? data : Array.isArray(value) ? value : [];
};

const devicenames = (value: unknown): string[] =>
  rows(value).map((row) => String(field(row, "devicename")));

const pendingModules = (info: unknown): string[] => {
  const dirty = field(info, "dirtyModules");
  return Array.isArray(dirty)
    ? dirty.map(String)
    : typeof dirty === "object" && dirty !== null
      ? Object.keys(dirty)
      : [];
};

async function signIn(page: Page, account: Account) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill(account.username);
  await page.getByLabel(copy.signIn.password).fill(account.password);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
}

/** A page of its own, for beforeAll and afterAll (the test fixtures are not available there). */
async function openPage(browser: Browser, vm: VmTarget) {
  const context = await browser.newContext({
    baseURL: vm.origin,
    ignoreHTTPSErrors: vm.origin.startsWith("https:"),
  });
  const page = await context.newPage();
  return { page, close: () => context.close() };
}

// ---- The band ------------------------------------------------------------------------------------------

const band = (page: Page) =>
  page.getByRole("region", { name: copy.pending.label });

/**
 * Apply what is pending through the band's ordinary confirmation, and wait until the band has gone.
 * A typed confirmation means the network check sees a risk to this page: the test stops there rather
 * than type it.
 */
async function applyPending(page: Page) {
  await expect(band(page)).toBeVisible(SLOW);
  const apply = band(page).getByRole("button", {
    name: /^Apply \d+ changes?$/,
  });
  const label = ((await apply.textContent()) ?? "").trim();
  await apply.click();
  const dialog = page.getByRole("alertdialog", { name: `${label}?` });
  await expect(dialog.getByText(copy.netApply.checking)).toHaveCount(0, SLOW);
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: label }).click();
  await expect(band(page)).toHaveCount(0, APPLY);
}

// ---- Interfaces ----------------------------------------------------------------------------------------

/** The connection line (0.4): the first status in the page's main region. */
const connectionLine = (page: Page) =>
  page.getByRole("main").getByRole("status").first();

const table = (page: Page) =>
  page.getByRole("region", { name: copy.interfaces.title }).getByRole("table");

/** An interface's row on the Interfaces page, by the link that leads to its page. */
const rowOf = (page: Page, name: string) =>
  table(page)
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name, exact: true }) })
    .first();

async function openInterfaces(page: Page) {
  await page.goto("/ui/network/interfaces");
  await expect(rowOf(page, PAGE_PORT)).toBeVisible(SLOW);
}

/** Set up a port with the classic defaults (DHCP for IPv4), saved to the band. */
async function setUpPort(page: Page, port: string) {
  await openInterfaces(page);
  await page.getByRole("button", { name: copy.interfaces.add.label }).click();
  await page.getByRole("menuitem", { name: copy.interfaces.add.port }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.ifaceForm.titleNew }),
  ).toBeVisible(SLOW);
  await page.getByRole("combobox", { name: copy.ifaceForm.port }).click();
  await page.getByRole("option", { name: new RegExp(`^${port} `) }).click();
  const dhcp = page
    .getByRole("group", { name: copy.ifaceForm.ipv4.label })
    .getByRole("radio", { name: copy.ifaceForm.ipv4.dhcp });
  if (!(await dhcp.isChecked())) {
    await dhcp.click();
  }
  // Another interface than this page's: Not affected (VM fact 22 #2).
  await expect(page.getByText("This page keeps working.")).toBeVisible();
  await page
    .getByRole("button", { name: copy.ifaceForm.save, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.interfaces.title }),
  ).toBeVisible(SLOW);
}

/** Remove an interface's settings from its page, through the destructive confirmation. */
async function removeSettings(page: Page, name: string) {
  await page.goto(`/ui/network/interfaces/${name}`);
  const section = page.getByRole("region", { name: copy.ifaceDelete.section });
  await section.getByRole("button", { name: copy.ifaceDelete.open }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading")).toHaveText(
    sentence(copy.ifaceDelete.title),
  );
  await dialog
    .getByRole("button", { name: copy.ifaceDelete.confirm, exact: true })
    .click();
  await expect(
    page.getByText(sentence(copy.ifaceDelete.done)).first(),
  ).toBeVisible(SLOW);
}

/** The port's IPv4 cell shows an address in use (a DHCP lease can take a moment: Refresh). */
async function expectAddress(page: Page, name: string) {
  const ipv4 = rowOf(page, name).getByRole("cell").nth(2);
  await expect(async () => {
    await page.getByRole("button", { name: copy.interfaces.refresh }).click();
    await expect(ipv4).toContainText(/\d+\.\d+\.\d+\.\d+\/\d+/, {
      timeout: 5_000,
    });
  }).toPass(SLOW);
}

// ---- Firewall ------------------------------------------------------------------------------------------

const rulesTable = (page: Page) =>
  page.getByRole("table", { name: copy.firewall.title });

async function openFirewall(page: Page) {
  await page.goto("/ui/network/firewall");
  await expect(
    page.getByRole("heading", { level: 1, name: copy.firewall.title }),
  ).toBeVisible();
  await expect(
    rulesTable(page).or(page.getByText(copy.firewall.none)),
  ).toBeVisible(SLOW);
}

/** The port list's entry for `port`, or "Another port or range…" with the port typed. */
async function choosePort(page: Page, dialog: Locator, port: number) {
  await dialog.getByRole("combobox", { name: copy.fwRule.port }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const known = page.getByRole("option", {
    name: new RegExp(`^${String(port)} \\(`),
  });
  if ((await known.count()) > 0) {
    await known.click();
    return;
  }
  await page.getByRole("option", { name: copy.fwRule.otherPort }).click();
  await dialog
    .getByRole("textbox", { name: copy.fwRule.portField })
    .fill(String(port));
}

/** Add "Allow TCP to `port` from any computer", at the top or at the end, saved to the band. */
async function allowPort(page: Page, port: number, atTop: boolean) {
  await page.getByRole("button", { name: copy.firewall.add }).first().click();
  const dialog = page.getByRole("dialog", { name: copy.fwRule.titleNew });
  await dialog
    .getByRole("radio", { name: copy.firewall.action.accept })
    .click();
  await choosePort(page, dialog, port);
  if (atTop) {
    await dialog
      .getByRole("combobox", { name: copy.fwRule.where.label })
      .click();
    await page.getByRole("option", { name: copy.fwRule.where.top }).click();
  }
  await dialog.getByRole("button", { name: copy.fwRule.add }).click();
  await expect(page.getByText(copy.fwRule.saved).first()).toBeVisible(SLOW);
  await expect(dialog).toHaveCount(0);
}

/**
 * The change flow for a firewall change: other pending changes applied first when it asks (R1), then
 * firewall typed, saved and applied, and the new rules kept.
 */
async function throughFirewallFlow(page: Page) {
  const others = page.getByRole("button", { name: copy.netChange.applyOthers });
  const typed = page.getByRole("textbox", {
    name: copy.netChange.typeFirewall,
  });
  await expect(others.or(typed)).toBeVisible(SLOW);
  if (await others.isVisible()) {
    await others.click();
  }
  await typed.fill("firewall", APPLY);
  await page.getByRole("button", { name: copy.netChange.confirm }).click();
  await page.getByRole("button", { name: copy.netChange.keep }).click(APPLY);
}

/** The number of IPv4 rules, once the list (or its empty state) is shown. */
async function ruleCount(page: Page): Promise<number> {
  await expect(
    rulesTable(page).or(page.getByText(copy.firewall.none)),
  ).toBeVisible(SLOW);
  return (await rulesTable(page).isVisible())
    ? (await rulesTable(page).getByRole("row").count()) - 1
    : 0;
}

/** Delete rule `n`, the last; through the review when the page says it needs one. */
async function deleteRule(page: Page, n: number) {
  await page.getByRole("button", { name: `Delete rule ${String(n)}` }).click();
  const dialog = page.getByRole("alertdialog", {
    name: `Delete rule ${String(n)}?`,
  });
  const remove = dialog.getByRole("button", {
    name: "Delete rule",
    exact: true,
  });
  const review = dialog.getByRole("button", { name: copy.netChange.review });
  await expect(remove.or(review)).toBeVisible(SLOW);
  if (await review.isVisible()) {
    await review.click();
    await throughFirewallFlow(page);
    return;
  }
  await expect(remove).not.toHaveAttribute("aria-disabled", "true");
  await remove.click();
  await expect(page.getByText(/^Rule \d+ is deleted\./).first()).toBeVisible(
    SLOW,
  );
}

/** Delete every rule of the IPv4 list from the bottom, then apply what went to the band. */
async function deleteEveryRule(page: Page) {
  await openFirewall(page);
  for (let n = await ruleCount(page); n > 0; n = await ruleCount(page)) {
    await deleteRule(page, n);
    await expect.poll(() => ruleCount(page), SLOW).toBeLessThan(n);
  }
  if (await band(page).isVisible()) {
    await applyPending(page);
  }
}

// ---- Proxy ---------------------------------------------------------------------------------------------

const proxyCard = (page: Page, kind: string) =>
  page
    .locator("[data-proxy]")
    .filter({ has: page.getByRole("heading", { name: kind }) });

async function openProxy(page: Page) {
  await page.goto("/ui/network/proxy");
  await expect(
    proxyCard(page, copy.proxy.http).getByRole("checkbox"),
  ).toBeVisible(SLOW);
}

// ---- What the VM had -----------------------------------------------------------------------------------

interface Before {
  hostname: string;
  domainname: string;
  /** The proxy as read, passwords dropped. */
  proxy: unknown;
}

let before: Before | null = null;

/** Read the VM's state through the pages; refuse when it is not the state this test starts from. */
async function readPreconditions(page: Page): Promise<Before> {
  const seen = watch(page);
  await openInterfaces(page);
  await expect(connectionLine(page)).toHaveText(
    sentence(copy.network.connection.known),
    SLOW,
  );
  await expect(
    connectionLine(page).getByText(PAGE_PORT, { exact: true }),
  ).toBeVisible();
  const info = await reply(seen, "System.getInformation");
  expect(pendingModules(info), "nothing is pending").toEqual([]);
  const devices = devicenames(
    await reply(seen, "Network.enumerateDevicesList"),
  );
  expect(devices, "the VM has both extra ports").toEqual(
    expect.arrayContaining([PAGE_PORT, PORT, OTHER_PORT]),
  );
  const stored = devicenames(await reply(seen, "Network.getInterfaceList"));
  expect(
    stored.filter((name) => OURS.includes(name) || /^(bond|br)\d+$/.test(name)),
    "no settings for the extra ports, and no bond, VLAN or bridge of this test",
  ).toEqual([]);

  await openFirewall(page);
  const rules4 = await reply(seen, "Iptables.getRules");
  // The IPv6 list is read when its tab is opened.
  await page.getByRole("button", { name: copy.firewall.tab.ipv6 }).click();
  const rules6 = await reply(seen, "Iptables.getRules6");
  expect(rows(rules4).length + rows(rules6).length, "no firewall rule").toBe(0);

  await openProxy(page);
  const proxy = await reply(seen, "Network.getProxy");
  for (const kind of ["http", "https", "ftp"]) {
    expect(
      field(proxy, `${kind}enable`) === false &&
        field(proxy, `${kind}host`) === "",
      `the ${kind} proxy is off and empty`,
    ).toBe(true);
  }

  await page.goto("/ui/network/general");
  const general = await reply(seen, "Network.getGeneralSettings");
  const hostname = field(general, "hostname");
  const domainname = field(general, "domainname");
  if (typeof hostname !== "string" || typeof domainname !== "string") {
    throw new Error("The name of the NAS could not be read.");
  }
  return { hostname, domainname, proxy };
}

/**
 * Put the VM back as it was, through the pages; each step is tried on its own so one failure does
 * not leave the rest undone. Returns the steps that failed, by name only.
 */
async function restore(page: Page, was: Before): Promise<string[]> {
  const failed: string[] = [];
  const step = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch {
      failed.push(name);
    }
  };
  const seen = watch(page);

  await step("undo what is pending", async () => {
    await page.goto("/ui/network/interfaces");
    await expect(rowOf(page, PAGE_PORT)).toBeVisible(SLOW);
    if (!(await band(page).isVisible())) {
      return;
    }
    const undo = band(page).getByRole("button", {
      name: /^Undo \d+ changes?$/,
    });
    const label = ((await undo.textContent()) ?? "").trim();
    await undo.click();
    await page
      .getByRole("alertdialog", { name: `${label}?` })
      .getByRole("button", { name: label })
      .click();
    // A removal this page did not see: 10.4's line offers the forced apply; one it saw runs it.
    const queued = page.getByRole("button", {
      name: copy.netApply.applyQueued,
    });
    await expect(async () => {
      if (await queued.isVisible()) {
        await queued.click();
      }
      await expect(band(page)).toHaveCount(0, { timeout: 5_000 });
    }).toPass(APPLY);
  });

  await step("remove the interfaces of this test", async () => {
    await page.goto("/ui/network/interfaces");
    await expect(rowOf(page, PAGE_PORT)).toBeVisible(SLOW);
    const stored = devicenames(await reply(seen, "Network.getInterfaceList"));
    // VLANs first, then the bond, then the ports.
    for (const name of [
      VLAN,
      `${OTHER_PORT}.${VLAN_ID}`,
      BOND,
      PORT,
      OTHER_PORT,
    ]) {
      if (stored.includes(name)) {
        await removeSettings(page, name);
      }
    }
    if (await band(page).isVisible()) {
      await applyPending(page);
    }
  });

  await step("delete the firewall rules", () => deleteEveryRule(page));

  await step("turn the proxy off", async () => {
    await openProxy(page);
    const proxy = await reply(seen, "Network.getProxy");
    const kinds = [
      ["http", copy.proxy.http],
      ["https", copy.proxy.https],
      ["ftp", copy.proxy.ftp],
    ] as const;
    let changed = false;
    for (const [kind, title] of kinds) {
      const card = proxyCard(page, title);
      const remove = card.getByRole("radio", { name: copy.proxy.remove });
      if (await remove.isVisible()) {
        await remove.click();
        changed = true;
      }
      const use = card.getByRole("checkbox");
      const wasHost = field(was.proxy, `${kind}host`);
      if (field(proxy, `${kind}host`) !== wasHost) {
        if (!(await use.isChecked())) {
          await use.click();
        }
        await card
          .getByRole("textbox", { name: copy.proxy.host })
          .fill(String(wasHost));
        await card
          .getByRole("textbox", { name: copy.proxy.user })
          .fill(String(field(was.proxy, `${kind}username`)));
        await card
          .getByRole("textbox", { name: copy.proxy.port })
          .fill(String(field(was.proxy, `${kind}port`)));
        changed = true;
      }
      if (await use.isChecked()) {
        await use.click();
        changed = true;
      }
    }
    if (changed) {
      await page
        .getByRole("button", { name: copy.proxy.save, exact: true })
        .click();
      await expect(page.getByText(copy.proxy.saved).first()).toBeVisible(SLOW);
      await applyPending(page);
    }
  });

  await step("give the NAS its name back", async () => {
    await page.goto("/ui/network/general");
    const general = await reply(seen, "Network.getGeneralSettings");
    if (field(general, "hostname") === was.hostname) {
      return;
    }
    await page
      .getByRole("textbox", { name: copy.netGeneral.name, exact: true })
      .fill(was.hostname);
    await page
      .getByRole("button", { name: copy.netGeneral.save, exact: true })
      .click();
    await applyPending(page);
  });

  await step("apply what is left", async () => {
    await page.goto("/ui/network/interfaces");
    await expect(rowOf(page, PAGE_PORT)).toBeVisible(SLOW);
    if (await band(page).isVisible()) {
      await applyPending(page);
    }
  });
  return failed;
}

// ---- The journeys --------------------------------------------------------------------------------------

test.describe.serial("network on the VM", () => {
  test.beforeAll(async ({ browser, vm }) => {
    test.setTimeout(120_000);
    const { page, close } = await openPage(browser, vm);
    try {
      await signIn(page, vm.admin);
      before = await readPreconditions(page);
    } finally {
      await close();
    }
  });

  test.afterAll(async ({ browser, vm }) => {
    // Only when the start was checked: a refused start changes nothing, and cleans nothing.
    if (before === null) {
      return;
    }
    test.setTimeout(900_000);
    const { page, close } = await openPage(browser, vm);
    try {
      await signIn(page, vm.admin);
      const failed = await restore(page, before);
      expect(failed, "the VM is back as it was").toEqual([]);
    } finally {
      await close();
    }
  });

  test("shows enp2s0 as this page's port, Known, and the NAS's name", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    await openInterfaces(page);
    await expect(rowOf(page, PAGE_PORT)).toContainText(
      copy.interfaces.thisPage,
    );
    await expect(connectionLine(page)).toHaveText(
      sentence(copy.network.connection.known),
    );
    await expect(rowOf(page, PORT)).toContainText(copy.interfaces.how.notSetUp);

    await page.goto("/ui/network/general");
    const name = page.getByRole("textbox", {
      name: copy.netGeneral.name,
      exact: true,
    });
    await expect(name).not.toHaveValue("", SLOW);
    const general = await reply(seen, "Network.getGeneralSettings");
    expect(
      (await name.inputValue()) === field(general, "hostname"),
      "the field shows the stored name",
    ).toBe(true);
    // Read only: nothing was written.
    expect(
      seen.calls.filter((c) => /\.(set|delete|apply|revert)/.test(c)),
    ).toEqual([]);
  });

  test("sets up enp3s0 with DHCP, changes its packet size, adds and removes a VLAN, blinks it, removes its settings", async ({
    page,
    vm,
  }) => {
    test.setTimeout(900_000);
    const seen = watch(page);
    await signIn(page, vm.admin);

    // Set up with DHCP: after apply, its row shows the address the router gave.
    await setUpPort(page, PORT);
    await applyPending(page);
    await openInterfaces(page);
    await expect(rowOf(page, PORT)).toContainText(copy.interfaces.how.dhcp);
    await expectAddress(page, PORT);

    // The packet size.
    await page.goto(`/ui/network/interfaces/${PORT}`);
    await page
      .getByRole("region", { name: copy.iface.settings, exact: true })
      .getByRole("button", { name: copy.iface.change })
      .click();
    await page.getByRole("button", { name: copy.ifaceForm.advanced }).click();
    await page.getByRole("radio", { name: copy.ifaceForm.mtu.other }).click();
    await page
      .getByRole("textbox", { name: new RegExp(`^${copy.ifaceForm.mtu.size}`) })
      .fill(MTU);
    await page
      .getByRole("button", { name: copy.ifaceForm.save, exact: true })
      .click();
    await expect(
      page.getByText(sentence(copy.ifaceForm.saved)).first(),
    ).toBeVisible(SLOW);
    await applyPending(page);
    await page.goto(`/ui/network/interfaces/${PORT}`);
    await expect(
      page.getByRole("region", { name: copy.iface.now }),
    ).toContainText(`${MTU} bytes`, SLOW);

    // A VLAN on it: another interface than this page's, so not affected.
    await page.goto("/ui/network/interfaces/add/vlan");
    await page.getByRole("combobox", { name: "Runs on" }).click();
    await page.getByRole("option", { name: new RegExp(`^${PORT}\\b`) }).click();
    await page.getByRole("textbox", { name: "VLAN ID" }).fill(VLAN_ID);
    await expect(page.getByText(/^The NAS names it/)).toHaveText(
      sentence(`The NAS names it ${VLAN}.`),
    );
    await page
      .getByRole("group", { name: copy.ifaceForm.ipv4.label })
      .getByRole("radio", { name: copy.ifaceForm.ipv4.dhcp })
      .click();
    await expect(page.getByText("This page keeps working.")).toBeVisible();
    await page
      .getByRole("button", { name: copy.ifaceForm.save, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: copy.interfaces.title }),
    ).toBeVisible(SLOW);
    expect(seen.calls).toContain("Network.setVlanIface");
    await applyPending(page);
    await openInterfaces(page);
    await expect(rowOf(page, VLAN)).toBeVisible(SLOW);
    await removeSettings(page, VLAN);
    await applyPending(page);
    await openInterfaces(page);
    await expect(
      table(page).getByRole("link", { name: VLAN, exact: true }),
    ).toHaveCount(0, SLOW);

    // Blink its light for 5 seconds.
    await page.goto(`/ui/network/interfaces/${PORT}`);
    await page.getByRole("button", { name: "Blink its light…" }).click();
    const blink = page.getByRole("dialog");
    await blink.getByRole("radio", { name: "5 seconds", exact: true }).click();
    await blink.getByRole("button", { name: "Blink", exact: true }).click();
    await expect(blink.getByText(/^Blinking for/)).toBeVisible(SLOW);
    await expect(blink.getByText("Done. Did you see the light?")).toBeVisible(
      SLOW,
    );
    await blink.getByRole("button", { name: "Close" }).click();
    expect(seen.calls).toContain("Network.identify");
    expect(await page.content()).not.toContain("/tmp/bgstatus");

    // Remove its settings: back to Not set up here.
    await removeSettings(page, PORT);
    await applyPending(page);
    await openInterfaces(page);
    await expect(rowOf(page, PORT)).toContainText(
      copy.interfaces.how.notSetUp,
      SLOW,
    );
  });

  test("makes a bond of enp3s0 and enp26s0, shows both ports, and removes it", async ({
    page,
    vm,
  }) => {
    test.setTimeout(600_000);
    const seen = watch(page);
    await signIn(page, vm.admin);
    await page.goto("/ui/network/interfaces/add/bond");
    const ports = page.getByRole("group", { name: "Ports in the bond" });
    await expect(
      ports.getByRole("checkbox", { name: new RegExp(`^${PAGE_PORT}\\b`) }),
    ).toHaveAttribute("aria-disabled", "true", SLOW);
    await ports
      .getByRole("checkbox", { name: new RegExp(`^${PORT}\\b`) })
      .click();
    await ports
      .getByRole("checkbox", { name: new RegExp(`^${OTHER_PORT}\\b`) })
      .click();
    await expect(page.getByText(/^The NAS names it/)).toHaveText(
      sentence(`The NAS names it ${BOND}.`),
    );
    await page
      .getByRole("radio", {
        name: new RegExp(`^${copy.iface.set.mode.backup}`),
      })
      .click();
    await page.getByRole("combobox", { name: "Main port" }).click();
    await page.getByRole("option", { name: new RegExp(`^${PORT}$`) }).click();
    await page
      .getByRole("button", { name: copy.ifaceForm.save, exact: true })
      .click();
    await expect(
      page
        .getByText(
          "The bond is saved. It takes effect when you apply the changes.",
        )
        .first(),
    ).toBeVisible(SLOW);
    expect(seen.calls).toContain("Network.setBondIface");
    await applyPending(page);

    await page.goto(`/ui/network/interfaces/${BOND}`);
    const now = page.getByRole("region", { name: copy.iface.now });
    await expect(
      now.getByRole("link", { name: PORT, exact: true }),
    ).toBeVisible(SLOW);
    await expect(
      now.getByRole("link", { name: OTHER_PORT, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: copy.iface.settings, exact: true }),
    ).toContainText(copy.iface.set.mode.backup);

    await removeSettings(page, BOND);
    await expect(
      page.getByRole("heading", { level: 1, name: copy.interfaces.title }),
    ).toBeVisible(SLOW);
    await applyPending(page);
    await openInterfaces(page);
    await expect(
      table(page).getByRole("link", { name: BOND, exact: true }),
    ).toHaveCount(0, SLOW);
    await expect(rowOf(page, PORT)).toContainText(copy.interfaces.how.notSetUp);
    await expect(rowOf(page, OTHER_PORT)).toContainText(
      copy.interfaces.how.notSetUp,
    );
  });

  test("undoes the removal of enp3s0's settings from the band: 10.4's line and the forced apply", async ({
    page,
    vm,
  }) => {
    test.setTimeout(600_000);
    const seen = watch(page);
    await signIn(page, vm.admin);
    await setUpPort(page, PORT);
    await applyPending(page);

    await removeSettings(page, PORT);
    await expect(band(page)).toBeVisible(SLOW);
    const undo = band(page).getByRole("button", {
      name: /^Undo \d+ changes?$/,
    });
    const label = ((await undo.textContent()) ?? "").trim();
    await undo.click();
    const dialog = page.getByRole("alertdialog", { name: `${label}?` });
    await expect(dialog).toContainText(/The NAS also queued a job to switch/);
    const applies = seen.applies.length;
    await dialog.getByRole("button", { name: label }).click();
    // The queued jobs and the network are applied at once, forced (10.4).
    await expect
      .poll(() => seen.applies.length, { timeout: 60_000 })
      .toBeGreaterThan(applies);
    expect(seen.applies.at(-1)).toEqual({
      modules: ["task", "systemd-networkd"],
      force: true,
    });
    expect(seen.calls.lastIndexOf("Config.revertChangesBg")).toBeLessThan(
      seen.calls.lastIndexOf("Config.applyChangesBg"),
    );
    await expect(band(page)).toHaveCount(0, APPLY);
    await openInterfaces(page);
    await expect(rowOf(page, PORT)).toContainText(
      copy.interfaces.how.dhcp,
      SLOW,
    );

    // Then removed for good.
    await removeSettings(page, PORT);
    await applyPending(page);
    await openInterfaces(page);
    await expect(rowOf(page, PORT)).toContainText(
      copy.interfaces.how.notSetUp,
      SLOW,
    );
  });

  test("adds firewall rules, blocks everything else, still loads, and deletes every rule", async ({
    page,
    vm,
  }) => {
    test.setTimeout(900_000);
    const seen = watch(page);
    await signIn(page, vm.admin);
    await openFirewall(page);
    await expect(page.getByText(copy.firewall.none)).toBeVisible();

    const pagePort = vm.origin.startsWith("https:") ? 443 : 80;
    const otherWebPort = pagePort === 443 ? 80 : 443;
    await allowPort(page, 22, false);
    await allowPort(page, otherWebPort, true);
    await allowPort(page, pagePort, true);
    await expect(rulesTable(page).getByRole("row")).toHaveCount(4, SLOW);
    await expect(rulesTable(page).getByRole("row").nth(1)).toContainText(
      String(pagePort),
    );
    await expect(page.getByText(copy.firewall.pageLetIn)).toBeVisible();

    await page.getByRole("button", { name: copy.firewall.blockRest }).click();
    const block = page.getByRole("alertdialog", {
      name: "Block everything else coming in",
    });
    const add = block.getByRole("button", { name: "Add the three rules" });
    const review = block.getByRole("button", { name: copy.netChange.review });
    await expect(add.or(review)).toBeVisible(SLOW);
    if (await review.isVisible()) {
      await review.click();
      await throughFirewallFlow(page);
    } else {
      await add.click();
      await expect(rulesTable(page).getByRole("row")).toHaveCount(7, SLOW);
      await applyPending(page);
    }
    expect(seen.calls).toContain("Config.applyChangesBg");

    // The page still loads and reads, under the rules.
    await page.reload();
    await openFirewall(page);
    await expect(rulesTable(page).getByRole("row")).toHaveCount(7, SLOW);
    await expect(page.getByText(copy.firewall.pageLetIn)).toBeVisible();

    await deleteEveryRule(page);
    await page.reload();
    await openFirewall(page);
    await expect(page.getByText(copy.firewall.none)).toBeVisible(SLOW);
    const rules = await reply(seen, "Iptables.getRules");
    expect(rows(rules)).toHaveLength(0);
  });

  test("sets a web proxy with a password, shows it as set, then turns it off with the password removed", async ({
    page,
    vm,
  }) => {
    test.setTimeout(600_000);
    const password = `pw-${randomBytes(12).toString("base64url")}`;
    const seen = watch(page);
    await signIn(page, vm.admin);
    await openProxy(page);
    let http = proxyCard(page, copy.proxy.http);
    await http.getByRole("checkbox").click();
    await http.getByRole("textbox", { name: copy.proxy.host }).fill(PROXY_HOST);
    await http.getByRole("textbox", { name: copy.proxy.port }).fill(PROXY_PORT);
    await http.getByRole("textbox", { name: copy.proxy.user }).fill(PROXY_USER);
    await http.locator('input[type="password"]').fill(password);
    await page
      .getByRole("button", { name: copy.proxy.save, exact: true })
      .click();
    await expect(page.getByText(copy.proxy.saved).first()).toBeVisible(SLOW);
    expect(await page.content()).not.toContain(password);
    await applyPending(page);

    await openProxy(page);
    http = proxyCard(page, copy.proxy.http);
    await expect(http.getByText(copy.proxy.passwordSet)).toBeVisible(SLOW);
    await expect(http.getByRole("checkbox")).toBeChecked();
    await expect(
      http.getByRole("textbox", { name: copy.proxy.host }),
    ).toHaveValue(PROXY_HOST);
    expect(await page.content()).not.toContain(password);

    // Off: the stored password removed, the address and user cleared, the port as it was.
    await http.getByRole("radio", { name: copy.proxy.remove }).click();
    await http.getByRole("textbox", { name: copy.proxy.host }).fill("");
    await http.getByRole("textbox", { name: copy.proxy.user }).fill("");
    await http
      .getByRole("textbox", { name: copy.proxy.port })
      .fill(String(field(before?.proxy, "httpport") ?? PROXY_PORT));
    await http.getByRole("checkbox").click();
    await page
      .getByRole("button", { name: copy.proxy.save, exact: true })
      .click();
    await expect(page.getByText(copy.proxy.saved).first()).toBeVisible(SLOW);
    await applyPending(page);

    await openProxy(page);
    http = proxyCard(page, copy.proxy.http);
    await expect(http.getByRole("checkbox")).not.toBeChecked(SLOW);
    await expect(
      http.getByRole("textbox", { name: copy.proxy.host }),
    ).toHaveValue("");
    await expect(http.getByText(copy.proxy.passwordSet)).toHaveCount(0);
    const proxy = await reply(seen, "Network.getProxy");
    expect(field(proxy, "httpenable")).toBe(false);
    expect(field(proxy, "httphost")).toBe("");
  });

  test("changes the NAS's name, shows it in the top bar once applied, and changes it back", async ({
    page,
    vm,
  }) => {
    test.setTimeout(600_000);
    // Opened by address, a new name does not move this page (0.5); opened by name it would.
    test.skip(
      !/^[0-9.]+(:\d+)?$/.test(new URL(vm.origin).host),
      "The VM is opened by name: a new name would move this page.",
    );
    if (before === null) {
      throw new Error("The start was not checked.");
    }
    const was = before;
    await signIn(page, vm.admin);
    await page.goto("/ui/network/general");
    const name = page.getByRole("textbox", {
      name: copy.netGeneral.name,
      exact: true,
    });
    await expect(name).not.toHaveValue("", SLOW);
    await name.fill(TEST_NAME);
    await page
      .getByRole("button", { name: copy.netGeneral.save, exact: true })
      .click();
    await expect(
      page
        .getByText(
          "The new name is saved. It takes effect when you apply the changes.",
        )
        .first(),
    ).toBeVisible(SLOW);
    await applyPending(page);
    await expect(page.getByRole("banner")).toContainText(TEST_NAME, SLOW);

    await page.goto("/ui/network/general");
    await expect(name).toHaveValue(TEST_NAME, SLOW);
    await name.fill(was.hostname);
    await page
      .getByRole("button", { name: copy.netGeneral.save, exact: true })
      .click();
    await applyPending(page);
    await expect(page.getByRole("banner")).not.toContainText(TEST_NAME, SLOW);
    expect((await name.inputValue()) === was.hostname, "the name is back").toBe(
      true,
    );
  });

  // Design 18.2 #5: this page's own port changed through the change flow, through the second adapter,
  // with the hypervisor's console ready, ending with a revert to the snapshot. The coordinator runs it
  // by hand, last; it never runs in this file's ordinary run.
  test("moves this page's own port through the change flow (by hand, design 18.2 #5)", () => {
    test.skip(
      process.env.OMV_WEBUI_VM_NETWORK_MOVE !== "yes",
      "Changes enp2s0, which carries this page and SSH: run by hand, last (design 18.2 #5).",
    );
    test.skip(
      true,
      "Not automated: follow design 18.2 #5 at the console, then revert the VM to its snapshot.",
    );
  });
});
