// SPDX-License-Identifier: GPL-3.0-or-later
// Sign in, see the shell, use its menus and the pending-changes band, sign out, under the snippet's
// headers (UI-1), which enforce Trusted Types. The page is found by what a person sees: the form's
// labels and the buttons' names, taken from the app's own English catalogue so a copy change does not
// break this.
// Any CSP violation, console error, page error or request to another origin fails a test
// (support/fixtures.ts).
import type { Page } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import copy from "../src/locales/en/common.json" with { type: "json" };
import { expect, test } from "./support/fixtures.ts";
import { breakThePolicy, CANARY_VIOLATIONS } from "./support/observer.ts";
import { DIST } from "./support/snippetServer.ts";

// Typed into the mock only; no real system is involved.
const PASSWORD = "not-a-real-password";

/** The user menu, whoever signed in: its name starts the same way for every account. */
const ACCOUNT = new RegExp(`^${copy.user.menu.split("{{name}}")[0] ?? ""}`);

async function signIn(page: Page, username: string) {
  await page.getByLabel(copy.signIn.username).fill(username);
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: ACCOUNT }).click();
  await page.getByRole("menuitem", { name: copy.user.signOut }).click();
}

test("signed out, an administrator signs in and out", async ({ page, rpc }) => {
  rpc.loginWith("authenticated");
  await page.goto("/ui/");

  await expect(page.getByLabel(copy.signIn.username)).toBeVisible();
  await page.getByLabel(copy.signIn.username).fill("example-admin");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();

  await expect(
    page.getByRole("heading", { name: copy.dashboard.title }),
  ).toBeVisible();
  await expect(page.getByLabel(copy.signIn.password)).toHaveCount(0);

  await signOut(page);
  await expect(page.getByLabel(copy.signIn.username)).toBeVisible();
  expect(rpc.calls).toContain("Session.login");
  expect(rpc.calls).toContain("Session.logout");
});

test("signed out, a user with a one-time code signs in and out", async ({
  page,
  rpc,
}) => {
  rpc.loginWith("challengeRequired");
  await page.goto("/ui/");

  await page.getByLabel(copy.signIn.username).fill("example-2fa");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();

  const code = page.getByLabel(copy.totp.code);
  await expect(code).toBeVisible();
  await code.fill("123456");
  await page.getByRole("button", { name: copy.totp.submit }).click();

  await expect(
    page.getByRole("heading", { name: copy.dashboard.title }),
  ).toBeVisible();
  await signOut(page);
  await expect(page.getByLabel(copy.signIn.username)).toBeVisible();

  // OMV drops a pending sign-in on any other call (A10): nothing between login and verify.
  const login = rpc.calls.indexOf("Session.login");
  expect(login).toBeGreaterThanOrEqual(0);
  expect(rpc.calls[login + 1]).toBe("Session.verify");
});

test("an administrator uses the shell: menus, a classic-only page, and applying pending changes", async ({
  page,
  rpc,
}) => {
  rpc.loginWith("authenticated");
  rpc.withPendingChanges();
  await page.goto("/ui/");
  await signIn(page, "example-admin");
  await expect(
    page.getByRole("heading", { name: copy.dashboard.title }),
  ).toBeVisible();

  // The user menu: who is signed in, the appearance, the classic interface, About.
  await page.getByRole("button", { name: ACCOUNT }).click();
  await expect(
    page.getByRole("menuitemradio", { name: copy.theme.system }),
  ).toBeVisible();
  await page.getByRole("menuitemradio", { name: copy.theme.dark }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("menuitem", { name: copy.user.about }).click();
  const about = page.getByRole("dialog", { name: copy.about.title });
  await expect(about).toBeVisible();
  await about.getByRole("button", { name: copy.about.close }).click();

  // A page only the classic interface has: a fixed link out, in the classic interface's hash form,
  // and no call.
  const before = rpc.calls.length;
  await page
    .getByRole("navigation", { name: copy.app.navigation })
    .getByRole("link", { name: new RegExp(`^${copy.nav.items.services.nfs}`) })
    .click();
  await expect(
    page.getByRole("heading", { name: copy.nav.items.services.nfs }),
  ).toBeFocused();
  await expect(
    page.getByRole("link", {
      name: `${copy.classicOnly.link.replace("{{page}}", copy.nav.items.services.nfs)} ${copy.app.newTab}`,
    }),
  ).toHaveAttribute("href", "/#/services/nfs");
  expect(
    rpc.calls.slice(before).filter((c) => c !== "System.getInformation"),
  ).toEqual([]);

  // The pending band: the apply confirmation, then the task, then the band is gone.
  const band = page.getByRole("region", { name: copy.pending.label });
  await expect(band).toBeVisible();
  const applyLabel = copy.pending.apply_other.replace("{{count}}", "2");
  await band.getByRole("button", { name: applyLabel }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(
    confirm.getByRole("button", { name: copy.pending.cancel }),
  ).toBeFocused();
  await confirm.getByRole("button", { name: applyLabel }).click();
  await expect(band).toHaveCount(0);
  expect(rpc.calls).toContain("Config.applyChangesBg");

  // The tasks menu keeps the result until it is dismissed.
  await page
    .getByRole("button", {
      name: copy.tasks.menuEnded_one.replace("{{count}}", "1"),
    })
    .click();
  await expect(
    page.getByRole("menuitem", { name: new RegExp(copy.pending.applyTask) }),
  ).toContainText(copy.tasks.done);
  await page.keyboard.press("Escape");

  await signOut(page);
  await expect(page.getByLabel(copy.signIn.username)).toBeVisible();
});

test("the observer reports a violation, so a clean run is evidence", async ({
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
  // Caught as intended: clear the record so the fixture's own check passes.
  observed.violations.length = 0;
  observed.consoleErrors.length = 0;
});

test("every reply under /ui/ carries the snippet's headers", async ({
  request,
  server,
}) => {
  const asset = readdirSync(join(DIST, "assets")).find((f) =>
    f.endsWith(".js"),
  );
  expect(asset, "the build has a script").toBeDefined();
  const cases = [
    { path: "/ui/", status: 200, headers: server.replies.app },
    { path: "/ui/index.html", status: 200, headers: server.replies.app },
    { path: "/ui/storage/disks", status: 200, headers: server.replies.app },
    {
      path: `/ui/assets/${asset ?? ""}`,
      status: 200,
      headers: server.replies.assets,
    },
    {
      path: "/ui/assets/missing-00000000.js",
      status: 404,
      headers: server.replies.missing,
    },
  ];
  for (const { path, status, headers } of cases) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(status);
    const sent = response.headers();
    for (const h of headers) {
      expect(sent[h.name.toLowerCase()], `${path} ${h.name}`).toBe(h.value);
    }
    expect(
      sent["content-security-policy-report-only"],
      `${path} report-only`,
    ).toBeUndefined();
  }
  const redirect = await request.get("/ui", { maxRedirects: 0 });
  expect(redirect.status()).toBe(301);
  expect(redirect.headers().location).toBe("/ui/");
});
