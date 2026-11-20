// SPDX-License-Identifier: GPL-3.0-or-later
// Phase 2 acceptance on the test VM (docs/07): sign in, see the shell, sign out, against the real
// backend, for an administrator and a normal user, with and without a second factor; keyboard-only
// sign-in and shell for the administrator; the headers nginx sends under /ui/, whose policy enforces
// Trusted Types (UI-1). Any CSP or Trusted Types report, console error, page error or request to
// another origin fails a test (support/vmFixtures.ts).
//
// Account names, the host name, passwords and codes come from the env file and are never printed:
// a comparison with one of them is made in the test and reported as true or false.
import type { Locator, Page } from "@playwright/test";
import copy from "../../src/locales/en/common.json" with { type: "json" };
import { breakThePolicy, CANARY_VIOLATIONS } from "../support/observer.ts";
import { readSnippet } from "../support/snippetServer.ts";
import { freshTotp } from "./support/totp.ts";
import { expect, target, test, type RpcLog } from "./support/vmFixtures.ts";
import type { Account, TwoFactorAccount } from "./support/vmTarget.ts";

test.skip(
  target === null,
  "No VM env file ($OMV_WEBUI_ENV); the VM suite is skipped.",
);

type Role = "admin" | "user";

const ACCOUNT = new RegExp(`^${copy.user.menu.split("{{name}}")[0] ?? ""}`);
const ADMIN_GROUPS = Object.values(copy.nav.groups);
const USER_GROUPS = [copy.nav.groups.account];
const SSH = copy.nav.items.services.ssh;
// A page only the classic interface has (SSH is built here since Phase 3).
const NFS = copy.nav.items.services.nfs;

const navigation = (page: Page) =>
  page.getByRole("navigation", { name: copy.app.navigation });
const dashboard = (page: Page) =>
  page.getByRole("heading", { name: copy.dashboard.title });
const userMenuButton = (page: Page) =>
  page.getByRole("button", { name: ACCOUNT });
const tasksButton = (page: Page) =>
  page.getByRole("button", { name: new RegExp(`^${copy.tasks.menu}`) });

/** A string field of a reply, or a failure that names the field (never its value). */
function stringField(reply: unknown, key: string): string {
  const value: unknown =
    typeof reply === "object" && reply !== null
      ? Reflect.get(reply, key)
      : undefined;
  if (typeof value !== "string" || value === "") {
    throw new Error(`The reply has no ${key}.`);
  }
  return value;
}

/** Wait until `locator`'s text contains `secret`, failing with `message` and never the value. */
async function expectTextContains(
  locator: Locator,
  secret: string,
  message: string,
) {
  await expect
    .poll(async () => ((await locator.textContent()) ?? "").includes(secret), {
      message,
    })
    .toBe(true);
}

async function signIn(page: Page, account: Account) {
  await page.getByLabel(copy.signIn.username).fill(account.username);
  await page.getByLabel(copy.signIn.password).fill(account.password);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
}

async function signOut(page: Page, rpcLog: RpcLog) {
  await userMenuButton(page).click();
  await page.getByRole("menuitem", { name: copy.user.signOut }).click();
  await expect(page.getByLabel(copy.signIn.username)).toBeVisible();
  expect(rpcLog.calls).toContain("Session.logout");
}

/** The shell for `role`: the top bar with the server's host name, and the menu for that role. */
async function expectShell(page: Page, rpcLog: RpcLog, role: Role) {
  await expect(dashboard(page)).toBeVisible();
  const hostname = stringField(
    await rpcLog.reply("System.getInformation"),
    "hostname",
  );
  await expectTextContains(
    page.getByRole("banner"),
    hostname,
    "the top bar shows the server's host name",
  );

  const nav = navigation(page);
  await expect(
    nav.getByRole("link", { name: copy.nav.dashboard }),
  ).toBeVisible();
  const groups = role === "admin" ? ADMIN_GROUPS : USER_GROUPS;
  await expect(nav.getByRole("group")).toHaveCount(groups.length);
  for (const name of groups) {
    await expect(nav.getByRole("group", { name })).toBeVisible();
  }
  await expect(
    nav.getByRole("link", { name: new RegExp(`^${copy.nav.addOns}`) }),
  ).toHaveCount(role === "admin" ? 1 : 0);
}

