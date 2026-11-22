// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a group" through the whole app on the remembering users mock (phase 5 users design 10): the
// pre-flight, failing closed, the name rules on blur and on Continue with focus and the count, the
// summary, a full run with and without access (the checkpoint only when access was given), a name
// taken before the run, the failures of step 2, a cut request, and hostile text rendered as text.
import type { Answers } from "@omv-webui/react-api-omv/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 15_000 };

async function flow(
  scenario: ScenarioName = "usersSome",
  answers: Answers = {},
) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: "/usermgmt/groups/add",
    answers,
  });
  await screen.findByRole("heading", { level: 2, name: "Add a group" }, LONG);
  return app;
}

type User = Awaited<ReturnType<typeof flow>>["user"];

const params = (call: string) =>
  seenCalls
    .filter((c) => c.call === call)
    .map((c) => c.params as Record<string, unknown>);
const nameField = () => screen.findByRole("textbox", { name: /^Name/ }, LONG);

async function fill(user: User, name: string, description = "") {
  await user.type(await nameField(), name);
  if (description !== "") {
    await user.type(
      screen.getByRole("textbox", { name: /^Description/ }),
      description,
    );
  }
}

const tick = (user: User, person: string) =>
  user.click(screen.getByRole("checkbox", { name: new RegExp(person) }));

async function giveAccess(
  user: User,
  folder: string,
  access = "Read and write",
) {
  const group = await screen.findByRole(
    "radiogroup",
    { name: new RegExp(`^Access for .?${folder}.?$`) },
    LONG,
  );
  await user.click(within(group).getByRole("radio", { name: access }));
}

async function toSummary(user: User, group: string) {
  await user.click(screen.getByRole("button", { name: "Continue" }));
  return screen.findByRole("heading", {
    level: 3,
    name: new RegExp(`^Ready to add the group .?${group}.?$`),
  });
}

const confirm = (user: User) =>
  user.click(screen.getByRole("button", { name: "Add group" }));

