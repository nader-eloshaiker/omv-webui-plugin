// SPDX-License-Identifier: GPL-3.0-or-later
// Phase 3 acceptance on the test VM (docs/07): "sign in, change an SSH setting, apply, watch the task
// finish, see the new value" against the real backend, then the setting is put back and applied again,
// so the VM ends as it started; the shared-folders table asks the backend for exactly the page it
// shows; and a normal user's session has its own account page and nothing an administrator has. Any
// CSP or Trusted Types report, console error, page error or request to another origin fails a test
// (support/vmFixtures.ts).
//
// Account names, the host name, passwords and folder names come from the env file or the VM and are
// never printed. Apply is global (it applies every pending change), so the SSH journey runs only when
// nothing is pending before it starts: it never applies a change it did not make.
import type { Locator, Page } from "@playwright/test";
import copy from "../../src/locales/en/common.json" with { type: "json" };
import { expect, target, test, type RpcLog } from "./support/vmFixtures.ts";
import type { Account } from "./support/vmTarget.ts";

test.skip(
  target === null,
  "No VM env file ($OMV_WEBUI_ENV); the VM suite is skipped.",
);

const navigation = (page: Page) =>
  page.getByRole("navigation", { name: copy.app.navigation });
const dashboard = (page: Page) =>
  page.getByRole("heading", { level: 1, name: copy.dashboard.title });
const band = (page: Page) =>
  page.getByRole("region", { name: copy.pending.label });

async function signIn(page: Page, account: Account) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill(account.username);
  await page.getByLabel(copy.signIn.password).fill(account.password);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(dashboard(page)).toBeVisible();
}

async function signOut(page: Page, rpcLog: RpcLog) {
  await page
    .getByRole("button", {
      name: new RegExp(`^${copy.user.menu.split("{{name}}")[0] ?? ""}`),
    })
    .click();
  await page.getByRole("menuitem", { name: copy.user.signOut }).click();
  await expect(page.getByLabel(copy.signIn.username)).toBeVisible();
  expect(rpcLog.calls).toContain("Session.logout");
}

/** A field of an object reply, or undefined; never printed. */
function field(reply: unknown, key: string): unknown {
  return typeof reply === "object" && reply !== null
    ? Reflect.get(reply, key)
    : undefined;
}

/** Nothing is pending on the VM, by the last System.getInformation reply. */
async function nothingPending(rpcLog: RpcLog): Promise<boolean> {
  const info = await rpcLog.reply("System.getInformation");
  const modules = field(info, "dirtyModules");
  return (
    field(info, "configDirty") !== true &&
    (modules === undefined ||
      Array.isArray(modules) ||
      (typeof modules === "object" &&
        modules !== null &&
        Object.keys(modules).length === 0))
  );
}

/**
 * Turn "Compress data" to `on`, Save, Apply in the band, and watch the task to its end: the band shows
 * the apply running, then goes, and the tasks menu keeps the result.
 */
async function setCompression(page: Page, on: boolean) {
  const compress = page.getByRole("checkbox", { name: copy.ssh.compression });
  await expect(compress).toBeChecked({ checked: !on });
  await compress.click();
  await expect(compress).toBeChecked({ checked: on });
  await page
    .getByRole("form", { name: copy.ssh.title })
    .getByRole("button", { name: copy.common.save, exact: true })
    .click();
  await expect(page.getByText(copy.ssh.saved)).toBeVisible();
  await expect(page.getByText(copy.pending.itemMark)).toBeVisible();

  await expect(band(page)).toContainText(copy.modules.ssh);
  const apply = band(page).getByRole("button", { name: /^Apply \d+ change/ });
  const applyName = (await apply.textContent()) ?? "";
  await apply.click();
  const confirm = page.getByRole("alertdialog");
  await expect(
    confirm.getByRole("button", { name: copy.pending.cancel }),
  ).toBeFocused();
  await confirm.getByRole("button", { name: applyName.trim() }).click();

  // The task: the band reports it running (it may be quick), then goes when it has finished.
  await expect(band(page)).toHaveCount(0, { timeout: 180_000 });
  await expect(page.getByText(copy.pending.itemMark)).toHaveCount(0);
  await expect(page.getByText(copy.ssh.saved)).toHaveCount(0);
  const tasks = page.getByRole("button", {
    name: new RegExp(`^${copy.tasks.menu}`),
  });
  await tasks.click();
  const items = page.getByRole("menuitem", {
    name: new RegExp(copy.pending.applyTask),
  });
  await expect(items.last()).toContainText(copy.tasks.done);
  await page.keyboard.press("Escape");
}

