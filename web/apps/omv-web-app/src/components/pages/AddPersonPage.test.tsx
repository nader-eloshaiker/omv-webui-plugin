// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a person" (Flow B) on the remembering users mock (phase 5 users design 6): the pre-flight, the
// form's checks, the summary without the password, the run with every request in order, the result,
// "Change choices" clearing the passwords, and the failures of 6.6 with their decisions. UI-6: the
// password is in no DOM text, storage or address after the run.
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { USERS_FOLDERS } from "../../mocks/usersScenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { markupOf, watchStorage } from "../../test/secrets.ts";
import { callNames } from "../../test/server.ts";
import { calls, LONG, paramsOf } from "../../test/sharedFolderPage.ts";

const SECRET = "Correct horse 7";

async function addPage(scenario: ScenarioName) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: "/usermgmt/users/add",
  });
  await screen.findByRole("button", { name: "Continue" }, LONG);
  return app;
}

type User = Awaited<ReturnType<typeof addPage>>["user"];

async function fill(
  user: User,
  { name, password = SECRET }: { name: string; password?: string },
) {
  await user.type(screen.getByRole("textbox", { name: "Name" }), name);
  await user.type(screen.getByLabelText("Password"), password);
  await user.type(screen.getByLabelText("Type it again"), password);
}

let storage = watchStorage();
beforeEach(() => {
  storage = watchStorage();
});
afterEach(() => vi.restoreAllMocks());

const noSecretLeft = () => {
  expect(markupOf()).not.toContain(SECRET);
  expect(window.location.href).not.toContain("Correct");
  expect(storage.wrote(SECRET)).toBe(false);
};

