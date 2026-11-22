// SPDX-License-Identifier: GPL-3.0-or-later
// People, groups and home folders on the test VM (phase 5 users design 1 to 12). Read-only first: the
// Users list with who can control the NAS, the signed-in administrator's own page (no delete, the
// administrator box locked), the Groups list and the home folders page, nothing saved.
//
// Then one journey with documentation names made and removed by this test only: "Add a group" makes
// example-team with no member; "Add a person" makes alex with a password and the group, applying its
// own changes; alex's page saves a description, a new password, SSH allowed then taken away (each
// confirmed), and leaves the group; alex is deleted behind the typed name; the group is deleted. The
// band applies what each save leaves, so nothing is left pending. It refuses to start while anything
// is pending or when alex or example-team already exists.
//
// Home folders are only read here: turning them on or off sets every person's home folder path,
// including the VM's own test accounts, which this suite never changes (the capture tool covers it).
//
// Account names, the host name, addresses and passwords come from the VM env file and are never
// printed. Any CSP or Trusted Types report, console error, page error or request to another origin
// fails a test (support/vmFixtures.ts), except the replies listed below.
import type { Page, Response } from "@playwright/test";
import { randomBytes } from "node:crypto";
import copy from "../../src/locales/en/common.json" with { type: "json" };
import { expect, target, test } from "./support/vmFixtures.ts";
import type { Account } from "./support/vmTarget.ts";

test.skip(
  target === null,
  "No VM env file ($OMV_WEBUI_ENV); the VM suite is skipped.",
);

// Documentation names (design 15.2), made and removed by this test only.
const PERSON = "alex";
const GROUP = "example-team";

test.use({
  extraAllowances: {
    list: [
      {
        reason:
          "the RAID plugin is not installed (404), the VM's disks have no monitoring settings (500), and the name checks read a missing account or group (500)",
        matches: (message, origin) =>
          message.location().url === `${origin}/rpc.php` &&
          /^Failed to load resource: the server responded with a status of (404|500)/.test(
            message.text(),
          ),
      },
    ],
  },
});

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
  unexpected: string[];
}

/** The calls made, the last reply of each, and any failure that was not expected. */
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
        return;
      }
      const message = String(field(field(envelope, "error"), "message"));
      const expected =
        response.status() === 401 ||
        (response.status() === 404 && name === "MdMgmt.enumerateDevices") ||
        (response.status() === 500 && name === "Smart.getDeviceSettings") ||
        // The name checks of the add flows: "does not exist" is the answer they want.
        (response.status() === 500 &&
          (name === "UserMgmt.getUser" || name === "UserMgmt.getGroup") &&
          / does not exist\.$/.test(message));
      if (!expected) {
        seen.unexpected.push(`${name} ${String(response.status())}`);
      }
    } catch {
      // The page went away before the body arrived.
    }
  });
  return seen;
}

const WRITES = [
  "UserMgmt.setUser",
  "UserMgmt.deleteUser",
  "UserMgmt.setGroup",
  "UserMgmt.deleteGroup",
  "UserMgmt.setSettings",
  "ShareMgmt.setPrivileges",
  "Config.applyChangesBg",
  "Config.revertChangesBg",
];