/** Reload the SSH page and see the value the server now holds, on screen and in its reply. */
async function expectCompression(page: Page, rpcLog: RpcLog, on: boolean) {
  await page.reload();
  const compress = page.getByRole("checkbox", { name: copy.ssh.compression });
  await expect(compress).toBeChecked({ checked: on });
  await expect
    .poll(async () => field(await rpcLog.reply("SSH.get"), "compression"), {
      message: "SSH.get reports the value the page shows",
    })
    .toBe(on);
}

test.describe("an administrator", () => {
  test("changes an SSH setting, applies it, watches the task finish, sees the new value, and puts it back", async ({
    page,
    rpcLog,
    vm,
  }) => {
    test.setTimeout(8 * 60_000);
    await signIn(page, vm.admin);
    test.skip(
      !(await nothingPending(rpcLog)),
      "Changes are already pending on the VM; Apply would apply them too.",
    );

    await navigation(page)
      .getByRole("link", { name: copy.nav.items.services.ssh })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: copy.ssh.title }),
    ).toBeFocused();
    const compress = page.getByRole("checkbox", { name: copy.ssh.compression });
    await expect(compress).toBeVisible();
    const original = await compress.isChecked();

    try {
      await setCompression(page, !original);
      await expectCompression(page, rpcLog, !original);
    } finally {
      // Put the VM back as it was, whatever happened above.
      await page.goto("/ui/services/ssh");
      const now = page.getByRole("checkbox", { name: copy.ssh.compression });
      await expect(now).toBeVisible();
      if ((await now.isChecked()) !== original) {
        await setCompression(page, original);
      } else if ((await band(page).count()) > 0) {
        // Saved but not applied: undo it rather than apply.
        const undo = band(page).getByRole("button", { name: /^Undo/ });
        const undoName = (await undo.textContent()) ?? "";
        await undo.click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: undoName.trim() })
          .click();
        await expect(band(page)).toHaveCount(0, { timeout: 180_000 });
      }
    }
    await expectCompression(page, rpcLog, original);
    await expect(band(page)).toHaveCount(0);
    expect(await nothingPending(rpcLog)).toBe(true);
    await signOut(page, rpcLog);
  });

  test("the shared-folders table asks the backend for exactly the page, order and size it shows", async ({
    page,
    rpcLog,
    vm,
  }) => {
    interface ListParams {
      start?: unknown;
      limit?: unknown;
      sortfield?: unknown;
      sortdir?: unknown;
      search?: unknown;
    }
    const reads: ListParams[] = [];
    const pages: { params: ListParams; total: number; rows: number }[] = [];
    page.on("request", (request) => {
      if (!request.url().endsWith("/rpc.php")) {
        return;
      }
      const body: unknown = request.postDataJSON();
      if (
        field(body, "service") === "ShareMgmt" &&
        field(body, "method") === "getList"
      ) {
        reads.push((field(body, "params") ?? {}) as ListParams);
      }
    });
    page.on("response", async (response) => {
      if (!response.url().endsWith("/rpc.php") || response.status() !== 200) {
        return;
      }
      const body: unknown = response.request().postDataJSON();
      if (
        field(body, "service") !== "ShareMgmt" ||
        field(body, "method") !== "getList"
      ) {
        return;
      }
      const params = (field(body, "params") ?? {}) as ListParams;
      try {
        const reply = field(await response.json(), "response");
        const total = field(reply, "total");
        const data = field(reply, "data");
        if (typeof total === "number" && Array.isArray(data)) {
          pages.push({ params, total, rows: data.length });
        }
      } catch {
        // The page closed before the body arrived.
      }
    });
    const lastPage = () => pages.filter((p) => p.params.limit !== null).at(-1);

    await signIn(page, vm.admin);
    await navigation(page)
      .getByRole("link", { name: copy.nav.items.storage["shared-folders"] })
      .click();
    const table = page.getByRole("table", {
      name: copy.sharedFolders.tableLabel,
    });
    await expect(table).toBeVisible();

    // The first page, as the stock page sorts it, and a second read of every folder for the count.
    await expect
      .poll(() => lastPage()?.params)
      .toEqual({
        start: 0,
        limit: 25,
        sortfield: "name",
        sortdir: "asc",
      });
    expect(reads).toContainEqual({ start: 0, limit: null });
    const first = lastPage();
    if (first === undefined) {
      throw new Error("The table's first page was not read.");
    }
    test.info().annotations.push({
      type: "shared folders on the VM",
      description: String(first.total),
    });
    if (first.total === 0) {
      await expect(page.getByText(copy.sharedFolders.empty)).toBeVisible();
    } else {
      // The rows and the range on screen are the backend's page, exactly.
      await expect(table.locator("tbody tr")).toHaveCount(first.rows);
      await expect(
        page.getByText(
          copy.table.range
            .replace("{{from}}", "1")
            .replace("{{to}}", String(Math.min(25, first.total)))
            .replace("{{total}}", String(first.total)),
          { exact: true },
        ),
      ).toBeVisible();

      // A header sorts on the server, from the first page.
      await table
        .getByRole("button", { name: copy.sharedFolders.col.status })
        .click();
      await expect
        .poll(() => lastPage()?.params)
        .toEqual({ start: 0, limit: 25, sortfield: "status", sortdir: "asc" });
      await table
        .getByRole("button", { name: copy.sharedFolders.col.status })
        .click();
      await expect
        .poll(() => lastPage()?.params)
        .toEqual({ start: 0, limit: 25, sortfield: "status", sortdir: "desc" });

      // Ten rows a page: the size goes to the backend, and the table shows that many at most.
      await page.getByRole("combobox", { name: copy.table.pageSize }).click();
      await page.getByRole("option", { name: "10", exact: true }).click();
      await expect
        .poll(() => lastPage()?.params)
        .toEqual({ start: 0, limit: 10, sortfield: "status", sortdir: "desc" });
      await expect(table.locator("tbody tr")).toHaveCount(
        Math.min(10, first.total),
      );
      if (first.total > 10) {
        await page.getByRole("button", { name: copy.table.next }).click();
        await expect
          .poll(() => lastPage()?.params)
          .toMatchObject({ start: 10, limit: 10 });
      }

      // A search the backend cannot match: sent once, from the first page, and shown as such.
      const search = page.getByRole("searchbox", {
        name: copy.sharedFolders.search,
      });
      await search.fill("zz-no-folder-is-called-this");
      await expect(
        page.getByText(
          copy.sharedFolders.filteredEmpty.replace(
            "{{search}}",
            "zz-no-folder-is-called-this",
          ),
        ),
      ).toBeVisible();
      expect(lastPage()?.params).toMatchObject({
        start: 0,
        search: "zz-no-folder-is-called-this",
      });
      expect(lastPage()?.total).toBe(0);
    }
    // Nothing but reads (UI-4).
    expect(
      rpcLog.calls.filter((c) => !/\.(get|is)|^Session\./.test(c)),
    ).toEqual([]);
    await signOut(page, rpcLog);
  });
});