describe("the pre-flight (6.1, R1)", () => {
  it("does not start while other changes are pending", async () => {
    await renderApp({
      signedIn: true,
      scenario: "usersPending",
      path: "/usermgmt/users/add",
    });
    expect(
      await screen.findByRole("button", { name: "Apply them now" }, LONG),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("fails closed when the people cannot be read", async () => {
    await renderApp({
      signedIn: true,
      scenario: "usersReadsFailUserList",
      path: "/usermgmt/users/add",
    });
    expect(
      await screen.findByText(
        "Could not read what this NAS needs to add a person.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });
});

describe("the form's checks (6.2, 0.6, 0.7)", () => {
  it("moves focus to the first problem and says how many there are", async () => {
    const { user } = await addPage("usersSome");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
    expect(screen.getByText("2 things to fix")).toBeVisible();
    expect(screen.getByText("Use 1 to 32 characters.")).toBeVisible();
    expect(screen.getByText("Enter a password.")).toBeVisible();
    // Opening the page and checking makes no write and asks for no name (R9).
    expect(callNames().filter((c) => c.startsWith("UserMgmt.set"))).toEqual([]);
    expect(calls("UserMgmt.getUser")).toHaveLength(0);
  });

  it.each([
    [
      "Alex",
      "Use small letters a to z, digits, and . _ or -, starting with a letter.",
    ],
    ["admin", /is a name the NAS or Windows keeps for itself/],
    ["robin", /There is already a person called/],
    ["family", /There is already a group called/],
  ])("refuses the name %s", async (name, words) => {
    const { user } = await addPage("usersSome");
    await fill(user, { name });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(words)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
  });

  it("says when the two passwords differ, and keeps spaces as typed", async () => {
    const { user } = await addPage("usersSome");
    await user.type(screen.getByRole("textbox", { name: "Name" }), "casey");
    await user.type(screen.getByLabelText("Password"), "abc ");
    await user.type(screen.getByLabelText("Type it again"), "abc");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByText("The two passwords are not the same."),
    ).toBeVisible();
    expect(screen.getByLabelText("Type it again")).toHaveFocus();
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("Type it again")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });
});

describe("adding a person (6.3 to 6.5)", () => {
  it("summarises, then adds them with their groups, access and SSH, applies and checks", async () => {
    const { user } = await addPage("usersSome");
    await fill(user, { name: "casey" });
    await user.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "casey@example.org",
    );
    await user.click(screen.getByRole("checkbox", { name: /family/ }));
    await user.click(
      within(
        screen.getByRole("radiogroup", { name: /Access for .?Backups.?/ }),
      ).getByRole("radio", { name: "Read only" }),
    );
    const ssh = screen.getByRole("checkbox", { name: "May sign in over SSH" });
    await waitFor(() => expect(ssh).not.toHaveAttribute("aria-disabled"), LONG);
    await user.click(ssh);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const title = await screen.findByRole("heading", {
      name: /Ready to add .?casey.?/,
    });
    expect(title).toHaveFocus();
    const summary = title.parentElement?.parentElement as HTMLElement;
    expect(document.body).toHaveTextContent(
      /Add the person .?casey.?, who signs in with the password you typed\./,
    );
    expect(document.body).toHaveTextContent(/Member of .?family.?\./);
    expect(document.body).toHaveTextContent(/Read only: .?Backups.?\./);
    expect(document.body).toHaveTextContent(
      /Through .?family.?: .?Documents.?, .?Photos.?|Through .?family.?: .?Documents.? and .?Photos.?/,
    );
    expect(document.body).toHaveTextContent(/may sign in over SSH/);
    expect(summary).not.toHaveTextContent(SECRET);
    expect(callNames().filter((c) => c.startsWith("UserMgmt.set"))).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Add person" }));
    expect(
      await screen.findByText(/casey.? is ready\./, {}, { timeout: 30000 }),
    ).toBeVisible();

    // Step 1 checked the name as an account and as a group, then step 2 made the person.
    expect(paramsOf("UserMgmt.getUser")[0]).toEqual({ name: "casey" });
    expect(paramsOf("UserMgmt.getGroup")).toContainEqual({ name: "casey" });
    const sent = paramsOf("UserMgmt.setUser");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      name: "casey",
      password: SECRET,
      email: "casey@example.org",
      groups: ["users", "_ssh", "family"],
      shell: "/usr/bin/sh",
      disallowusermod: false,
      sshpubkeys: [],
    });
    expect(paramsOf("ShareMgmt.setPrivileges")).toEqual([
      {
        uuid: USERS_FOLDERS.backups,
        privileges: [
          { type: "user", name: "alex", perms: 7 },
          { type: "user", name: "casey", perms: 5 },
        ],
      },
    ]);
    expect(calls("Config.applyChangesBg")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open casey" })).toHaveAttribute(
      "href",
      "/ui/usermgmt/users/casey",
    );
    noSecretLeft();
  }, 60000);

  it("clears the passwords when going back from the summary", async () => {
    const { user } = await addPage("usersSome");
    await fill(user, { name: "casey" });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("button", { name: "Change choices" }),
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("casey");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Type it again")).toHaveValue("");
    noSecretLeft();
  });

  it("refuses the name add, which is this interface's own address (owner, P6)", async () => {
    const { user } = await addPage("usersSome");
    await fill(user, { name: "add" });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findAllByText(
        /is the address of “Add a person” in this interface/,
      ),
    ).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add person" })).toBeNull();
    expect(callNames()).not.toContain("UserMgmt.setUser");
  });
});

describe("failures (6.6)", () => {
  it("stops at step 1 when the name was taken meanwhile, having changed nothing", async () => {
    const { user } = await addPage("usersAddFailsCheck");
    await fill(user, { name: "casey" });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Add person" }));
    expect(
      await screen.findByText(/There is now an account called/, {}, LONG),
    ).toBeVisible();
    expect(calls("UserMgmt.setUser")).toHaveLength(0);
    noSecretLeft();
  });

  it("asks for the password again to try once more after the person was not added", async () => {
    const { user } = await addPage("usersAddFailsNotAdded");
    await fill(user, { name: "casey" });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Add person" }));
    expect(
      await screen.findByText(/casey.? was not added\./, {}, LONG),
    ).toBeVisible();
    noSecretLeft();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Enter a password.")).toBeVisible();
    expect(calls("UserMgmt.setUser")).toHaveLength(1);
    await user.type(screen.getByLabelText("Password"), SECRET);
    await user.type(screen.getByLabelText("Type it again"), SECRET);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText(/casey.? is ready\./, {}, { timeout: 30000 }),
    ).toBeVisible();
    expect(paramsOf("UserMgmt.setUser")[1]).toMatchObject({
      name: "casey",
      password: SECRET,
    });
    noSecretLeft();
  }, 60000);

  it("offers to delete again a person who was made but not set up", async () => {
    const { user } = await addPage("usersAddFailsPartly");
    await fill(user, { name: "casey" });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Add person" }));
    expect(
      await screen.findByText(
        /casey.? was added, but not everything was set up\./,
        {},
        LONG,
      ),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: /Delete .?casey.? again/ }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Nothing of theirs is kept.");
    await user.click(
      within(dialog).getByRole("button", { name: /Delete .?casey.? again/ }),
    );
    expect(
      await screen.findByText(/casey.? was deleted again\./, {}, LONG),
    ).toBeVisible();
    expect(paramsOf("UserMgmt.deleteUser")).toEqual([{ name: "casey" }]);
  });
});
