// SPDX-License-Identifier: GPL-3.0-or-later
// Users > Groups on the remembering users mock (phase 5 users design 8): the table with its members and
// folder counts, the search and its filtered-empty state, the empty list, a failed read, side reads
// failing, a group called "add" without a link, and server text rendered as text (UI-2).
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { LONG } from "../../test/sharedFolderPage.ts";

async function groupsPage(
  scenario: Parameters<typeof renderApp>[0] extends infer O
    ? O extends { scenario?: infer S }
      ? S
      : never
    : never,
  answers: NonNullable<Parameters<typeof renderApp>[0]>["answers"] = {},
) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: "/usermgmt/groups",
    answers,
  });
  await screen.findByRole("heading", { level: 1, name: "Groups" }, LONG);
  return app;
}

const rowOf = async (group: string) => {
  const link = await screen.findByRole(
    "link",
    { name: `Open group ${group}` },
    LONG,
  );
  const row = link.closest("tr");
  if (row === null) {
    throw new Error("no row");
  }
  return row;
};

describe("the Groups list (8)", () => {
  it("lists each group with its members, description and the folders it can open", async () => {
    await groupsPage("usersSome");
    const family = await rowOf("family");
    expect(family).toHaveTextContent("Everyone at home");
    expect(family).toHaveTextContent(/2 members: .?alex.? and .?robin.?/);
    // Photos (Read and write) and Documents (Read only).
    expect(within(family).getAllByText("2").length).toBeGreaterThan(0);
    const kids = await rowOf("kids");
    expect(kids).toHaveTextContent(/1 member: .?robin.?/);
    expect(
      screen.getByRole("link", { name: "Open group family" }),
    ).toHaveAttribute("href", "/ui/usermgmt/groups/family");
    expect(screen.getByRole("link", { name: "Add a group" })).toHaveAttribute(
      "href",
      "/ui/usermgmt/groups/add",
    );
    expect(
      screen.getByRole("link", { name: /Groups in the classic interface/ }),
    ).toHaveAttribute("href", "/#/usermgmt/groups");
  });

  it("searches names, descriptions and members, and clears the search", async () => {
    const { user } = await groupsPage("usersSome");
    await rowOf("family");
    const search = screen.getByRole("searchbox", { name: "Search groups" });
    await user.type(search, "children");
    expect(
      screen.queryByRole("link", { name: "Open group family" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Open group kids" })).toBeVisible();
    await user.clear(search);
    await user.type(search, "zz");
    expect(screen.getByText('No groups match "zz".')).toBeVisible();
    // The empty state's own button (the search field has one too).
    const table = screen.getByRole("table", { name: "Groups" });
    await user.click(
      within(table).getByRole("button", { name: "Clear the search" }),
    );
    expect(search).toHaveFocus();
    expect(
      screen.getByRole("link", { name: "Open group family" }),
    ).toBeVisible();
  });

  it("says there are no groups yet, with Add a group", async () => {
    await groupsPage("usersNone");
    expect(
      await screen.findByText(/There are no groups yet\./, {}, LONG),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Add a group" })).toBeVisible();
  });

  it("says when the groups cannot be read, with the server's words", async () => {
    await groupsPage("usersSome", {
      userMgmtGetGroupList: { status: 500, message: "Groups are unreadable." },
    });
    expect(
      await screen.findByText("Could not read the groups.", {}, LONG),
    ).toBeVisible();
    expect(screen.getByText("Groups are unreadable.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("shows members by count and the folders as not known when those reads fail", async () => {
    await groupsPage("usersSome", {
      userMgmtGetUserList: { status: 500, message: "No people." },
      shareMgmtGetList: { status: 500, message: "No folders." },
    });
    const family = await rowOf("family");
    expect(family).toHaveTextContent("2 members");
    expect(family).not.toHaveTextContent("alex");
    expect(family).toHaveTextContent("Not known");
    expect(screen.getByText(/members are shown by count only/)).toBeVisible();
  });

  it("shows a group called add without a link, and its classic list", async () => {
    await groupsPage("usersSome", {
      userMgmtGetGroupList: {
        status: 200,
        value: {
          total: 2,
          data: [
            { name: "add", gid: 1010, members: [], system: false, comment: "" },
            {
              name: "markup",
              gid: 1011,
              members: [],
              system: false,
              comment: "<img src=x onerror=alert(1)>",
            },
          ],
        },
      },
    });
    await screen.findByRole("link", { name: "Open group markup" }, LONG);
    expect(screen.queryByRole("link", { name: "Open group add" })).toBeNull();
    expect(
      screen.getByText(/its name is also the address of “Add a group”/),
    ).toBeVisible();
    // Markup from the server stays text.
    expect(
      screen.getAllByText("<img src=x onerror=alert(1)>").length,
    ).toBeGreaterThan(0);
    expect(document.querySelector("img[src=x]")).toBeNull();
  });
});