/** The user menu names the account that signed in (UserMgmt.getUserByContext). */
async function expectUserMenuNames(page: Page, username: string) {
  const trigger = userMenuButton(page);
  await expect
    .poll(
      async () =>
        (await trigger.getAttribute("aria-label")) ===
        copy.user.menu.replace("{{name}}", username),
      { message: "the user menu's button names the signed-in account" },
    )
    .toBe(true);
  await trigger.click();
  await expectTextContains(
    page.getByRole("menu"),
    copy.user.signedInAs.replace("{{name}}", username),
    "the user menu says who is signed in",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
}

/** A page only the classic interface has: a fixed link out, and no call but the background poll. */
async function openClassicOnlyPage(page: Page, rpcLog: RpcLog) {
  const before = rpcLog.calls.length;
  await navigation(page)
    .getByRole("link", { name: new RegExp(`^${NFS}`) })
    .click();
  await expectClassicOnlyPage(page);
  expect(
    rpcLog.calls.slice(before).filter((c) => c !== "System.getInformation"),
  ).toEqual([]);
}

async function expectClassicOnlyPage(page: Page) {
  await expect(page.getByRole("heading", { name: NFS })).toBeFocused();
  // The classic interface routes by hash: its pages are at /#/<group>/<item>.
  await expect(
    page.getByRole("link", {
      name: `${copy.classicOnly.link.replace("{{page}}", NFS)} ${copy.app.newTab}`,
    }),
  ).toHaveAttribute("href", "/#/services/nfs");
}

/** Sign in with a second factor; nothing may be called between login and verify (A10). */
async function signInWithCode(
  page: Page,
  rpcLog: RpcLog,
  account: TwoFactorAccount,
) {
  await signIn(page, account);
  const code = page.getByLabel(copy.totp.code);
  await expect(code).toBeVisible();
  await expect(code).toBeFocused();
  await code.fill(freshTotp(account.totpSecret));
  await page.getByRole("button", { name: copy.totp.submit }).click();
  await expect(dashboard(page)).toBeVisible();
  expect(rpcLog.between("Session.login", "Session.verify")).toEqual([]);
}

/** Where keyboard focus is, by the part of the shell that holds it. */
type Region = "skip" | "top" | "other" | "nav" | "main" | "none";
const REGION_ORDER: readonly Region[] = ["skip", "top", "other", "nav", "main"];

function focusedRegion(page: Page): Promise<Region> {
  return page.evaluate((): Region => {
    const element = document.activeElement;
    if (element === null || element === document.body) {
      return "none";
    }
    if (element.matches('[data-slot="skip-link"]')) {
      return "skip";
    }
    if (element.closest("header")) {
      return "top";
    }
    if (element.closest("nav")) {
      return "nav";
    }
    if (element.closest("main")) {
      return "main";
    }
    return "other";
  });
}

/** Press `key` until `locator` has focus; fails after `limit` presses. */
async function pressUntilFocused(
  page: Page,
  key: string,
  locator: Locator,
  limit = 80,
) {
  for (let i = 0; i < limit; i += 1) {
    if (await locator.evaluate((el) => el === document.activeElement)) {
      return;
    }
    await page.keyboard.press(key);
  }
  await expect(locator).toBeFocused();
}

test.describe("an administrator without a second factor", () => {
  test("signs in, uses the shell and signs out with the keyboard only", async ({
    page,
    rpcLog,
    vm,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/ui/");

    // Sign-in: the form starts on the user name; Tab to the password; Enter submits.
    const username = page.getByLabel(copy.signIn.username);
    await expect(username).toBeFocused();
    await page.keyboard.type(vm.admin.username);
    await page.keyboard.press("Tab");
    await expect(page.getByLabel(copy.signIn.password)).toBeFocused();
    await page.keyboard.type(vm.admin.password);
    await page.keyboard.press("Enter");
    await expectShell(page, rpcLog, "admin");

    // A fresh load of the shell: the skip link is the first stop, and shows when focused.
    await page.reload();
    await expect(dashboard(page)).toBeVisible();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: copy.app.skipToMain });
    await expect(skip).toBeFocused();
    expect((await skip.boundingBox())?.width ?? 0).toBeGreaterThan(20);

    // Tab order: skip link, top bar, notices, navigation, content; then out of the page and round
    // again (no focus trap).
    const regions: Region[] = [];
    let wrapped = false;
    for (let i = 0; i < 150 && !wrapped; i += 1) {
      await page.keyboard.press("Tab");
      const region = await focusedRegion(page);
      if (region === "skip" || region === "none") {
        wrapped = true;
      } else if (regions.at(-1) !== region) {
        regions.push(region);
      }
    }
    test.info().annotations.push({
      type: "focus order",
      description: regions.join(" > "),
    });
    expect(wrapped, "Tab leaves the page and comes round again").toBe(true);
    expect(regions).toContain("top");
    expect(regions).toContain("nav");
    expect(
      regions.map((r) => REGION_ORDER.indexOf(r)),
      `focus order ${regions.join(" > ")}`,
    ).toEqual(
      [...regions.map((r) => REGION_ORDER.indexOf(r))].sort((a, b) => a - b),
    );

    // The skip link moves focus to the content.
    await pressUntilFocused(page, "Tab", skip, 5);
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();

    // Back into the navigation, to a page only the classic interface has.
    const before = rpcLog.calls.length;
    await pressUntilFocused(
      page,
      "Shift+Tab",
      navigation(page).getByRole("link", { name: new RegExp(`^${NFS}`) }),
    );
    await page.keyboard.press("Enter");
    await expectClassicOnlyPage(page);
    expect(
      rpcLog.calls.slice(before).filter((c) => c !== "System.getInformation"),
    ).toEqual([]);

    // The tasks menu opens with Enter and closes with Escape, back on its button.
    const tasks = tasksButton(page);
    await pressUntilFocused(page, "Shift+Tab", tasks);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toContainText(copy.tasks.none);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(tasks).toBeFocused();

    // The user menu: it names the account, Escape closes it, and Sign out is reached by arrows.
    const user = userMenuButton(page);
    await pressUntilFocused(page, "Tab", user, 3);
    await page.keyboard.press("Enter");
    await expectTextContains(
      page.getByRole("menu"),
      copy.user.signedInAs.replace("{{name}}", vm.admin.username),
      "the user menu says who is signed in",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(user).toBeFocused();
    await page.keyboard.press("Enter");
    await pressUntilFocused(
      page,
      "ArrowDown",
      page.getByRole("menuitem", { name: copy.user.signOut }),
      15,
    );
    await page.keyboard.press("Enter");
    await expect(page.getByLabel(copy.signIn.username)).toBeVisible();
    expect(rpcLog.calls).toContain("Session.logout");
  });

  test("signs in and sees the shell, the menus and a classic-only page", async ({
    page,
    rpcLog,
    vm,
  }) => {
    await page.goto("/ui/");
    await signIn(page, vm.admin);
    await expectShell(page, rpcLog, "admin");
    await expectUserMenuNames(page, vm.admin.username);
    await tasksButton(page).click();
    await expect(page.getByRole("menu")).toContainText(copy.tasks.none);
    await page.keyboard.press("Escape");
    await openClassicOnlyPage(page, rpcLog);
    await signOut(page, rpcLog);
  });
});

test.describe("a normal user without a second factor", () => {
  test("signs in, sees the reduced menu, is kept off an administrator's page, signs out", async ({
    page,
    rpcLog,
    vm,
  }) => {
    await page.goto("/ui/");
    await signIn(page, vm.user);
    await expectShell(page, rpcLog, "user");
    await expectUserMenuNames(page, vm.user.username);

    // Typing an administrator's address: the app loads again and says the page is not for this
    // account; it makes no call beyond the load-time reads and the idle clock's settings.
    const before = rpcLog.calls.length;
    await page.goto("/ui/services/ssh");
    await expect(page.getByRole("heading", { name: SSH })).toBeVisible();
    await expect(page.getByText(copy.adminOnly.body)).toBeVisible();
    await expect(
      page.getByRole("link", { name: copy.adminOnly.home }),
    ).toBeVisible();
    expect(
      rpcLog.calls
        .slice(before)
        .filter(
          (c) =>
            c !== "System.getInformation" &&
            c !== "UserMgmt.getUserByContext" &&
            c !== "WebGui.getAutoLogoutSettings",
        ),
    ).toEqual([]);

    await signOut(page, rpcLog);
  });
});

test.describe("with a second factor", () => {
  test("the env file's two-factor account signs in with a code and out again", async ({
    page,
    rpcLog,
    vm,
  }) => {
    await page.goto("/ui/");
    await signInWithCode(page, rpcLog, vm.twoFactor);
    // Its role is the VM's business: the shell shows whichever menu the backend's answer implies.
    const information = await rpcLog.reply("System.getInformation");
    const role: Role =
      typeof information === "object" &&
      information !== null &&
      "dirtyModules" in information
        ? "admin"
        : "user";
    test.info().annotations.push({
      type: "two-factor account role",
      description: role,
    });
    await expectShell(page, rpcLog, role);
    await expectUserMenuNames(page, vm.twoFactor.username);
    await signOut(page, rpcLog);
  });

  test("an administrator signs in with a code, sees the shell and signs out", async ({
    page,
    rpcLog,
    vm,
  }) => {
    const account = vm.twoFactorAdmin;
    test.skip(
      account === null,
      "No administrator with a second factor (OMV_2FA_ADMIN_*) for this run.",
    );
    if (account === null) {
      return;
    }
    await page.goto("/ui/");
    await signInWithCode(page, rpcLog, account);
    await expectShell(page, rpcLog, "admin");
    await expectUserMenuNames(page, account.username);
    await openClassicOnlyPage(page, rpcLog);
    await signOut(page, rpcLog);
  });
});

test.describe("the idle warning", () => {
  test("appears before the session ends, and Stay signed in keeps it", async ({
    page,
    rpcLog,
    vm,
  }) => {
    test.setTimeout(6 * 60_000);
    await page.goto("/ui/");
    await signIn(page, vm.admin);
    await expect(dashboard(page)).toBeVisible();
    const signedInAt = Date.now();
    const settings = await rpcLog.reply("WebGui.getAutoLogoutSettings");
    const timeout: unknown =
      typeof settings === "object" && settings !== null
        ? Reflect.get(settings, "timeout")
        : undefined;
    test.skip(
      typeof timeout !== "number" || timeout < 1 || timeout > 2,
      "Runs only while the VM's session timeout is 1 or 2 minutes.",
    );
    if (typeof timeout !== "number") {
      return;
    }
    const timeoutMs = timeout * 60_000;

    // Nothing is done; the background poll for pending changes must not hold the warning off.
    const warning = page.getByRole("dialog", { name: copy.idle.title });
    await expect(warning).toBeVisible({ timeout: timeoutMs });
    const shownAfter = Date.now() - signedInAt;
    expect(
      shownAfter,
      "the warning opens before the session ends",
    ).toBeLessThan(timeoutMs - 10_000);
    await expect(
      warning.getByRole("button", { name: copy.idle.stay }),
    ).toBeFocused();

    await warning.getByRole("button", { name: copy.idle.stay }).click();
    await expect(warning).toHaveCount(0);

    // Past the moment the session would have ended without that answer, it still stands.
    await page.waitForTimeout(
      Math.max(0, signedInAt + timeoutMs + 10_000 - Date.now()),
    );
    await page.reload();
    await expect(dashboard(page)).toBeVisible();
    await expect(page.getByLabel(copy.signIn.username)).toHaveCount(0);
    await signOut(page, rpcLog);
  });
});

test.describe("the canary", () => {
  test("the observer reports a violation on the VM, so a clean run is evidence", async ({
    page,
    observed,
  }) => {
    await page.goto("/ui/");
    await expect(page.getByLabel(copy.signIn.username)).toBeVisible();
    await breakThePolicy(page);
    for (const expected of CANARY_VIOLATIONS) {
      await expect
        .poll(() => observed.violations)
        .toContainEqual(expect.stringMatching(expected));
    }
    observed.violations.length = 0;
    observed.consoleErrors.length = 0;
  });
});

test.describe("the headers under /ui/", () => {
  test("match the snippet for the app, a deep link, an asset and a missing asset", async ({
    request,
  }) => {
    const snippet = readSnippet();
    const home = await request.get("/ui/", { maxRedirects: 0 });
    const asset =
      /<script type="module"[^>]*src="(\/ui\/assets\/[^"]+\.js)"/.exec(
        await home.text(),
      )?.[1];
    expect(asset, "the page loads a module script from assets/").toBeDefined();
    const cases = [
      { path: "/ui/", status: 200, headers: snippet.app },
      { path: "/ui/index.html", status: 200, headers: snippet.app },
      { path: "/ui/storage/disks", status: 200, headers: snippet.app },
      { path: asset ?? "", status: 200, headers: snippet.assets },
      {
        path: "/ui/assets/missing-00000000.js",
        status: 404,
        headers: snippet.missing,
      },
    ];
    for (const { path, status, headers } of cases) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(status);
      const sent = response.headers();
      for (const h of headers) {
        expect(sent[h.name.toLowerCase()], `${path} ${h.name}`).toBe(h.value);
      }
      // One policy, ours: nothing of OMV's own server-level set leaks in.
      expect(
        response
          .headersArray()
          .filter((h) => h.name.toLowerCase() === "content-security-policy"),
        `${path} sends one policy`,
      ).toHaveLength(1);
      expect(
        sent["content-security-policy-report-only"],
        `${path} report-only`,
      ).toBeUndefined();
      expect(
        sent["x-xss-protection"],
        `${path} X-XSS-Protection`,
      ).toBeUndefined();
    }
    const redirect = await request.get("/ui", { maxRedirects: 0 });
    expect(redirect.status()).toBe(301);
    expect(redirect.headers().location).toBe("/ui/");
  });
});
