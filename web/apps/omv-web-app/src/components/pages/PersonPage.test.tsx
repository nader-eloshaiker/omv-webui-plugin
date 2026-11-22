// SPDX-License-Identifier: GPL-3.0-or-later
// A person's page on the remembering users mock (phase 5 users design 2 to 5, 7): the address checked
// before any call, not found, the summary and "What to do now", editing the details, what they can do
// with its confirmation, groups, a new password (UI-6), the self rules failing closed (0.8), the
// read-change-write that stops when the person changed elsewhere (0.11), and server text as text.
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { markupOf, watchStorage } from "../../test/secrets.ts";
import { callNames } from "../../test/server.ts";
import { calls, LONG, paramsOf } from "../../test/sharedFolderPage.ts";

async function personPage(
  scenario: ScenarioName,
  name: string,
  answers: NonNullable<Parameters<typeof renderApp>[0]>["answers"] = {},
) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: `/usermgmt/users/${name}`,
    answers,
  });
  await screen.findByRole("heading", { level: 2, name: "Password" }, LONG);
  return app;
}

afterEach(() => vi.restoreAllMocks());

const section = (name: RegExp | string) =>
  screen
    .getByRole("heading", { level: 2, name })
    .closest("section") as HTMLElement;

describe("the address (2, UI-4)", () => {
  it("makes no call for a value that fails OMV's pattern", async () => {
    await renderApp({
      signedIn: true,
      scenario: "usersSome",
      path: "/usermgmt/users/-alex",
    });
    expect(
      await screen.findByText("There is no such person on this NAS.", {}, LONG),
    ).toBeVisible();
    expect(callNames().filter((c) => c.startsWith("UserMgmt."))).toEqual(
      callNames().filter((c) => c === "UserMgmt.getUserByContext"),
    );
  });

  it("says nobody of that name is here, and links to the list", async () => {
    await renderApp({
      signedIn: true,
      scenario: "usersSome",
      path: "/usermgmt/users/casey",
    });
    expect(
      await screen.findByRole("link", { name: "Go to Users" }, LONG),
    ).toBeVisible();
    expect(document.body).toHaveTextContent(
      /There is nobody called .?casey.? on this NAS\. They may have been deleted\./,
    );
    expect(screen.getByRole("link", { name: "Go to Users" })).toHaveAttribute(
      "href",
      "/ui/usermgmt/users",
    );
    expect(calls("UserMgmt.getUser")).toHaveLength(0);
  });

  it("does not find a built-in account, which the list leaves out", async () => {
    await renderApp({
      signedIn: true,
      scenario: "usersSome",
      path: "/usermgmt/users/admin",
    });
    expect(
      await screen.findByRole("link", { name: "Go to Users" }, LONG),
    ).toBeVisible();
    expect(document.body).toHaveTextContent(/There is nobody called .?admin.?/);
  });
});

describe("the summary and what to do now (2.3, 2.4)", () => {
  it("shows who they are, without reading getUser on opening", async () => {
    await personPage("usersSome", "alex");
    expect(
      screen.getByRole("heading", { level: 1, name: "alex" }),
    ).toBeVisible();
    expect(screen.getAllByText("Alex at home").length).toBeGreaterThan(0);
    expect(screen.getByText("alex@example.org")).toBeVisible();
    expect(screen.getByText("Home folders are off.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit details" })).toBeVisible();
    expect(calls("UserMgmt.getUser")).toHaveLength(0);
  });

  it("says when home folders are on but their shared folder is gone (12.7)", async () => {
    await personPage("usersHomeGone", "alex");
    expect(
      await screen.findByText(
        "Home folders are on, but their shared folder no longer exists.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Home folders settings" }),
    ).toHaveAttribute("href", "/ui/usermgmt/settings");
  });

  it("says when a person can open no shared folder, and moves focus to the grid", async () => {
    const { user } = await personPage("usersSome", "sam");
    expect(
      await screen.findByRole(
        "heading",
        { name: /sam.? cannot open any shared folder yet/ },
        LONG,
      ),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Choose shared folders" }),
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Shared folders" }),
    ).toHaveFocus();
  });

  it("warns first about system groups that give control of the NAS", async () => {
    await personPage("usersSystemGroups", "alex");
    expect(
      await screen.findByRole(
        "heading",
        { name: /alex.? has control over the NAS/ },
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByText("Other system groups")).toBeVisible();
  });

  it("says when SSH is allowed but the account opens no command line", async () => {
    await personPage("usersSshStates", "casey");
    expect(
      await screen.findByText(
        /their account is set not to open a command line/,
        {},
        LONG,
      ),
    ).toBeVisible();
  });
});