const pendingCount = (seen: Watch) => {
  const dirty = field(
    seen.replies.get("System.getInformation"),
    "dirtyModules",
  );
  return typeof dirty === "object" && dirty !== null
    ? Object.keys(dirty).length
    : Array.isArray(dirty)
      ? dirty.length
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

/** A name inside a label or sentence, isolated (FSI and PDI) as the pages show it. */
const named = (before: string, name: string, after = "") =>
  new RegExp(`^${before}\\u2068?${name}\\u2069?${after}$`);

test.describe("users and groups on the VM", () => {
  test("lists the people and who can control the NAS, and opens the reader's own page, writing nothing", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.admin);
    await page.goto("/ui/usermgmt/users");
    await expect(
      page.getByRole("heading", { level: 1, name: copy.users.title }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: copy.users.control.title }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(copy.users.footer.admin)).toBeVisible();
    // The built-in admin account is never listed (P17).
    await expect(
      page.getByRole("link", { name: named("Open ", "admin") }),
    ).toHaveCount(0);

    // The signed-in administrator's own page: no delete, the box locked (0.8).
    await page
      .getByRole("link", {
        name: named("Open ", vm.admin.username),
      })
      .first()
      .click();
    await expect(page.getByText(copy.person.isYou)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(copy.personCan.adminSelf)).toBeVisible();
    await expect(
      page.getByText(copy.personDelete.blocked.self).first(),
    ).toBeVisible();
    await expect(page.getByText(copy.password.self)).toBeVisible();

    await page.goto("/ui/usermgmt/groups");
    await expect(
      page.getByRole("heading", { level: 1, name: copy.groups.title }),
    ).toBeVisible();
    await page.goto("/ui/usermgmt/settings");
    await expect(
      page.getByRole("heading", { level: 1, name: copy.homeFolders.title }),
    ).toBeVisible();
    await expect(
      page
        .getByText(copy.homeFolders.state.off)
        .or(page.getByText(/^Each person has a private home folder in /)),
    ).toBeVisible({ timeout: 30_000 });
    expect(seen.calls).toContain("UserMgmt.getSettings");
    for (const call of WRITES) {
      expect(seen.calls).not.toContain(call);
    }
    expect(seen.unexpected).toEqual([]);
  });

  test("a normal user is told the pages are for administrators, and nothing is called", async ({
    page,
    vm,
  }) => {
    const seen = watch(page);
    await signIn(page, vm.user);
    const before = seen.calls.length;
    await page.goto("/ui/usermgmt/users");
    await expect(page.getByText(copy.adminOnly.body)).toBeVisible();
    expect(
      // The shell's own read of the signed-in account (getUserByContext) is not one of this
      // slice's calls.
      seen.calls
        .slice(before)
        .filter(
          (c) =>
            c.startsWith("UserMgmt.get") && c !== "UserMgmt.getUserByContext",
        ),
    ).toEqual([]);
  });

  test("adds a group and a person, changes the person, and deletes both", async ({
    page,
    vm,
  }) => {
    test.setTimeout(900_000);
    const seen = watch(page);
    await signIn(page, vm.admin);
    await page.goto("/ui/usermgmt/users");
    await expect(
      page.getByRole("heading", { level: 2, name: copy.users.control.title }),
    ).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => seen.replies.has("System.getInformation"))
      .toBe(true);
    test.skip(
      pendingCount(seen) !== 0,
      "Changes are pending on the VM; the journey needs none.",
    );
    const users = field(seen.replies.get("UserMgmt.getUserList"), "data");
    const names = Array.isArray(users)
      ? users.map((u) => String(field(u, "name")))
      : [];
    test.skip(
      names.includes(PERSON),
      `${PERSON} already exists on the VM; remove it first.`,
    );

    // 1. Add the group, with nobody in it and no access.
    await page.goto("/ui/usermgmt/groups/add");
    await page.getByRole("textbox", { name: /^Name/ }).fill(GROUP);
    await page.getByRole("button", { name: copy.addPerson.continue }).click();
    await page.getByRole("button", { name: copy.addGroup.confirm }).click();
    await expect(
      page.getByText(named("", GROUP, " is ready\\.")).first(),
    ).toBeVisible({ timeout: 180_000 });

    // 2. Add the person, in the group, with a password made for this run.
    const password = randomBytes(18).toString("base64url");
    await page.goto("/ui/usermgmt/users/add");
    await page.getByRole("textbox", { name: /^Name/ }).fill(PERSON);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Type it again", { exact: true }).fill(password);
    await page
      .getByRole("checkbox", { name: new RegExp(GROUP) })
      .first()
      .check();
    await page.getByRole("button", { name: copy.addPerson.continue }).click();
    await expect(
      page.getByRole("heading", { name: named("Ready to add ", PERSON) }),
    ).toBeVisible();
    await page.getByRole("button", { name: copy.addPerson.confirm }).click();
    await expect(
      page.getByText(named("", PERSON, " is ready\\.")).first(),
    ).toBeVisible({ timeout: 180_000 });
    expect(seen.calls).toContain("UserMgmt.setUser");
    // No password reaches the page (UI-6).
    expect(await page.content()).not.toContain(password);

    // 3. The person's page: a description, a new password, SSH given and taken away.
    await page.getByRole("link", { name: named("Open ", PERSON) }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: PERSON }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: copy.person.editDetails }).click();
    await page
      .getByRole("textbox", { name: /^Description/ })
      .fill("Test person");
    await page.getByRole("button", { name: copy.person.details.save }).click();
    await expect(
      page.getByText(named("Details of ", PERSON, " saved\\.")).first(),
    ).toBeVisible({ timeout: 30_000 });

    const next = randomBytes(18).toString("base64url");
    await page.getByRole("button", { name: copy.password.open }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(copy.password.new, { exact: true }).fill(next);
    await dialog.getByLabel(copy.password.again, { exact: true }).fill(next);
    await dialog.getByRole("button", { name: copy.password.set }).click();
    await expect(
      page
        .getByText(
          named("The password of ", PERSON, " is changed\\. It works now\\."),
        )
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    expect(await page.content()).not.toContain(next);

    const powers = page.locator("section", {
      has: page.getByRole("heading", {
        name: named("What ", PERSON, " can do"),
      }),
    });
    for (const allow of [true, false]) {
      const box = powers.getByRole("checkbox", { name: copy.personCan.ssh });
      await (allow ? box.check() : box.uncheck());
      await powers
        .getByRole("button", { name: copy.personCan.save, exact: true })
        .click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: copy.personCan.confirm.save })
        .click();
      await expect(
        page
          .getByText(
            allow
              ? named("", PERSON, " may now sign in over SSH\\.")
              : named("", PERSON, " can no longer sign in over SSH\\."),
          )
          .first(),
      ).toBeVisible({ timeout: 30_000 });
    }

    // 4. Out of the group, then apply what the saves left (Email and SSH).
    const groups = page.locator("section", {
      has: page.getByRole("heading", {
        level: 2,
        name: copy.personGroups.title,
      }),
    });
    await groups.getByRole("checkbox", { name: new RegExp(GROUP) }).uncheck();
    await groups.getByRole("button", { name: copy.personGroups.save }).click();
    await expect(
      page.getByText(named("Groups of ", PERSON, " saved\\.")).first(),
    ).toBeVisible({ timeout: 30_000 });
    await applyPending(page);

    // 5. Delete the person behind the typed name, then the group.
    await page
      .getByRole("button", { name: named("Delete ", PERSON, "…") })
      .click();
    const del = page.getByRole("alertdialog", {
      name: named("Delete ", PERSON, "\\?"),
    });
    await expect(del).toBeVisible({ timeout: 60_000 });
    await del.getByRole("textbox").fill(PERSON);
    await del.getByRole("button", { name: copy.personDelete.confirm }).click();
    await expect(
      page.getByRole("link", { name: copy.personDelete.toList }),
    ).toBeVisible({ timeout: 180_000 });
    expect(seen.calls).toContain("UserMgmt.deleteUser");

    await page.goto(`/ui/usermgmt/groups/${GROUP}`);
    await expect(
      page.getByRole("heading", { level: 1, name: GROUP }),
    ).toBeVisible({ timeout: 30_000 });
    await page
      .getByRole("button", { name: named("Delete ", GROUP, "…") })
      .click();
    const delGroup = page.getByRole("alertdialog", {
      name: named("Delete the group ", GROUP, "\\?"),
    });
    await delGroup
      .getByRole("button", { name: copy.groupDelete.confirm })
      .click();
    await expect(
      page.getByRole("link", { name: copy.groupDelete.toList }),
    ).toBeVisible({ timeout: 180_000 });
    expect(seen.calls).toContain("UserMgmt.deleteGroup");

    // Nothing is left pending, and nobody of the test's names is listed.
    await page.goto("/ui/usermgmt/users");
    await expect(
      page.getByRole("heading", { level: 2, name: copy.users.control.title }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("region", { name: copy.pending.label }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: named("Open ", PERSON) }),
    ).toHaveCount(0);
    expect(seen.unexpected).toEqual([]);
  });
});