test.describe("a normal user", () => {
  test("has their own account page and none of an administrator's pages", async ({
    page,
    rpcLog,
    vm,
  }) => {
    await signIn(page, vm.user);
    const accountLink: Locator = navigation(page).getByRole("link", {
      name: copy.nav.items.account.settings,
    });
    await expect(navigation(page).getByRole("link")).toHaveCount(2);
    await accountLink.click();
    await expect(
      page.getByRole("heading", { level: 1, name: copy.account.title }),
    ).toBeFocused();
    await expect(accountLink).toHaveAttribute("aria-current", "page");

    // The page names the signed-in account, as the server reports it (compared, never printed).
    const account = await rpcLog.reply("UserMgmt.getUserByContext");
    await expect
      .poll(
        async () =>
          (await page.locator("main").textContent())?.includes(
            vm.user.username,
          ) ?? false,
        { message: "the account page names the signed-in account" },
      )
      .toBe(true);
    if (field(account, "_readonly") === true) {
      await expect(
        page.getByText(copy.account.lockedNote).first(),
      ).toBeVisible();
    } else {
      await expect(
        page.getByLabel(copy.account.newPassword, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: copy.account.email }),
      ).toBeEditable();
    }

    // The stock address of the password form lands on it.
    await page.goto("/ui/account/password");
    await expect(
      page.getByRole("heading", { level: 2, name: copy.account.password }),
    ).toBeFocused();

    // An administrator's pages, typed: refused, and nothing is asked of the backend for them.
    for (const path of ["/ui/services/ssh", "/ui/storage/shared-folders"]) {
      await page.goto(path);
      await expect(page.getByText(copy.adminOnly.body)).toBeVisible();
    }
    expect(rpcLog.calls).not.toContain("SSH.get");
    expect(rpcLog.calls).not.toContain("ShareMgmt.getList");
    // Nothing but reads (UI-4).
    expect(
      rpcLog.calls.filter((c) => !/\.(get|is)|^Session\./.test(c)),
    ).toEqual([]);
    await signOut(page, rpcLog);
  });
});