describe("editing the details (2.5, 0.11)", () => {
  it("re-reads, sends every field as read with the two changed, and marks Email pending", async () => {
    const { user } = await personPage("usersSome", "alex");
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    const description = screen.getByRole("textbox", { name: "Description" });
    expect(description).toHaveFocus();
    await user.clear(description);
    await user.type(description, "Alex, at home");
    const email = screen.getByRole("textbox", { name: "Email address" });
    await user.clear(email);
    await user.type(email, "alex@example.net{Enter}");
    await waitFor(
      () => expect(calls("UserMgmt.setUser")).toHaveLength(1),
      LONG,
    );
    expect(calls("UserMgmt.getUser")).toHaveLength(1);
    const sent = paramsOf("UserMgmt.setUser")[0];
    expect(sent).toMatchObject({
      name: "alex",
      comment: "Alex, at home",
      email: "alex@example.net",
      password: "",
      groups: expect.arrayContaining([
        "users",
        "openmediavault-admin",
        "family",
      ]),
    });
    expect(sent).not.toHaveProperty("uid");
    expect(
      (await screen.findAllByText(/Details of .?alex.? saved\./, {}, LONG))
        .length,
    ).toBeGreaterThan(0);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Edit details" }),
      ).toHaveFocus(),
    );
    expect(screen.getAllByText(/Saved, and already in effect/).length).toBe(1);
    await waitFor(
      () => expect(screen.getByText("Not applied yet")).toBeVisible(),
      LONG,
    );
  });

  it("refuses a colon and a second address in the browser", async () => {
    const { user } = await personPage("usersSome", "sam");
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      "a: b",
    );
    await user.click(screen.getByRole("button", { name: "Save details" }));
    expect(
      screen.getByText("A description cannot contain a colon or a line break."),
    ).toBeVisible();
    expect(calls("UserMgmt.setUser")).toHaveLength(0);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Edit details" })).toHaveFocus();
  });

  it("stops when the person changed elsewhere since the page read them", async () => {
    const { user } = await personPage("usersSome", "sam", {
      userMgmtGetUser: {
        status: 200,
        value: {
          name: "sam",
          uid: 1006,
          gid: 100,
          comment: "",
          dir: "/home/sam",
          shell: "/usr/sbin/nologin",
          groups: ["users", "kids"],
          system: false,
          email: "",
          disallowusermod: false,
          sshpubkeys: [],
        },
      },
    });
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      "Sam{Enter}",
    );
    expect(
      await screen.findByText(
        /was changed elsewhere since you opened this page/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(calls("UserMgmt.setUser")).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Show the current details" }),
    ).toBeVisible();
  });
});

