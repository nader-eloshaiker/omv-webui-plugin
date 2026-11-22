// SPDX-License-Identifier: GPL-3.0-or-later
// People, groups and home folders (phase 5 users design 1 to 12), in the production build under the
// snippet's headers, on the remembering users mock (src/mocks/usersScenarios.ts): the Users list with
// who can control the NAS, adding a person to their result with no password left on the page, a
// person's SSH confirmed in words, deleting a person behind the typed name, adding and deleting a
// group, and home folders turned on and off. Every page loads without a page error, console error or
// CSP violation (support/fixtures.ts fails the test on any). No real system is involved.
import type { Page } from "@playwright/test";
import copy from "../src/locales/en/common.json" with { type: "json" };
import type { ScenarioName } from "../src/mocks/scenarios.ts";
import { expect, test } from "./support/fixtures.ts";
import { answerWithScenario, STORAGE_CALLS } from "./support/scenarioRoute.ts";

// Typed into the mock only.
const PASSWORD = "not-a-real-password";
const NEW_PASSWORD = "Correct horse 7";

const USERS_CALLS = (call: string): boolean =>
  STORAGE_CALLS(call) ||
  /^(ShareMgmt|UserMgmt|SMB|SSH|Services|FileSystemMgmt)\./.test(call);

async function signInWith(
  page: Page,
  rpc: { calls: string[] },
  scenario: ScenarioName,
) {
  expect(rpc.calls).toEqual([]);
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill("example-admin");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
  return answerWithScenario(page, scenario, USERS_CALLS);
}

// The add flows' name checks read a missing account or group, which OMV answers with HTTP 500
// ("does not exist"): Chromium logs those replies as failed resources.
test.use({
  extraAllowances: {
    list: [
      {
        reason:
          "UserMgmt.getUser and getGroup answer 500 for a name that is free",
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

/** A name inside a label or sentence, isolated (FSI and PDI) as the pages show it. */
const named = (before: string, name: string, after = "") =>
  new RegExp(`^${before}\\u2068?${name}\\u2069?${after}$`);

test("the Users list says who can control the NAS, and opens a person's page", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "usersSome");
  await page.goto("/ui/usermgmt/users");
  await expect(
    page.getByRole("heading", { level: 2, name: copy.users.control.title }),
  ).toBeVisible();
  await expect(page.getByText(copy.users.footer.admin)).toBeVisible();
  expect(calls).toContain("UserMgmt.getUserList");
  await page
    .getByRole("link", { name: named("Open ", "robin") })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "robin" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: copy.personGroups.title }),
  ).toBeVisible();
  // Nothing is written on opening a page (UI-4).
  expect(calls).not.toContain("UserMgmt.setUser");
});

test("adds a person to their result, and leaves no password on the page", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "usersNone");
  await page.goto("/ui/usermgmt/users/add");
  await page.getByRole("textbox", { name: /^Name/ }).fill("alex");
  await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Type it again", { exact: true }).fill(NEW_PASSWORD);
  for (const field of [
    page.getByLabel("Password", { exact: true }),
    page.getByLabel("Type it again", { exact: true }),
  ]) {
    await expect(field).toHaveAttribute("autocomplete", "new-password");
  }
  await page.getByRole("button", { name: copy.addPerson.continue }).click();
  await expect(
    page.getByRole("heading", { name: named("Ready to add ", "alex") }),
  ).toBeVisible();
  await page.getByRole("button", { name: copy.addPerson.confirm }).click();
  await expect(
    page.getByText(named("", "alex", " is ready\\.")).first(),
  ).toBeVisible({ timeout: 30_000 });
  expect(calls).toContain("UserMgmt.setUser");
  await expect(page.locator("body")).not.toContainText(NEW_PASSWORD);
  const markup = await page.content();
  expect(markup).not.toContain(NEW_PASSWORD);
});

test("allows SSH after a confirmation in words", async ({ page, rpc }) => {
  const calls = await signInWith(page, rpc, "usersSome");
  await page.goto("/ui/usermgmt/users/sam");
  const box = page.getByRole("checkbox", { name: copy.personCan.ssh });
  await expect(box).toBeVisible();
  await box.click();
  await page
    .getByRole("region", { name: named("What ", "sam", " can do") })
    .or(
      page.locator("section", {
        has: page.getByRole("heading", {
          name: named("What ", "sam", " can do"),
        }),
      }),
    )
    .first()
    .getByRole("button", { name: copy.personCan.save, exact: true })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(copy.personCan.confirm.now);
  await dialog
    .getByRole("button", { name: copy.personCan.confirm.save })
    .click();
  await expect(
    page.getByText(named("", "sam", " may now sign in over SSH\\.")).first(),
  ).toBeVisible({ timeout: 30_000 });
  expect(calls).toContain("UserMgmt.setUser");
});

test("deletes a person only after their name is typed", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "usersSome");
  await page.goto("/ui/usermgmt/users/robin");
  await page
    .getByRole("button", { name: named("Delete ", "robin", "…") })
    .click();
  const dialog = page.getByRole("alertdialog", {
    name: named("Delete ", "robin", "\\?"),
  });
  await expect(dialog).toContainText(copy.personDelete.goes.title);
  await expect(dialog).toContainText(copy.personDelete.stays.title);
  const confirm = dialog.getByRole("button", {
    name: copy.personDelete.confirm,
  });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await dialog.getByRole("textbox").fill("robin");
  await confirm.click();
  await expect(
    page.getByRole("link", { name: copy.personDelete.toList }),
  ).toBeVisible({ timeout: 30_000 });
  expect(calls).toContain("UserMgmt.deleteUser");
});

test("adds a group, and deletes another after taking everyone out", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "usersSome");
  await page.goto("/ui/usermgmt/groups/add");
  await page.getByRole("textbox", { name: /^Name/ }).fill("example-team");
  await page.getByRole("button", { name: copy.addPerson.continue }).click();
  await page.getByRole("button", { name: copy.addGroup.confirm }).click();
  await expect(
    page.getByText(named("", "example-team", " is ready\\.")).first(),
  ).toBeVisible({ timeout: 30_000 });
  expect(calls).toContain("UserMgmt.setGroup");

  await page.goto("/ui/usermgmt/groups/kids");
  await page
    .getByRole("button", { name: named("Delete ", "kids", "…") })
    .click();
  const dialog = page.getByRole("alertdialog", {
    name: named("Delete the group ", "kids", "\\?"),
  });
  await dialog.getByRole("button", { name: copy.groupDelete.confirm }).click();
  await expect(
    page.getByRole("link", { name: copy.groupDelete.toList }),
  ).toBeVisible({ timeout: 30_000 });
  expect(calls).toContain("UserMgmt.deleteGroup");
});

test("turns home folders on in a shared folder, and off again", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "usersSome");
  await page.goto("/ui/usermgmt/settings");
  await expect(page.getByText(copy.homeFolders.state.off)).toBeVisible();
  // A whole file system is never offered (P12, settled on the VM).
  await expect(page.getByRole("radio", { name: /Archive/ })).toHaveCount(0);
  await page.getByRole("radio", { name: /Homes/ }).click();
  await page.getByRole("button", { name: copy.homeFolders.turnOn }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: copy.homeFolders.on.confirm })
    .click();
  await expect(
    page.getByText(/^Each person has a private home folder in /),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: copy.homeFolders.turnOff }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: copy.homeFolders.off.confirm })
    .click();
  await expect(page.getByText(copy.homeFolders.state.off)).toBeVisible({
    timeout: 30_000,
  });
  expect(calls.filter((c) => c === "UserMgmt.setSettings")).toHaveLength(2);
});
