// SPDX-License-Identifier: GPL-3.0-or-later
// Sign in, see the signed-in page, sign out, under the snippet's headers (UI-1) and again with
// Trusted Types enforced. The page is found by what a person sees: the form's labels and the
// buttons' names, taken from the app's own English catalogue so a copy change does not break this.
// Any CSP violation, console error, page error or request to another origin fails a test
// (support/fixtures.ts).
import { readdirSync } from "node:fs";
import { join } from "node:path";
import copy from "../src/locales/en/common.json" with { type: "json" };
import { expect, test } from "./support/fixtures.ts";
import { DIST } from "./support/snippetServer.ts";

// Typed into the mock only; no real system is involved.
const PASSWORD = "not-a-real-password";

test("signed out, an administrator signs in and out", async ({ page, rpc }) => {
  rpc.loginWith("authenticated");
  await page.goto("/ui/");

  await expect(page.getByLabel(copy.signIn.username)).toBeVisible();
  await page.getByLabel(copy.signIn.username).fill("example-admin");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();

  const signOut = page.getByRole("button", { name: copy.signOut.action });
  await expect(signOut).toBeVisible();
  await expect(page.getByLabel(copy.signIn.password)).toHaveCount(0);

  await signOut.click();
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

  const signOut = page.getByRole("button", { name: copy.signOut.action });
  await expect(signOut).toBeVisible();
  await signOut.click();
  await expect(page.getByLabel(copy.signIn.username)).toBeVisible();

  // OMV drops a pending sign-in on any other call (A10): nothing between login and verify.
  const login = rpc.calls.indexOf("Session.login");
  expect(login).toBeGreaterThanOrEqual(0);
  expect(rpc.calls[login + 1]).toBe("Session.verify");
});

test("the observer reports a violation, so a clean run is evidence", async ({
  page,
  observed,
  headerVariant,
}) => {
  await page.goto("/ui/");
  await expect(page.getByLabel(copy.signIn.username)).toBeVisible();
  // An inline script added after load: CSP blocks it (script-src), and with Trusted Types enforced
  // the text assignment itself is refused first.
  await page.evaluate(() => {
    try {
      const script = document.createElement("script");
      script.textContent = "void 0";
      document.head.append(script);
    } catch {
      // Trusted Types threw on the assignment; the violation event has been sent.
    }
  });
  const expected =
    headerVariant === "trustedTypesEnforced"
      ? /^enforce require-trusted-types-for:/
      : /^enforce script-src-elem: blocked inline/;
  await expect
    .poll(() => observed.violations)
    .toContainEqual(expect.stringMatching(expected));
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