describe("what they can do (3)", () => {
  it("warns when SSH is ticked, confirms in words, and sends _ssh with a login shell", async () => {
    const { user } = await personPage("usersSome", "sam");
    const can = section(/What .?sam.? can do/);
    const ssh = within(can).getByRole("checkbox", {
      name: "May sign in over SSH",
    });
    await waitFor(() => expect(ssh).not.toHaveAttribute("aria-disabled"), LONG);
    await user.click(ssh);
    expect(within(can).getByText(/can run programs on the NAS/)).toBeVisible();
    await user.click(within(can).getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/Change what .?sam.? can do\?/);
    expect(dialog).toHaveTextContent(
      /may sign in over SSH and use the NAS's command line/,
    );
    expect(dialog).toHaveTextContent("It does not wait for Apply.");
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(
      () => expect(calls("UserMgmt.setUser")).toHaveLength(1),
      LONG,
    );
    expect(paramsOf("UserMgmt.setUser")[0]).toMatchObject({
      name: "sam",
      groups: ["users", "_ssh"],
      shell: "/usr/bin/sh",
    });
    expect(
      (await screen.findAllByText(/sam.? may now sign in over SSH\./, {}, LONG))
        .length,
    ).toBeGreaterThan(0);
  });

  it("says when taking rights away leaves only the built-in admin", async () => {
    const { user } = await personPage("usersSome", "alex");
    const can = section(/What .?alex.? can do/);
    const admin = within(can).getByRole("checkbox", {
      name: "Administrator of this NAS",
    });
    await waitFor(
      () => expect(admin).not.toHaveAttribute("aria-disabled"),
      LONG,
    );
    await user.click(admin);
    await user.click(within(can).getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/is no longer an administrator/);
    expect(dialog).toHaveTextContent(
      "After this, the built-in admin account is the only administrator.",
    );
    // Administrator rights apply from the next sign-in (owner, 2026-11-22).
    expect(dialog).toHaveTextContent(
      "Applies from their next sign-in. If they are signed in now, ask them to sign out and in again.",
    );
    expect(dialog).not.toHaveTextContent("takes effect as soon as you save");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(calls("UserMgmt.setUser")).toHaveLength(0);
  });

  it("refuses SSH when the NAS has no _ssh group", async () => {
    await personPage("usersNoSshGroup", "sam");
    expect(
      await screen.findByText(
        "SSH sign-in cannot be set up here: the NAS has no group called _ssh.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: "May sign in over SSH" }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});

describe("the signed-in person (0.8)", () => {
  it("cannot take away their own rights, delete themselves, or set their password here", async () => {
    await personPage("usersSelf", "example-admin");
    expect(
      screen.getByText("This is the account you are signed in with."),
    ).toBeVisible();
    const admin = screen.getByRole("checkbox", {
      name: "Administrator of this NAS",
    });
    expect(admin).toBeChecked();
    expect(admin).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText(
        "You cannot take away your own administrator rights. Another administrator can.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Delete .?example-admin.?…/ }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText(
        "You cannot delete the account you are signed in with. Another administrator can.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Change your password" }),
    ).toHaveAttribute("href", "/ui/account/password");
    expect(
      screen.queryByRole("button", { name: "Set a new password…" }),
    ).not.toBeInTheDocument();
  });

  it("fails closed for every administrator when the reader is not known", async () => {
    await personPage("usersSelfUnknown", "alex");
    expect(
      screen.getByRole("checkbox", { name: "Administrator of this NAS" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getAllByText(/Could not tell which account you are signed in with/)
        .length,
    ).toBe(2);
    expect(
      screen.getByRole("button", { name: /Delete .?alex.?…/ }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});

describe("groups (4.1)", () => {
  it("sends the whole list, with every system group kept", async () => {
    const { user } = await personPage("usersSystemGroups", "alex");
    const groups = section("Groups");
    await user.click(
      await within(groups).findByRole("checkbox", { name: /kids/ }, LONG),
    );
    await user.click(
      within(groups).getByRole("button", { name: "Save groups" }),
    );
    await waitFor(
      () => expect(calls("UserMgmt.setUser")).toHaveLength(1),
      LONG,
    );
    const sent = paramsOf("UserMgmt.setUser")[0] as { groups: string[] };
    expect(sent.groups[0]).toBe("users");
    expect(sent.groups).toEqual(
      expect.arrayContaining(["sudo", "docker", "family", "kids"]),
    );
    expect(
      (await screen.findAllByText(/Groups of .?alex.? saved\./, {}, LONG))
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Computers that are connected now may need to connect again to use the new groups.",
      ),
    ).toBeVisible();
  });
});

describe("a new password (5, UI-6)", () => {
  it("closes on Escape, from a field or a reveal toggle (after its tooltip), and clears what was typed", async () => {
    const { user } = await personPage("usersSome", "sam");
    const open = screen.getByRole("button", { name: "Set a new password…" });
    for (const from of ["field", "toggle"] as const) {
      await user.click(open);
      const dialog = await screen.findByRole("dialog", {
        name: /Set a new password for/,
      });
      const first = within(dialog).getByLabelText("New password");
      await user.type(first, "Typed here");
      if (from === "toggle") {
        within(dialog)
          .getAllByRole("button", { name: "Show password" })[0]!
          .focus();
      }
      // On the toggle, the first Escape closes its tooltip, the next the dialog.
      await user.keyboard(from === "toggle" ? "{Escape}{Escape}" : "{Escape}");
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: /Set a new password for/ }),
        ).not.toBeInTheDocument(),
      );
      expect(open).toHaveFocus();
      expect(markupOf()).not.toContain("Typed here");
    }
    expect(calls("UserMgmt.setUser")).toHaveLength(0);
  });

  it("sets it, never shows it, and clears both fields", async () => {
    const storage = watchStorage();
    const { user } = await personPage("usersSome", "sam");
    const open = screen.getByRole("button", { name: "Set a new password…" });
    await user.click(open);
    const dialog = await screen.findByRole("dialog", {
      name: /Set a new password for/,
    });
    const first = within(dialog).getByLabelText("New password");
    const second = within(dialog).getByLabelText("Type it again");
    expect(first).toHaveAttribute("autocomplete", "new-password");
    expect(second).toHaveAttribute("autocomplete", "new-password");
    await user.type(first, " Secret one ");
    await user.type(second, " Secret two ");
    await user.click(
      within(dialog).getByRole("button", { name: "Set password" }),
    );
    expect(
      within(dialog).getByText("The two passwords are not the same."),
    ).toBeVisible();
    expect(calls("UserMgmt.setUser")).toHaveLength(0);
    await user.clear(second);
    await user.type(second, " Secret one ");
    await user.click(
      within(dialog).getByRole("button", { name: "Set password" }),
    );
    await waitFor(
      () => expect(calls("UserMgmt.setUser")).toHaveLength(1),
      LONG,
    );
    // Kept exactly as typed, spaces at the ends included.
    expect(paramsOf("UserMgmt.setUser")[0]).toMatchObject({
      name: "sam",
      password: " Secret one ",
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /Set a new password for/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      (
        await screen.findAllByText(
          /The password of .?sam.? is changed/,
          {},
          LONG,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(markupOf()).not.toContain("Secret");
    expect(window.location.href).not.toContain("Secret");
    expect(storage.wrote("Secret")).toBe(false);
    await waitFor(() => expect(open).toHaveFocus());
  });

  it("refuses a line break, and keeps the dialog with the server's words on a failure", async () => {
    const { user } = await personPage("usersSome", "sam", {
      userMgmtSetUser: "passwordLineBreak",
    });
    await user.click(
      screen.getByRole("button", { name: "Set a new password…" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /Set a new password for/,
    });
    await user.type(within(dialog).getByLabelText("New password"), "abc");
    await user.type(within(dialog).getByLabelText("Type it again"), "abc");
    await user.click(
      within(dialog).getByRole("button", { name: "Set password" }),
    );
    expect(
      await within(dialog).findByText(
        "The password was not changed.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("New password")).toHaveValue("");
    expect(within(dialog).getByLabelText("Type it again")).toHaveValue("");
    expect(within(dialog).getByLabelText("New password")).toHaveFocus();
  });
});
