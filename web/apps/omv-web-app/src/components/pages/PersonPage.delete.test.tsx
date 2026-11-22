// SPDX-License-Identifier: GPL-3.0-or-later
// A person's Shared folders and "Delete this person" on the remembering users mock (phase 5 users
// design 4.2, 7, 13.1): access saved per changed folder with the whole list, the last-access refusal
// in its row; the delete's check, its typed confirmation with what goes and what stays, taking them
// off the access lists by default, the steps, the result, a failed step, the pre-flight, and the
// shared folder's stale-entry line naming the account this session deleted.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { USERS_FOLDERS } from "../../mocks/usersScenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { calls, LONG, paramsOf } from "../../test/sharedFolderPage.ts";

async function personPage(scenario: ScenarioName, name: string) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: `/usermgmt/users/${name}`,
  });
  await screen.findByRole("heading", { level: 2, name: "Password" }, LONG);
  return app;
}

const accessSection = () =>
  screen
    .getByRole("heading", { level: 2, name: "Shared folders" })
    .closest("section") as HTMLElement;

const rowOf = (folder: string) =>
  within(accessSection()).getByRole("radiogroup", {
    name: new RegExp(`^Access for .?${folder}.?$`),
  });

describe("shared folders (4.2)", () => {
  it("links each folder to its page and saves a changed folder's whole list", async () => {
    const { user } = await personPage("usersSome", "sam");
    await within(accessSection()).findByRole(
      "radiogroup",
      { name: /Access for .?Backups.?/ },
      LONG,
    );
    expect(
      within(accessSection()).getByRole("link", {
        name: "Open shared folder Backups",
      }),
    ).toHaveAttribute(
      "href",
      `/ui/storage/shared-folders/${USERS_FOLDERS.backups}#folder-access`,
    );
    await user.click(
      within(rowOf("Backups")).getByRole("radio", { name: "Read only" }),
    );
    await user.click(
      within(accessSection()).getByRole("button", { name: "Save access" }),
    );
    await waitFor(
      () => expect(calls("ShareMgmt.setPrivileges")).toHaveLength(1),
      LONG,
    );
    expect(paramsOf("ShareMgmt.setPrivileges")[0]).toEqual({
      uuid: USERS_FOLDERS.backups,
      privileges: [
        { type: "user", name: "alex", perms: 7 },
        { type: "user", name: "sam", perms: 5 },
      ],
    });
    expect(
      (await screen.findAllByText(/Access of .?sam.? saved\./, {}, LONG))
        .length,
    ).toBeGreaterThan(0);
  });

  it("refuses, in the row, to leave a shared folder with nobody", async () => {
    const { user } = await personPage("usersOnlyAccess", "sam");
    await within(accessSection()).findByRole(
      "radiogroup",
      { name: /Access for .?Private.?/ },
      LONG,
    );
    await user.click(
      within(rowOf("Private")).getByRole("radio", { name: "No access" }),
    );
    await user.click(
      within(accessSection()).getByRole("button", { name: "Save access" }),
    );
    expect(
      await within(accessSection()).findByText(
        /is the only one with access to/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(calls("ShareMgmt.setPrivileges")).toHaveLength(0);
  });
});

describe("deleting a person (7)", () => {
  it("checks, confirms by the typed name, deletes, takes them off the lists and applies", async () => {
    const { user } = await personPage("usersSome", "alex");
    await user.click(screen.getByRole("button", { name: /Delete .?alex.?…/ }));
    const dialog = await screen.findByRole(
      "alertdialog",
      { name: /Delete .?alex.?\?/ },
      LONG,
    );
    expect(dialog).toHaveTextContent("What goes");
    expect(dialog).toHaveTextContent("Their administrator rights.");
    expect(dialog).toHaveTextContent(/membership of .?family.?/);
    expect(dialog).toHaveTextContent(/alex@example.org/);
    expect(dialog).toHaveTextContent("What stays");
    expect(dialog).toHaveTextContent(/Scheduled jobs, the Rsync server/);
    const off = within(dialog).getByRole("checkbox", {
      name: /off the access lists of 2 shared folders/,
    });
    expect(off).toBeChecked();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    const confirm = within(dialog).getByRole("button", {
      name: "Delete person",
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    await user.type(within(dialog).getByRole("textbox"), "alex");
    await user.click(confirm);
    expect(
      await screen.findByText(
        /was deleted\. Their files are still on the NAS\./,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(paramsOf("UserMgmt.deleteUser")).toEqual([{ name: "alex" }]);
    const writes = paramsOf("ShareMgmt.setPrivileges") as {
      uuid: string;
      privileges: { name: string }[];
    }[];
    expect(writes.map((w) => w.uuid).sort()).toEqual(
      [USERS_FOLDERS.backups, USERS_FOLDERS.documents].sort(),
    );
    for (const w of writes) {
      expect(w.privileges.some((e) => e.name === "alex")).toBe(false);
    }
    expect(calls("Config.applyChangesBg")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Go to Users" })).toBeVisible();
  });

  it("names the account deleted in this session on a folder that still lists it (13.1)", async () => {
    const { user } = await personPage("usersSome", "alex");
    await user.click(screen.getByRole("button", { name: /Delete .?alex.?…/ }));
    const dialog = await screen.findByRole(
      "alertdialog",
      { name: /Delete .?alex.?\?/ },
      LONG,
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: /off the access lists/ }),
    );
    await user.type(within(dialog).getByRole("textbox"), "alex");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete person" }),
    );
    await screen.findByText(/Their files are still on the NAS/, {}, LONG);
    expect(calls("ShareMgmt.setPrivileges")).toHaveLength(0);
    await user.click(screen.getByRole("link", { name: "Go to Users" }));
    await screen.findByRole("heading", { level: 1, name: "Users" }, LONG);
    // The Users list says the folders still list them (1.5).
    expect(
      await screen.findByText(/Shared folders still list/, {}, LONG),
    ).toBeVisible();
    await user.click(
      screen.getByRole("link", { name: "Open shared folder Documents" }),
    );
    await screen.findByRole(
      "heading",
      { level: 2, name: "Who can use it" },
      LONG,
    );
    expect(
      await screen.findByText(/was deleted in this session\./, {}, LONG),
    ).toBeVisible();
  });

  it("stays with the server's words when the account was not deleted", async () => {
    const { user } = await personPage("usersDeleteFailsNotDeleted", "sam");
    await user.click(screen.getByRole("button", { name: /Delete .?sam.?…/ }));
    const dialog = await screen.findByRole(
      "alertdialog",
      { name: /Delete .?sam.?\?/ },
      LONG,
    );
    await user.type(within(dialog).getByRole("textbox"), "sam");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete person" }),
    );
    expect(
      await screen.findByText(/sam.? was not deleted\./, {}, LONG),
    ).toBeVisible();
    expect(calls("Config.applyChangesBg")).toHaveLength(0);
  });

  it("asks to apply or undo other pending changes first", async () => {
    const { user } = await personPage("usersPending", "sam");
    await user.click(screen.getByRole("button", { name: /Delete .?sam.?…/ }));
    expect(
      await screen.findByRole("button", { name: "Apply them now" }, LONG),
    ).toBeVisible();
    expect(calls("UserMgmt.deleteUser")).toHaveLength(0);
  });
});