describe("Add a group", () => {
  it("adds a group with members and no access, and applies nothing", async () => {
    const { user } = await flow();
    await fill(user, "friends", "Friends of the house");
    await tick(user, "alex");
    await tick(user, "sam");
    const heading = await toSummary(user, "friends");
    await waitFor(() => expect(heading).toHaveFocus());
    const summary = heading.parentElement as HTMLElement;
    expect(summary).toHaveTextContent("Add the group friends.");
    expect(summary).toHaveTextContent('Described as "Friends of the house".');
    expect(summary).toHaveTextContent(/Members: .?alex.? and .?sam.?\./);
    expect(summary).toHaveTextContent("No access to any shared folder yet.");
    expect(callNames()).not.toContain("UserMgmt.setGroup");
    await confirm(user);

    expect(
      await screen.findByText(/friends.? is ready\./, {}, LONG),
    ).toBeInTheDocument();
    expect(
      screen.getByText("It has no access to any shared folder yet."),
    ).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Steps" });
    expect(steps).toHaveTextContent("Check the choices");
    expect(steps).toHaveTextContent("Add the group");
    expect(steps).not.toHaveTextContent("Save and finish");
    expect(params("UserMgmt.setGroup")).toEqual([
      {
        name: "friends",
        comment: "Friends of the house",
        members: ["alex", "sam"],
      },
    ]);
    // Both names were read as free before the write.
    expect(params("UserMgmt.getGroup")[0]).toEqual({ name: "friends" });
    expect(params("UserMgmt.getUser")[0]).toEqual({ name: "friends" });
    expect(callNames()).not.toContain("Config.applyChangesBg");
    expect(callNames()).not.toContain("ShareMgmt.setPrivileges");
    expect(
      screen.getByRole("link", { name: /Open .?friends/ }),
    ).toHaveAttribute("href", "/ui/usermgmt/groups/friends");
    expect(
      screen.getByRole("link", { name: "Add another group" }),
    ).toBeInTheDocument();
    // Focus is not lost when the result replaces the pressed button.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveFocus(),
    );
  });

  it("gives access with the whole list kept, then applies once", async () => {
    const { user } = await flow();
    await fill(user, "friends");
    await tick(user, "robin");
    await giveAccess(user, "Backups");
    await giveAccess(user, "Photos", "Read only");
    const heading = await toSummary(user, "friends");
    const summary = heading.parentElement as HTMLElement;
    expect(summary).toHaveTextContent(/Read and write: .?Backups.?\./);
    expect(summary).toHaveTextContent(/Read only: .?Photos.?\./);
    await confirm(user);
    expect(
      await screen.findByText(/Its members can open/, {}, LONG),
    ).toHaveTextContent(/Backups.?, .?Photos/);
    const lists = params("ShareMgmt.setPrivileges");
    expect(lists).toHaveLength(2);
    expect(lists[0]?.privileges).toEqual(
      expect.arrayContaining([
        { type: "user", name: "alex", perms: 7 },
        { type: "group", name: "friends", perms: 7 },
      ]),
    );
    expect(lists[1]?.privileges).toEqual(
      expect.arrayContaining([
        { type: "group", name: "family", perms: 7 },
        { type: "group", name: "kids", perms: 5 },
        { type: "group", name: "friends", perms: 5 },
      ]),
    );
    expect(params("Config.applyChangesBg")).toHaveLength(1);
    expect(screen.getByRole("list", { name: "Steps" })).toHaveTextContent(
      "Save and finish",
    );
  });

  it("checks the name on blur and on Continue, and moves focus to it", async () => {
    const { user } = await flow();
    const name = await nameField();
    expect(name).toHaveAttribute("autocomplete", "off");
    expect(name).toHaveAttribute("spellcheck", "false");
    expect(name).toHaveAttribute("autocapitalize", "none");
    await user.type(name, "Family");
    await user.tab();
    expect(
      await screen.findByText(
        "Use small letters a to z, digits, and . _ or -, starting with a letter.",
      ),
    ).toBeInTheDocument();
    await user.clear(name);
    await user.type(name, "wheel");
    await user.tab();
    // The reserved names wait for Continue.
    expect(screen.queryByText(/keeps for itself/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText(/wheel.? is a name the NAS keeps for itself/),
    ).toBeInTheDocument();
    expect(name).toHaveFocus();
    expect(screen.getByText("1 thing to fix")).toBeInTheDocument();
    await user.clear(name);
    await user.type(name, "family");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText(/There is already a group called .?family/),
    ).toBeInTheDocument();
    await user.clear(name);
    await user.type(name, "robin");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText(/There is already a person called .?robin/),
    ).toBeInTheDocument();
    expect(callNames()).not.toContain("UserMgmt.setGroup");
  });

  it("refuses a description with a colon", async () => {
    const { user } = await flow();
    await fill(user, "friends", "a: b");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText(
        "A description cannot contain a colon or a line break.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Description/ })).toHaveFocus();
  });

  it("Change choices keeps every choice", async () => {
    const { user } = await flow();
    await fill(user, "friends", "Pals");
    await tick(user, "alex");
    await toSummary(user, "friends");
    await user.click(screen.getByRole("button", { name: "Change choices" }));
    expect(await nameField()).toHaveValue("friends");
    expect(screen.getByRole("textbox", { name: /^Description/ })).toHaveValue(
      "Pals",
    );
    expect(screen.getByRole("checkbox", { name: /alex/ })).toBeChecked();
  });

  it("does not start while other changes are pending (R1)", async () => {
    await flow("usersPending");
    expect(
      await screen.findByText(/Some changes are not applied yet/, {}, LONG),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /^Name/ })).toBeNull();
  });

  it("fails closed when the people cannot be read", async () => {
    await flow("usersSome", {
      userMgmtGetUserList: { status: 500, message: "Cannot read users." },
    });
    expect(
      await screen.findByText(
        "Could not read what this NAS needs to add a group.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Cannot read users.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /^Name/ })).toBeNull();
  });

  it("stops at step 1 when someone took the name, and writes nothing", async () => {
    const { user } = await flow("usersAddFailsCheck");
    await fill(user, "friends");
    await toSummary(user, "friends");
    await confirm(user);
    expect(
      await screen.findByText(
        /There is now (a group|an account) called/,
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(callNames()).not.toContain("UserMgmt.setGroup");
    expect(
      screen.getByRole("button", { name: "Change choices" }),
    ).toBeVisible();
  });

  it("stops at step 1 when a name read answers anything but 'does not exist'", async () => {
    const { user } = await flow("usersSome", {
      userMgmtGetGroup: { status: 500, message: "Something else." },
    });
    await fill(user, "friends");
    await toSummary(user, "friends");
    await confirm(user);
    expect(
      await screen.findByText(
        "Could not check whether the name is free.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Something else.")).toBeInTheDocument();
    expect(callNames()).not.toContain("UserMgmt.setGroup");
  });

  it("says when the group was not added, with Try again and Change choices", async () => {
    const { user } = await flow("usersAddFailsNotAdded");
    await fill(user, "friends");
    await toSummary(user, "friends");
    await confirm(user);
    expect(
      await screen.findByText(/friends.? was not added\./, {}, LONG),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Change choices" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText(/friends.? is ready\./, {}, LONG),
    ).toBeInTheDocument();
  });

  it("offers to finish or delete a group made without its members", async () => {
    const { user } = await flow("usersAddFailsPartly");
    await fill(user, "friends");
    await tick(user, "alex");
    await toSummary(user, "friends");
    await confirm(user);
    expect(
      await screen.findByText(
        /friends.? was added, but not everything was set up\./,
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /Delete .?friends.? again/ }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "The group goes. Its members stay on the NAS, with their own access.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Delete .?friends.? again/ }),
    );
    expect(
      await screen.findByText(/friends.? was deleted again/, {}, LONG),
    ).toBeInTheDocument();
    const sets = params("UserMgmt.setGroup");
    expect(sets.at(-1)).toMatchObject({ name: "friends", members: [] });
    expect(params("UserMgmt.deleteGroup")).toEqual([{ name: "friends" }]);
  });

  it("says a cut request is not known, and Check again goes on", async () => {
    const { user } = await flow("usersAddFailsCut");
    await fill(user, "friends");
    await toSummary(user, "friends");
    await confirm(user);
    expect(
      await screen.findByText(
        /Could not tell whether “Add the group” finished\./,
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(
      await screen.findByText(/friends.? is ready\./, {}, LONG),
    ).toBeInTheDocument();
    expect(params("UserMgmt.setGroup")).toHaveLength(1);
  });

  it("renders the people's hostile descriptions as text", async () => {
    await flow("usersHostile");
    await nameField();
    expect(
      (await screen.findAllByText('<img src=x onerror="alert(1)">', {}, LONG))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("<b>add</b>").length).toBeGreaterThan(0);
    // The right-to-left override is shown as a mark, never applied (format/isolate.ts).
    expect(screen.getAllByText(/סם �evil/).length).toBeGreaterThan(0);
    expect(document.querySelector("img, b")).toBeNull();
  });

  it("refuses the name add, which is this interface's own address (owner, P6)", async () => {
    const { user } = await flow();
    await fill(user, "add");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      (
        await screen.findAllByText(
          /is the address of “Add a group” in this interface/,
          {},
          LONG,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Add group" })).toBeNull();
  });
});
